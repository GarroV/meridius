// «Сделать шаблоном» на настоящей базе (D174): из чек-листа станции — шаблон без станции
// и страны, а сам чек-лист становится копией этого шаблона. Смысл в SQL и в
// ограничениях базы, поэтому подмен нет.
import { afterAll, describe, expect, test } from "vitest";
import { and, eq, sql } from "drizzle-orm";

import { checklistVersions, checklists, getDb } from "@/blocks/data";
import { partnerViewer } from "@/blocks/auth/testing/viewers";
import { closeTestDb } from "@/blocks/data/testing/db";
import {
  createChecklist,
  createDraft,
  createPublishedVersion,
  createStation,
  sampleSections,
} from "@/blocks/data/testing/fixtures";

import {
  listTemplateCandidates,
  makeTemplateFromChecklist,
  MakeTemplateError,
} from "./make-template";
import { listTemplateCards, takeTemplate } from "./templates";

afterAll(closeTestDb);

async function checklistRow(id: string) {
  const [row] = await getDb()
    .select()
    .from(checklists)
    .where(eq(checklists.id, id));
  return row;
}

async function versionsOf(checklistId: string) {
  return getDb()
    .select()
    .from(checklistVersions)
    .where(eq(checklistVersions.checklistId, checklistId));
}

async function stationChecklist(label: string): Promise<string> {
  const station = await createStation();
  const id = await createChecklist({
    stationId: station.stationId,
    title: { ru: label, en: `${label} en` },
    windowStart: "08:00:00",
    windowEnd: "03:00:00",
  });
  // Первая версия ушла в архив, опубликована вторая: шаблон обязан снять последнюю.
  await getDb()
    .insert(checklistVersions)
    .values({
      checklistId: id,
      status: "archived",
      versionNumber: 1,
      stationId: station.stationId,
      sections: sampleSections(`${label} v1`),
      publishedAt: new Date(),
    });
  await createPublishedVersion(id, sampleSections(`${label} v2`), 2);
  return id;
}

async function refusal(promise: Promise<unknown>): Promise<string> {
  const error: unknown = await promise.catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(MakeTemplateError);
  return (error as MakeTemplateError).reason;
}

