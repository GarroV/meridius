// Шаблоны на настоящей базе: заведение, перечень раздела и «взять к себе без станции»
// (T309). Смысл здесь в SQL и в ограничениях базы, поэтому подмен нет.
import { afterAll, describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";

import { checklistVersions, checklists, getDb } from "@/blocks/data";
import { closeTestDb } from "@/blocks/data/testing/db";
import {
  createPublishedVersion,
  createStation,
  sampleSections,
} from "@/blocks/data/testing/fixtures";

import { createChecklist } from "./drafts";
import { listTemplateCards, takeTemplate } from "./templates";

afterAll(closeTestDb);

const MORNING = { start: "06:00", end: "11:00" };

async function publishedTemplate(title: string): Promise<string> {
  const id = await createChecklist(
    { stationId: null, title: { ru: title }, window: MORNING },
    "template",
  );
  // Первая версия уже в архиве, опубликована вторая: копия обязана снять последнюю.
  await getDb()
    .insert(checklistVersions)
    .values({
      checklistId: id,
      status: "archived",
      versionNumber: 1,
      sections: sampleSections(title),
      publishedAt: new Date(),
    });
  await createPublishedVersion(id, sampleSections(`${title} v2`), 2);
  return id;
}

async function checklistRow(id: string) {
  const [row] = await getDb()
    .select()
    .from(checklists)
    .where(eq(checklists.id, id));
  return row;
}

describe("заведение шаблона", () => {
  test("шаблон заводится шаблоном и без станции, даже если станцию прислали", async () => {
    // Поле станции у шаблона спрятано, но форма — граница: присланная станция не
    // должна ни привязать шаблон, ни уронить заведение отказом базы.
    const station = await createStation();
    const id = await createChecklist(
      {
        stationId: station.stationId,
        title: { ru: "Шаблон со станцией в запросе" },
        window: MORNING,
      },
      "template",
    );

    const row = await checklistRow(id);
    expect(row?.isTemplate).toBe(true);
    expect(row?.stationId).toBeNull();
  });
});

describe("перечень шаблонов", () => {
  test("в разделе и опубликованные шаблоны, и черновые, но не обычные чек-листы", async () => {
    // Черновой шаблон в разделе нужен: иначе методист УК заводит шаблон, уходит на
    // «Шаблоны» и не находит его, пока не опубликует, — а открыть, чтобы опубликовать,
    // ему неоткуда.
    const published = await publishedTemplate("Опубликованный шаблон");
    const draftOnly = await createChecklist(
      { stationId: null, title: { ru: "Черновой шаблон" }, window: MORNING },
      "template",
    );
    const plain = await createChecklist({
      stationId: null,
      title: { ru: "Не шаблон" },
      window: MORNING,
    });

    const cards = await listTemplateCards();
    const byId = new Map(cards.map((card) => [card.id, card]));

    expect(byId.get(published)?.publishedNumber).toBe(2);
    expect(byId.get(published)?.itemCount).toBe(
      sampleSections("x").flatMap((section) => section.items).length,
    );
    expect(byId.get(published)?.publishedAt).toBeInstanceOf(Date);
    expect(byId.get(draftOnly)?.publishedNumber).toBeNull();
    expect(byId.has(plain)).toBe(false);
  });
});

describe("взять шаблон к себе без станции", () => {
  test("получается черновая копия последней версии, которая помнит источник", async () => {
    // Черновая, а не опубликованная: опубликованная версия замораживает станцию
    // (принцип 3), и копия, опубликованная «никуда», осталась бы никуда и после того,
    // как методист выбрал бы ей станцию в свойствах.
    const templateId = await publishedTemplate("Шаблон к себе");

    const copyId = await takeTemplate(templateId);

    const copy = await checklistRow(copyId);
    expect(copy?.isTemplate).toBe(false);
    expect(copy?.stationId).toBeNull();
    expect(copy?.sourceChecklistId).toBe(templateId);
    expect(copy?.sourceVersion).toBe(2);
    expect(copy?.title).toEqual({ ru: "Шаблон к себе" });

    const versions = await getDb()
      .select()
      .from(checklistVersions)
      .where(eq(checklistVersions.checklistId, copyId));
    expect(versions).toHaveLength(1);
    expect(versions[0]?.status).toBe("draft");
    expect(versions[0]?.sections).toEqual(sampleSections("Шаблон к себе v2"));
  });

  test("не шаблон взять шаблоном нельзя", async () => {
    const plain = await createChecklist({
      stationId: null,
      title: { ru: "Обычный" },
      window: MORNING,
    });

    await expect(takeTemplate(plain)).rejects.toThrow();
  });

  test("неопубликованный шаблон взять нельзя: копировать нечем", async () => {
    const draftOnly = await createChecklist(
      { stationId: null, title: { ru: "Не готов" }, window: MORNING },
      "template",
    );

    await expect(takeTemplate(draftOnly)).rejects.toThrow();
  });
});
