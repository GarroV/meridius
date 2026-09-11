// T029 и критерий готовности 1 блока: правка блока приходит ВО ВСЕ черновики, где он
// вставлен, и не меняет НИ ОДНОЙ опубликованной версии.
//
// Это главное обещание библиотеки и одновременно граница, за которую ей нельзя (принцип 3,
// D002): переиспользование не имеет права переписывать историю. Проверяется не «по коду»,
// а сравнением строк версий до и после правки — целиком, побайтово, включая архивные.
// Отдельно проверяется то, что видит станция: по опубликованной ссылке приходят прежние
// пункты, а не свежие из библиотеки.
import { inArray } from "drizzle-orm";
import { afterAll, describe, expect, test } from "vitest";

import type { Item, Section } from "@/blocks/data";
import {
  checklistVersions,
  getPublishedVersionForStation,
} from "@/blocks/data";
import { closeTestDb, getTestDb } from "@/blocks/data/testing/db";
import { createStation } from "@/blocks/data/testing/fixtures";
import { createChecklist, loadEditor, saveDraft } from "@/blocks/editor/drafts";
import { publish } from "@/blocks/editor/publish";

import { createBlock, saveBlock } from "./blocks";

const db = getTestDb();

afterAll(closeTestDb);

const MORNING = { start: "06:00", end: "11:00" };
/** Момент внутри окна: по нему станция получает опубликованную версию. */
const AT_MORNING = new Date("2026-09-10T08:00:00Z");

function uniqueTitle(label: string): Record<string, string> {
  return { ru: `${label} ${crypto.randomUUID().slice(0, 8)}` };
}

function blockItem(label: string): Item {
  return {
    id: `item-${label}`,
    title: { ru: `Пункт ${label}`, en: `Item ${label}` },
    type: "bool",
    severity: "normal",
  };
}

function linkedSection(blockId: string): Section {
  return {
    id: crypto.randomUUID(),
    title: { ru: "Холодильники", en: "Refrigerators" },
    source: { blockId },
    items: [],
  };
}

interface Checklist {
  id: string;
  stationCode: string;
}

async function newChecklistWithBlock(
  label: string,
  blockId: string,
): Promise<Checklist> {
  const station = await createStation();
  const id = await createChecklist({
    stationId: station.stationId,
    title: uniqueTitle(label),
    window: MORNING,
  });
  await saveDraft(id, [linkedSection(blockId)]);
  return { id, stationCode: station.stationCode };
}

/** Все версии перечисленных чек-листов, кроме черновиков: то, что меняться не имеет права. */
async function frozenVersions(
  checklistIds: readonly string[],
): Promise<Record<string, unknown>[]> {
  const rows = await db
    .select()
    .from(checklistVersions)
    .where(inArray(checklistVersions.checklistId, [...checklistIds]));
  return rows
    .filter((row) => row.status !== "draft")
    .map((row) => ({ ...row }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

/** Пункты первой секции черновика — то, что методист видит на экране редактора. */
async function draftItems(checklistId: string): Promise<Item[] | undefined> {
  const state = await loadEditor(checklistId);
  return state?.sections[0]?.items;
}

describe("правка блока библиотеки", () => {
  test("приходит во все черновики и не меняет ни одной опубликованной версии", async () => {
    const title = uniqueTitle("Холодильники");
    const blockId = await createBlock(title);
    await saveBlock(blockId, { title, items: [blockItem("первый")] });

    // Три разных положения одного блока: опубликован дважды, опубликован однажды,
    // не опубликован вовсе. Правка обязана вести себя одинаково во всех трёх.
    const twice = await newChecklistWithBlock("Открытие кухни", blockId);
    await publish(twice.id);
    await publish(twice.id);
    const once = await newChecklistWithBlock("Закрытие кухни", blockId);
    await publish(once.id);
    const draftOnly = await newChecklistWithBlock("Приёмка", blockId);

    const checklistIds = [twice.id, once.id, draftOnly.id];
    const before = await frozenVersions(checklistIds);
    // Три версии у первого (v1 архивная, v2 опубликованная) плюс одна у второго:
    // без этой строки тест мог бы сравнивать пустоту с пустотой и быть зелёным обманом.
    expect(before).toHaveLength(3);
    const stationSawBefore = await getPublishedVersionForStation(
      once.stationCode,
      AT_MORNING,
    );
    expect(stationSawBefore?.version.sections[0]?.items).toStrictEqual([
      blockItem("первый"),
    ]);

    await saveBlock(blockId, { title, items: [blockItem("второй")] });

    // 1. Правка пришла во ВСЕ черновики, где блок вставлен.
    for (const checklistId of checklistIds) {
      expect(await draftItems(checklistId)).toStrictEqual([
        blockItem("второй"),
      ]);
    }

    // 2. Ни одна опубликованная или архивная версия не изменилась.
    expect(await frozenVersions(checklistIds)).toStrictEqual(before);

    // 3. И станция по-прежнему получает то, что было опубликовано, а не свежее из библиотеки.
    const stationSeesAfter = await getPublishedVersionForStation(
      once.stationCode,
      AT_MORNING,
    );
    expect(stationSeesAfter?.version.sections[0]?.items).toStrictEqual([
      blockItem("первый"),
    ]);
  });

  test("следующая публикация уносит в новую версию свежий снимок блока", async () => {
    // Обратная сторона того же правила: правка не переписывает опубликованное, но и
    // не теряется — она доезжает до станции ровно тогда, когда методист публикует.
    const title = uniqueTitle("Санитария");
    const blockId = await createBlock(title);
    await saveBlock(blockId, { title, items: [blockItem("до")] });
    const checklist = await newChecklistWithBlock("Ночная проверка", blockId);
    await publish(checklist.id);

    await saveBlock(blockId, { title, items: [blockItem("после")] });
    await publish(checklist.id);

    const published = await getPublishedVersionForStation(
      checklist.stationCode,
      AT_MORNING,
    );
    expect(published?.version.sections[0]?.items).toStrictEqual([
      blockItem("после"),
    ]);
    expect(published?.version.versionNumber).toBe(2);
  });
});
