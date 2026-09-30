// «Шаблон обновился» на настоящей базе (D154, D155, T336): когда строка горит, когда
// гаснет, и что перенос отличий делает с черновиком копии. Смысл в SQL и в номерах
// версий, поэтому подмен нет.
import { afterAll, describe, expect, test } from "vitest";
import { and, eq } from "drizzle-orm";

import type { Section } from "@/blocks/data";
import { checklistVersions, checklists, getDb } from "@/blocks/data";
import { closeTestDb } from "@/blocks/data/testing/db";
import {
  createPublishedVersion,
  createStation,
} from "@/blocks/data/testing/fixtures";

import { createChecklist, loadEditor } from "./drafts";
import {
  dismissTemplateUpdate,
  loadTemplateOrigin,
  loadTemplateUpdate,
  takeTemplateChanges,
} from "./template-updates";
import { copyTemplateToStations, takeTemplate } from "./templates";

afterAll(closeTestDb);

const MORNING = { start: "06:00", end: "11:00" };

function sections(...items: [string, string][]): Section[] {
  return [
    {
      id: "open",
      title: { ru: "Открытие" },
      source: "own",
      items: items.map(([id, title]) => ({
        id,
        title: { ru: title },
        type: "bool",
      })),
    },
  ];
}

const V1 = sections(["a", "Свет"], ["b", "Печь"]);
const V2 = sections(["a", "Свет и вытяжка"], ["b", "Печь"], ["c", "Тесто"]);

/** Опубликовать следующую версию шаблона так, как это делает публикация: прежняя в архив. */
async function republish(
  templateId: string,
  content: Section[],
  number: number,
): Promise<void> {
  await getDb()
    .update(checklistVersions)
    .set({ status: "archived" })
    .where(
      and(
        eq(checklistVersions.checklistId, templateId),
        eq(checklistVersions.status, "published"),
      ),
    );
  await createPublishedVersion(templateId, content, number);
}

async function template(title: string): Promise<string> {
  const id = await createChecklist(
    { stationId: null, title: { ru: title }, window: MORNING },
    "template",
  );
  await createPublishedVersion(id, V1, 1);
  return id;
}

async function draftOf(checklistId: string): Promise<Section[] | undefined> {
  const [row] = await getDb()
    .select({ sections: checklistVersions.sections })
    .from(checklistVersions)
    .where(
      and(
        eq(checklistVersions.checklistId, checklistId),
        eq(checklistVersions.status, "draft"),
      ),
    );
  return row?.sections;
}

describe("строка происхождения копии", () => {
  test("свой чек-лист происхождения не имеет", async () => {
    const station = await createStation();
    const own = await createChecklist({
      stationId: station.stationId,
      title: { ru: "Свой" },
      window: MORNING,
    });
    expect(await loadTemplateOrigin(own)).toBeNull();
  });

  test("свежая копия называет шаблон и версию, обновления нет", async () => {
    const templateId = await template("Открытие смены");
    const copyId = await takeTemplate(templateId);

    expect(await loadTemplateOrigin(copyId)).toEqual({
      templateId,
      templateTitle: { ru: "Открытие смены" },
      sourceVersion: 1,
      latestVersion: 1,
      hasUpdate: false,
    });
  });

  test("шаблон ушёл вперёд — строка горит, и у копий раскатки тоже", async () => {
    const templateId = await template("Раскатка");
    const [one, two] = [await createStation(), await createStation()];
    await copyTemplateToStations(templateId, [one.stationId, two.stationId]);
    await republish(templateId, V2, 2);

    const copies = await getDb()
      .select({ id: checklists.id })
      .from(checklists)
      .where(eq(checklists.sourceChecklistId, templateId));
    expect(copies).toHaveLength(2);
    for (const copy of copies) {
      const origin = await loadTemplateOrigin(copy.id);
      expect(origin?.hasUpdate).toBe(true);
      expect(origin?.latestVersion).toBe(2);
    }
  });

  test("«оставить как есть» гасит строку до следующей версии, а не навсегда", async () => {
    const templateId = await template("Отклонение");
    const copyId = await takeTemplate(templateId);
    await republish(templateId, V2, 2);

    await dismissTemplateUpdate(copyId, 2);
    const dismissed = await loadTemplateOrigin(copyId);
    expect(dismissed?.hasUpdate).toBe(false);
    // Содержимое копии по-прежнему с первой версии, и строка обязана это говорить.
    expect(dismissed?.sourceVersion).toBe(1);

    await republish(templateId, sections(["a", "Свет"]), 3);
    expect((await loadTemplateOrigin(copyId))?.hasUpdate).toBe(true);
  });

  test("отклонить версию, которой у шаблона нет, нельзя", async () => {
    // Иначе присланное «99» заглушило бы строку на все будущие обновления разом.
    const templateId = await template("Будущее");
    const copyId = await takeTemplate(templateId);
    await republish(templateId, V2, 2);

    await dismissTemplateUpdate(copyId, 99);

    expect((await loadTemplateOrigin(copyId))?.hasUpdate).toBe(true);
  });
});

