// Происхождение чек-листа на карточке станции читается из настоящей базы.
//
// Надпись «копия шаблона X, версия N» человек принимает за факт: по ней решают, свежая ли
// копия и откуда её править. Неверная надпись не падает — она просто говорит неправду,
// поэтому стык с базой (самосоединение `checklists` на источник) проверяется здесь, а не
// заглушкой, которая вернула бы то, что в неё положили.
import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { checklists } from "@/blocks/data";
import { getTestDb } from "@/blocks/data/testing/db";
import { createChecklist, createStation } from "@/blocks/data/testing/fixtures";
import { WHOLE_NETWORK } from "@/blocks/auth/scope";

import { getStationDetail } from "./detail";

const TEMPLATE_VERSION = 3;

async function createTemplate(title: Record<string, string>): Promise<string> {
  const id = await createChecklist({ title });
  await getTestDb()
    .update(checklists)
    .set({ isTemplate: true })
    .where(eq(checklists.id, id));
  return id;
}

describe("карточка станции: происхождение чек-листа", () => {
  test("копия называет свой шаблон и версию, местный чек-лист — местный", async () => {
    const { stationId } = await createStation();
    const templateId = await createTemplate({
      ru: "Открытие смены",
      en: "Shift opening",
    });
    const copyId = await createChecklist({ stationId });
    await getTestDb()
      .update(checklists)
      .set({ sourceChecklistId: templateId, sourceVersion: TEMPLATE_VERSION })
      .where(eq(checklists.id, copyId));
    const localId = await createChecklist({ stationId });

    const detail = await getStationDetail(stationId, WHOLE_NETWORK);
    const copy = detail?.checklists.find((one) => one.id === copyId);
    const local = detail?.checklists.find((one) => one.id === localId);

    expect(copy?.origin).toEqual({
      kind: "copy",
      templateTitle: { ru: "Открытие смены", en: "Shift opening" },
      version: TEMPLATE_VERSION,
    });
    expect(local?.origin).toEqual({ kind: "local" });
  });

  // Удалённый шаблон снимает ссылку (`on delete set null`), номер версии при этом
  // остаётся. Назвать такую копию «копией шаблона» было бы нечем — названия нет, — а
  // упасть на полупустой ссылке значило бы сломать карточку из-за чужого удаления.
  test("копия удалённого шаблона называется местной, а не падает", async () => {
    const { stationId } = await createStation();
    const orphanId = await createChecklist({ stationId });
    await getTestDb()
      .update(checklists)
      .set({ sourceChecklistId: null, sourceVersion: TEMPLATE_VERSION })
      .where(eq(checklists.id, orphanId));

    const detail = await getStationDetail(stationId, WHOLE_NETWORK);

    expect(detail?.checklists[0]?.origin).toEqual({ kind: "local" });
  });
});
