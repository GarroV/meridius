// «Где используется» (T030): в каких чек-листах блок вставлен и что затронет его правка.
//
// Считается по живому: черновик и текущая опубликованная версия. Архивные версии сюда
// не входят намеренно — они уже не меняются и ни на одной станции не открываются, а
// обещание «правка затронет» относится к тому, что ещё может измениться.
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, test } from "vitest";

import type { Item, Section } from "@/blocks/data";
import { checklists } from "@/blocks/data";
import { closeTestDb, getTestDb } from "@/blocks/data/testing/db";
import { createStation } from "@/blocks/data/testing/fixtures";
import { createChecklist, saveDraft } from "@/blocks/editor/drafts";
import { publish } from "@/blocks/editor/publish";

import { createBlock, saveBlock } from "./blocks";
import { listUsages, usageImpact } from "./usages";

const db = getTestDb();

afterAll(closeTestDb);

const MORNING = { start: "06:00", end: "11:00" };

function uniqueTitle(label: string): Record<string, string> {
  return { ru: `${label} ${crypto.randomUUID().slice(0, 8)}` };
}

function ownItem(label: string): Item {
  return {
    id: crypto.randomUUID(),
    title: { ru: `Пункт ${label}` },
    type: "bool",
    severity: "normal",
  };
}

function ownSection(label: string): Section {
  return {
    id: crypto.randomUUID(),
    title: { ru: `Секция ${label}` },
    source: "own",
    items: [ownItem(label)],
  };
}

function linkedSection(blockId: string): Section {
  return {
    id: crypto.randomUUID(),
    title: { ru: "Холодильники" },
    source: { blockId },
    items: [],
  };
}

/** Чек-лист со станцией: «где используется» показывает путь до неё, а не голое название. */
async function newChecklist(
  title: Record<string, string>,
): Promise<{ checklistId: string; storeId: string }> {
  const station = await createStation();
  const checklistId = await createChecklist({
    stationId: station.stationId,
    title,
    window: MORNING,
  });
  return { checklistId, storeId: station.storeId };
}

/** Блок с пунктом: пустой блок опубликовать нельзя — публиковать было бы нечего. */
async function newBlockWithItems(label: string): Promise<string> {
  const title = uniqueTitle(label);
  const blockId = await createBlock(title);
  await saveBlock(blockId, { title, items: [ownItem(label)] });
  return blockId;
}

describe("где используется", () => {
  test("блок, не вставленный никуда, не используется нигде", async () => {
    const blockId = await newBlockWithItems("Одинокий");

    const usages = await listUsages(blockId);

    expect(usages).toStrictEqual([]);
    expect(usageImpact(usages)).toStrictEqual({
      checklists: 0,
      drafts: 0,
      published: 0,
    });
  });

  test("вставленный в черновик блок виден со станцией и пиццерией", async () => {
    const blockId = await newBlockWithItems("Холодильники");
    const title = uniqueTitle("Открытие кухни");
    const { checklistId } = await newChecklist(title);
    await saveDraft(checklistId, [linkedSection(blockId)]);

    const usages = await listUsages(blockId);

    expect(usages).toHaveLength(1);
    expect(usages[0]).toMatchObject({
      checklistId,
      title,
      draft: true,
      published: false,
    });
    expect(usages[0]?.station).not.toBeNull();
    expect(usages[0]?.store).not.toBeNull();
  });

  test("после публикации тот же чек-лист помечен опубликованным", async () => {
    const blockId = await newBlockWithItems("Санитария");
    const { checklistId } = await newChecklist(uniqueTitle("Закрытие кухни"));
    await saveDraft(checklistId, [linkedSection(blockId), ownSection("свой")]);
    await publish(checklistId);

    const usages = await listUsages(blockId);

    // Черновик остаётся после публикации — правка блока придёт и в него.
    expect(usages[0]).toMatchObject({
      checklistId,
      draft: true,
      published: true,
    });
    expect(usageImpact(usages)).toStrictEqual({
      checklists: 1,
      drafts: 1,
      published: 1,
    });
  });

  test("блок, убранный из черновика после публикации, больше не используется", async () => {
    // Архивная версия его помнит, но она уже не меняется и никуда не отдаётся:
    // называть её «затронутой правкой» было бы неправдой.
    const blockId = await newBlockWithItems("Убранный");
    const { checklistId } = await newChecklist(uniqueTitle("Ночная проверка"));
    await saveDraft(checklistId, [linkedSection(blockId)]);
    await publish(checklistId);

    await saveDraft(checklistId, [ownSection("вместо блока")]);
    await publish(checklistId);

    expect(await listUsages(blockId)).toStrictEqual([]);
  });

  test("снятый с работы чек-лист из списка использования уходит", async () => {
    const blockId = await newBlockWithItems("Снятый");
    const { checklistId } = await newChecklist(uniqueTitle("Старый чек-лист"));
    await saveDraft(checklistId, [linkedSection(blockId)]);
    expect(await listUsages(blockId)).toHaveLength(1);

    await db
      .update(checklists)
      .set({ archivedAt: new Date() })
      .where(eq(checklists.id, checklistId));

    expect(await listUsages(blockId)).toStrictEqual([]);
  });

  test("сводка правки: сколько черновиков и сколько опубликованных версий", async () => {
    const blockId = await newBlockWithItems("Общий");
    const opened = await newChecklist(uniqueTitle("Опубликованный"));
    const drafted = await newChecklist(uniqueTitle("Только черновик"));

    await saveDraft(opened.checklistId, [linkedSection(blockId)]);
    await publish(opened.checklistId);
    await saveDraft(drafted.checklistId, [linkedSection(blockId)]);

    const usages = await listUsages(blockId);

    expect(usages).toHaveLength(2);
    expect(usageImpact(usages)).toStrictEqual({
      checklists: 2,
      drafts: 2,
      published: 1,
    });
  });

  test("опознаватель не uuid не доезжает до запроса", async () => {
    expect(await listUsages("' or 1=1 --")).toStrictEqual([]);
  });
});