describe("отличия и перенос", () => {
  test("отличия считаются между версией копии и последней версией шаблона", async () => {
    const templateId = await template("Отличия");
    const copyId = await takeTemplate(templateId);
    await republish(templateId, V2, 2);

    const update = await loadTemplateUpdate(copyId);

    expect(update?.changes.map((one) => [one.kind, one.itemId])).toEqual([
      ["changed", "a"],
      ["added", "c"],
    ]);
  });

  test("взятое ложится в черновик копии, копия помнит новую версию, публикации нет", async () => {
    const templateId = await template("Перенос");
    const station = await createStation();
    await copyTemplateToStations(templateId, [station.stationId]);
    const [copy] = await getDb()
      .select({ id: checklists.id })
      .from(checklists)
      .where(eq(checklists.sourceChecklistId, templateId));
    const copyId = copy?.id ?? "";
    await republish(templateId, V2, 2);

    const outcome = await takeTemplateChanges(copyId, 2, ["c"]);

    expect(outcome).toBe("taken");
    const draft = await draftOf(copyId);
    expect(draft?.[0]?.items.map((one) => one.id)).toEqual(["a", "b", "c"]);
    // Невзятое изменение «a» осталось, каким было в копии.
    expect(draft?.[0]?.items[0]?.title).toEqual({ ru: "Свет" });

    const origin = await loadTemplateOrigin(copyId);
    expect(origin?.sourceVersion).toBe(2);
    expect(origin?.hasUpdate).toBe(false);

    const published = await getDb()
      .select({ number: checklistVersions.versionNumber })
      .from(checklistVersions)
      .where(
        and(
          eq(checklistVersions.checklistId, copyId),
          eq(checklistVersions.status, "published"),
        ),
      );
    expect(published).toEqual([{ number: 1 }]);
  });

  test("перенос ложится поверх черновика страны, а не поверх шаблона", async () => {
    const templateId = await template("Поверх");
    const copyId = await takeTemplate(templateId);
    await getDb()
      .update(checklistVersions)
      .set({ sections: sections(["b", "Печь"], ["x", "Своё"]) })
      .where(
        and(
          eq(checklistVersions.checklistId, copyId),
          eq(checklistVersions.status, "draft"),
        ),
      );
    await republish(templateId, V2, 2);

    await takeTemplateChanges(copyId, 2, ["a", "c"]);

    const draft = await draftOf(copyId);
    expect(draft?.[0]?.items.map((one) => one.id)).toEqual([
      "a",
      "b",
      "c",
      "x",
    ]);
  });

  test("вкладка отстала: шаблон ушёл дальше — перенос отказывает и ничего не пишет", async () => {
    const templateId = await template("Отстала");
    const copyId = await takeTemplate(templateId);
    await republish(templateId, V2, 2);
    await republish(templateId, sections(["a", "Свет"]), 3);

    const outcome = await takeTemplateChanges(copyId, 2, ["c"]);

    expect(outcome).toBe("stale");
    expect((await draftOf(copyId))?.[0]?.items.map((one) => one.id)).toEqual([
      "a",
      "b",
    ]);
    expect((await loadTemplateOrigin(copyId))?.sourceVersion).toBe(1);
  });

  test("у шаблона и своего чек-листа отличий нет — перенос отказывает", async () => {
    const templateId = await template("Не копия");
    expect(await loadTemplateUpdate(templateId)).toBeNull();
    expect(await takeTemplateChanges(templateId, 1, [])).toBe("stale");
    expect(await takeTemplateChanges("не-uuid", 1, [])).toBe("stale");
  });
});

describe("копия раскатки в редакторе", () => {
  test("открывается с пунктами шаблона, а не пустой", async () => {
    // Редактор правит черновик: копия, у которой была только публикация, открывалась
    // без единого пункта, хотя на станции полна.
    const templateId = await template("Раскатка в редакторе");
    const station = await createStation();
    await copyTemplateToStations(templateId, [station.stationId]);
    const [copy] = await getDb()
      .select({ id: checklists.id })
      .from(checklists)
      .where(eq(checklists.sourceChecklistId, templateId));

    const state = await loadEditor(copy?.id ?? "");

    expect(state?.sections[0]?.items.map((one) => one.id)).toEqual(["a", "b"]);
  });
});
