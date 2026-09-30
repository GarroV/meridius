// Сверка правила провала в SQL с правилом в коде (`data/grading.ts`, `data/severity.ts`).
//
// Статистика считает провалы в базе, а не в JavaScript: за 30 дней по стране это десятки
// тысяч снимков, и тащить их в процесс ради одной цифры нельзя. Цена — второе место, где
// записано «что такое провал». Этот тест держит оба места одинаковыми: каждый случай
// таблицы считается и правилом кода, и выражением базы, и расхождение — красный тест.
// Поменялось правило в `grading.ts` (скажем, провалить стало можно и текст) — случай из
// таблицы разойдётся, и статистика не начнёт тихо показывать другое, чем лента.
import { sql } from "drizzle-orm";
import { afterAll, describe, expect, test } from "vitest";

import { isFailed, severityOf } from "@/blocks/data";
import type { AnswerValue, Item } from "@/blocks/data";
import { closeTestDb, getTestDb } from "@/blocks/data/testing/db";

import { itemCriticalSql, itemFailedSql } from "./stats-grading";

const db = getTestDb();
afterAll(closeTestDb);

const TITLE = { ru: "Пункт", en: "Item" };

function item(extra: Partial<Item>): Item {
  return { id: "i-1", title: TITLE, type: "bool", ...extra };
}

interface FailureCase {
  readonly name: string;
  readonly item: Item;
  readonly value: AnswerValue;
}

const FAILURE_CASES: readonly FailureCase[] = [
  { name: "да/нет — нет", item: item({}), value: false },
  { name: "да/нет — да", item: item({}), value: true },
  { name: "да/нет — число вместо ответа", item: item({}), value: 0 },
  {
    name: "число в диапазоне",
    item: item({ type: "number", min: 2, max: 8 }),
    value: 5,
  },
  {
    name: "число ниже нижней границы",
    item: item({ type: "number", min: 2, max: 8 }),
    value: 1.5,
  },
  {
    name: "число выше верхней границы",
    item: item({ type: "number", min: 2, max: 8 }),
    value: 8.25,
  },
  {
    name: "число на самой границе",
    item: item({ type: "number", min: 2, max: 8 }),
    value: 8,
  },
  {
    name: "только нижняя граница, выше неё",
    item: item({ type: "number", min: -18 }),
    value: 40,
  },
  {
    name: "только нижняя граница, ниже неё",
    item: item({ type: "number", min: -18 }),
    value: -20,
  },
  {
    name: "только верхняя граница, выше неё",
    item: item({ type: "number", max: 4 }),
    value: 5,
  },
  {
    name: "число без границ",
    item: item({ type: "number" }),
    value: 1000,
  },
  {
    name: "числовой пункт, ответ строкой",
    item: item({ type: "number", min: 2, max: 8 }),
    value: "1",
  },
  { name: "свободный текст", item: item({ type: "text" }), value: "нет" },
  { name: "таблица", item: item({ type: "table" }), value: [] },
];

interface SeverityCase {
  readonly name: string;
  readonly item: Item;
}

const SEVERITY_CASES: readonly SeverityCase[] = [
  { name: "уровень «критичный»", item: item({ severity: "critical" }) },
  { name: "уровень «важный»", item: item({ severity: "major" }) },
  { name: "уровень «обычный»", item: item({ severity: "normal" }) },
  { name: "старый признак critical: true", item: item({ critical: true }) },
  { name: "старый признак critical: false", item: item({ critical: false }) },
  { name: "ни уровня, ни признака", item: item({}) },
  {
    name: "уровень важнее старого признака",
    item: item({ severity: "normal", critical: true }),
  },
];

function jsonb(value: unknown) {
  return sql`${JSON.stringify(value)}::jsonb`;
}

/** Одно логическое значение из базы. NULL — не «нет», а дефект выражения: он и падает. */
async function booleanOf(expression: ReturnType<typeof sql>): Promise<boolean> {
  const result = await db.execute<{ answer: unknown }>(
    sql`select ${expression} as answer`,
  );
  const answer = result.rows[0]?.answer;
  if (typeof answer !== "boolean") {
    throw new Error(`База вернула не логическое значение: ${String(answer)}`);
  }
  return answer;
}

function failedInDatabase(one: FailureCase): Promise<boolean> {
  return booleanOf(itemFailedSql(jsonb(one.item), jsonb(one.value)));
}

function criticalInDatabase(one: SeverityCase): Promise<boolean> {
  return booleanOf(itemCriticalSql(jsonb(one.item)));
}

describe("провал в базе считается так же, как в коде", () => {
  test.each(FAILURE_CASES)("$name", async (one) => {
    const expected = isFailed(one.item, {
      itemId: one.item.id,
      value: one.value,
      at: 0,
    });
    expect(await failedInDatabase(one)).toBe(expected);
  });

  test("таблица случаев держит обе стороны: есть и провалы, и не провалы", () => {
    // Сверка, в которой все случаи дают одно и то же, не отличила бы выражение,
    // всегда возвращающее false, от верного.
    const outcomes = FAILURE_CASES.map((one) =>
      isFailed(one.item, { itemId: one.item.id, value: one.value, at: 0 }),
    );
    expect(outcomes).toContain(true);
    expect(outcomes).toContain(false);
  });
});

describe("критичность в базе читается так же, как в коде", () => {
  test.each(SEVERITY_CASES)("$name", async (one) => {
    const expected = severityOf(one.item) === "critical";
    expect(await criticalInDatabase(one)).toBe(expected);
  });
});