describe("сделать шаблоном", () => {
  test("чек-лист тенанта партнёра шаблоном УК не становится — отказ, ничего не записано (D183 п.8)", async () => {
    const station = await createStation();
    const partner = await partnerViewer([station.countryId]);
    const label = `Чужая кухня ${station.stationId.slice(0, 8)}`;
    const source = await createChecklist({
      stationId: station.stationId,
      tenantId: partner.tenantId,
      title: { ru: label, en: label },
    });
    await createPublishedVersion(source, sampleSections(label), 1);

    expect(await refusal(makeTemplateFromChecklist(source))).toBe(
      "foreignTenant",
    );
    // Шаблона с этим названием нет: счёт всех шаблонов здесь не годится — соседние
    // файлы прогона заводят свои шаблоны параллельно.
    const templates = await getDb()
      .select({ id: checklists.id })
      .from(checklists)
      .where(
        and(
          eq(checklists.isTemplate, true),
          sql`${checklists.title} ->> 'ru' = ${label}`,
        ),
      );
    expect(templates).toEqual([]);
    expect((await checklistRow(source))?.sourceChecklistId).toBeNull();
    // И пачка скрипта его не предлагает: в кандидатах ровно те, кого примет действие.
    const candidates = await listTemplateCandidates(station.storeId);
    expect(candidates.map((row) => row.checklistId)).not.toContain(source);
  });

  test("шаблон без станции, с последней опубликованной версией чек-листа", async () => {
    const source = await stationChecklist("Касса и зал");

    const templateId = await makeTemplateFromChecklist(source);

    const template = await checklistRow(templateId);
    expect(template?.isTemplate).toBe(true);
    expect(template?.stationId).toBeNull();
    expect(template?.title).toEqual({
      ru: "Касса и зал",
      en: "Касса и зал en",
    });
    expect(template?.windowStart).toBe("08:00:00");
    expect(template?.windowEnd).toBe("03:00:00");

    const versions = await versionsOf(templateId);
    expect(versions).toHaveLength(1);
    expect(versions[0]?.status).toBe("published");
    expect(versions[0]?.versionNumber).toBe(1);
    expect(versions[0]?.stationId).toBeNull();
    expect(versions[0]?.sections).toEqual(sampleSections("Касса и зал v2"));
  });

  test("чек-лист становится копией шаблона первой версии и остаётся на станции", async () => {
    const source = await stationChecklist("Приёмка курьеров");
    const stationBefore = (await checklistRow(source))?.stationId;

    const templateId = await makeTemplateFromChecklist(source);

    const row = await checklistRow(source);
    expect(row?.sourceChecklistId).toBe(templateId);
    expect(row?.sourceVersion).toBe(1);
    expect(row?.stationId).toBe(stationBefore);
    expect(row?.isTemplate).toBe(false);
    // Опубликованное на станции не тронуто: сотрудник видит то же, что видел.
    const published = (await versionsOf(source)).filter(
      (v) => v.status === "published",
    );
    expect(published).toHaveLength(1);
    expect(published[0]?.versionNumber).toBe(2);
  });

  test("шаблон появляется в разделе и берётся к себе как любой другой", async () => {
    const source = await stationChecklist("Тестоцех");

    const templateId = await makeTemplateFromChecklist(source);

    const cards = await listTemplateCards();
    expect(cards.map((card) => card.id)).toContain(templateId);
    const copyId = await takeTemplate(templateId);
    expect((await checklistRow(copyId))?.sourceChecklistId).toBe(templateId);
  });

  test("второй раз из того же чек-листа — отказ, второго шаблона нет", async () => {
    const source = await stationChecklist("Холодный цех");
    await makeTemplateFromChecklist(source);
    const before = (await listTemplateCards()).length;

    expect(await refusal(makeTemplateFromChecklist(source))).toBe(
      "alreadyFromTemplate",
    );
    expect((await listTemplateCards()).length).toBe(before);
  });

  test("копия шаблона шаблоном не становится: у неё уже есть источник", async () => {
    const template = await stationChecklist("Горячий цех");
    const templateId = await makeTemplateFromChecklist(template);
    const copyId = await takeTemplate(templateId);

    expect(await refusal(makeTemplateFromChecklist(copyId))).toBe(
      "alreadyFromTemplate",
    );
  });

  test("без опубликованной версии — отказ, а не пустой шаблон", async () => {
    const station = await createStation();
    const id = await createChecklist({ stationId: station.stationId });
    await createDraft(id, sampleSections("только черновик"));
    const before = (await listTemplateCards()).length;

    expect(await refusal(makeTemplateFromChecklist(id))).toBe(
      "noPublishedVersion",
    );
    expect((await listTemplateCards()).length).toBe(before);
    expect((await checklistRow(id))?.sourceChecklistId).toBeNull();
  });

  test("шаблон, снятый с работы чек-лист и чужая строка — «такого чек-листа нет»", async () => {
    const source = await stationChecklist("Детская комната");
    const templateId = await makeTemplateFromChecklist(source);
    expect(await refusal(makeTemplateFromChecklist(templateId))).toBe(
      "notChecklist",
    );

    const archived = await stationChecklist("Снятый");
    await getDb()
      .update(checklists)
      .set({ archivedAt: new Date() })
      .where(eq(checklists.id, archived));
    expect(await refusal(makeTemplateFromChecklist(archived))).toBe(
      "notChecklist",
    );

    expect(await refusal(makeTemplateFromChecklist("не-uuid"))).toBe(
      "notChecklist",
    );
    expect(
      await refusal(
        makeTemplateFromChecklist("00000000-0000-4000-8000-000000000000"),
      ),
    ).toBe("notChecklist");
  });

  test("кандидаты пачки — опубликованные чек-листы пиццерии без источника", async () => {
    const station = await createStation();
    const published = await createChecklist({
      stationId: station.stationId,
      title: { ru: "Кандидат", en: "Candidate" },
      windowStart: "08:00:00",
      windowEnd: "20:00:00",
    });
    await createPublishedVersion(published, sampleSections("кандидат"), 1);
    const draftOnly = await createChecklist({
      stationId: station.stationId,
      title: { ru: "Только черновик", en: "Draft only" },
      windowStart: "08:00:00",
      windowEnd: "20:00:00",
    });
    await createDraft(draftOnly, sampleSections("черновик"));

    const ids = async () =>
      (await listTemplateCandidates(station.storeId)).map(
        (row) => row.checklistId,
      );
    expect(await ids()).toEqual([published]);

    // Ставший копией шаблона кандидатом быть перестаёт — повторный прогон пачки пуст.
    await makeTemplateFromChecklist(published);
    expect(await ids()).toEqual([]);

    expect(await listTemplateCandidates("не-uuid")).toEqual([]);
  });
});
