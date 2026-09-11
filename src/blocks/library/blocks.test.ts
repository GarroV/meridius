// Библиотека переиспользуемых блоков: заведение, правка, список (T027).
//
// Тесты идут на настоящем PostgreSQL: счётчик использования и число пунктов считает база
// по JSONB, и заглушка проверила бы не то, что работает в продукте.
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, test } from "vitest";

import type { Item } from "@/blocks/data";
import { blocks } from "@/blocks/data";
import { closeTestDb, getTestDb } from "@/blocks/data/testing/db";

import { createBlock, getBlock, listBlocks, saveBlock } from "./blocks";

const db = getTestDb();

afterAll(closeTestDb);

function item(label: string): Item {
  return {
    id: `item-${label}`,
    title: { ru: `Пункт ${label}`, en: `Item ${label}` },
    type: "bool",
    severity: "normal",
  };
}

/** Уникальное название: файлы тестов идут параллельно и общей очистки таблиц нет. */
function uniqueTitle(label: string): Record<string, string> {
  return { ru: `${label} ${crypto.randomUUID().slice(0, 8)}` };
}

describe("библиотека блоков", () => {
  test("заведённый блок находится по опознавателю и хранит название", async () => {
    const title = uniqueTitle("Холодильники");

    const id = await createBlock(title);

    expect(await getBlock(id)).toStrictEqual({ id, title, items: [] });
  });

  test("новый блок заводится пустым: пункты добавляются правкой", async () => {
    const id = await createBlock(uniqueTitle("Санитария"));

    const row = await db.select().from(blocks).where(eq(blocks.id, id));
    expect(row[0]?.items).toStrictEqual([]);
  });

  test("правка блока сохраняет название и пункты", async () => {
    const id = await createBlock(uniqueTitle("Закрытие кассы"));
    const renamed = uniqueTitle("Закрытие смены");

    await saveBlock(id, { title: renamed, items: [item("касса")] });

    expect(await getBlock(id)).toStrictEqual({
      id,
      title: renamed,
      items: [item("касса")],
    });
  });

  test("правка отмечается временем сервера, а не устройства", async () => {
    const id = await createBlock(uniqueTitle("Приёмка"));
    const before = (await db.select().from(blocks).where(eq(blocks.id, id)))[0]
      ?.updatedAt;

    await saveBlock(id, { title: uniqueTitle("Приёмка"), items: [] });

    const after = (await db.select().from(blocks).where(eq(blocks.id, id)))[0]
      ?.updatedAt;
    expect(before).toBeInstanceOf(Date);
    expect(after).toBeInstanceOf(Date);
    expect(after?.getTime()).toBeGreaterThanOrEqual(before?.getTime() ?? 0);
  });

  test("блок без названия не заводится: список показал бы безымянную строку", async () => {
    await expect(createBlock({})).rejects.toMatchObject({
      code: "emptyTitle",
    });
  });

  test("правка неизвестного блока — отказ, а не тихое ничего", async () => {
    await expect(
      saveBlock("9d3f6f2a-0f1e-4a8b-8c2d-1f2b3c4d5e6f", {
        title: uniqueTitle("Никакой"),
        items: [],
      }),
    ).rejects.toMatchObject({ code: "notFound" });
  });

  test("опознаватель не uuid не доезжает до запроса", async () => {
    expect(await getBlock("../../etc/passwd")).toBeNull();
  });

  test("список показывает число пунктов блока", async () => {
    const title = uniqueTitle("Список пунктов");
    const id = await createBlock(title);
    await saveBlock(id, {
      title,
      items: [item("один"), item("два"), item("три")],
    });

    const found = (await listBlocks()).find((block) => block.id === id);

    expect(found).toStrictEqual({
      id,
      title,
      itemCount: 3,
      usageCount: 0,
    });
  });
});
