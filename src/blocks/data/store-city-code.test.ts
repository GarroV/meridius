// Город и код точки у пиццерии (миграция 0017, #141).
//
// Код точки — опознаватель пиццерии в справочнике сети: по нему импорт находит строку,
// даже если название поменяли на экране. Поэтому он уникален в пределах страны — два
// одинаковых кода в одной стране вернули бы импорт к угадыванию. В разных странах коды
// независимы: нумерацию ведёт каждая страна у себя. Код и город необязательны: пиццерии,
// заведённые до миграции, остаются валидными без них.
import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, describe, expect, test } from "vitest";

import { countries, stores } from "./schema";
import { closeTestDb, getTestDb } from "./testing/db";
import {
  PG_CHECK_VIOLATION,
  PG_UNIQUE_VIOLATION,
  dbErrorCode,
} from "./testing/errors";

const db = getTestDb();

afterAll(closeTestDb);

async function newCountry(): Promise<string> {
  const [row] = await db
    .insert(countries)
    .values({ name: `Страна ${randomUUID().slice(0, 8)}` })
    .returning({ id: countries.id });
  if (row === undefined) throw new Error("Страна не заведена");
  return row.id;
}

function uniqueCode(): string {
  return `P-${randomUUID().slice(0, 8)}`;
}

function insertStore(values: {
  countryId: string;
  city?: string | null;
  code?: string | null;
}) {
  return db
    .insert(stores)
    .values({ name: `Пиццерия ${randomUUID().slice(0, 8)}`, ...values })
    .returning({ id: stores.id });
}

describe("код точки", () => {
  test("второй такой же код в той же стране база не принимает", async () => {
    const countryId = await newCountry();
    const code = uniqueCode();
    await insertStore({ countryId, code });

    expect(await dbErrorCode(insertStore({ countryId, code }))).toBe(
      PG_UNIQUE_VIOLATION,
    );
  });

  test("тот же код в другой стране — другая пиццерия", async () => {
    const code = uniqueCode();
    await insertStore({ countryId: await newCountry(), code });

    expect(
      await dbErrorCode(insertStore({ countryId: await newCountry(), code })),
    ).toBeUndefined();
  });

  test("пиццерий без кода в одной стране может быть сколько угодно", async () => {
    const countryId = await newCountry();
    await insertStore({ countryId });
    await insertStore({ countryId, code: null });

    const rows = await db
      .select({ code: stores.code, city: stores.city })
      .from(stores)
      .where(eq(stores.countryId, countryId));
    expect(rows).toEqual([
      { code: null, city: null },
      { code: null, city: null },
    ]);
  });

  test.each([
    ["пустой", ""],
    ["из пробелов", "   "],
    ["с пробелом по краю", " P-1"],
    ["длиннее 64 знаков", "x".repeat(65)],
  ])("код %s база не принимает", async (_label, code) => {
    const countryId = await newCountry();
    expect(await dbErrorCode(insertStore({ countryId, code }))).toBe(
      PG_CHECK_VIOLATION,
    );
  });
});

describe("город", () => {
  test("город хранится отдельно от названия", async () => {
    const countryId = await newCountry();
    const [row] = await insertStore({ countryId, city: "Warsaw" });
    if (row === undefined) throw new Error("Пиццерия не заведена");

    const [stored] = await db
      .select({ city: stores.city })
      .from(stores)
      .where(eq(stores.id, row.id));
    expect(stored?.city).toBe("Warsaw");
  });

  test.each([
    ["пустой", ""],
    ["с пробелом по краю", "Warsaw "],
    ["длиннее 120 знаков", "x".repeat(121)],
  ])("город %s база не принимает", async (_label, city) => {
    const countryId = await newCountry();
    expect(await dbErrorCode(insertStore({ countryId, city }))).toBe(
      PG_CHECK_VIOLATION,
    );
  });
});
