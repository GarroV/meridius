import { describe, expect, test } from "vitest";

import { compareCoverage, MEASURES } from "./coverage-gate";

const base = { lines: 90, statements: 88, functions: 91, branches: 86 };

describe("compareCoverage", () => {
  test("пропускает прогон, который не ниже базы ни по одной мере", () => {
    const verdict = compareCoverage(base, { ...base });

    expect(verdict.ok).toBe(true);
    expect(verdict.drops).toEqual([]);
  });

  // Ради этого порог и заведён: одна просевшая мера заворачивает прогон целиком,
  // даже если остальные выросли. Иначе просадку видно только глазами на приёмке.
  test("заворачивает прогон, если просела хотя бы одна мера", () => {
    const verdict = compareCoverage(base, { ...base, functions: 90.94 });

    expect(verdict.ok).toBe(false);
    expect(verdict.drops).toEqual([
      { measure: "functions", was: 91, now: 90.94, by: "percent" },
    ]);
  });

  test("называет все просевшие меры, а не только первую", () => {
    const verdict = compareCoverage(base, {
      lines: 89,
      statements: 88,
      functions: 90,
      branches: 86,
    });

    expect(verdict.drops.map((drop) => drop.measure)).toEqual([
      "lines",
      "functions",
    ]);
  });

  test("рост отмечается отдельно — по нему обновляют базу", () => {
    const verdict = compareCoverage(base, { ...base, lines: 90.5 });

    expect(verdict.ok).toBe(true);
    expect(verdict.gains.map((gain) => gain.measure)).toEqual(["lines"]);
  });

  // Сотые доли — это и есть типичная просадка: 91,62 → 91,56 на одной непокрытой
  // функции из 984. Округление до целых пропустило бы её молча.
  test("видит просадку в сотых долях", () => {
    const verdict = compareCoverage(
      { ...base, functions: 91.62 },
      { ...base, functions: 91.56 },
    );

    expect(verdict.ok).toBe(false);
  });

  test("мера, которой нет в отчёте, — это провал, а не пропуск", () => {
    const current: Record<string, number> = { ...base };
    delete current["branches"];

    const verdict = compareCoverage(base, current);

    expect(verdict.ok).toBe(false);
    expect(verdict.missing).toEqual(["branches"]);
  });

  test("перечисляет все четыре меры", () => {
    expect([...MEASURES]).toEqual([
      "lines",
      "statements",
      "functions",
      "branches",
    ]);
  });
});

/**
 * Сравнение по числу непокрытых (T244). Доля падала не только от усыхания
 * проверок, но и от уборки: удаление покрытой ветви уменьшает знаменатель.
 * Живой случай T220 — удалили колонку времени, 2106 покрытых ветвей из 2435 стали
 * 2104 из 2433, новых непокрытых ноль, проверок больше, а гейт завернул волну.
 */
const withUncovered = (
  pct: typeof base,
  uncovered: Record<string, number>,
) => ({
  ...pct,
  uncovered,
});

describe("compareCoverage по числу непокрытых", () => {
  test("удаление покрытого кода не заворачивает прогон, хотя доля просела", () => {
    const baseline = withUncovered(base, { branches: 329 });
    const current = withUncovered(
      { ...base, branches: 85.9 },
      { branches: 329 },
    );

    const verdict = compareCoverage(baseline, current);

    expect(verdict.ok).toBe(true);
    expect(verdict.drops).toEqual([]);
  });

  test("непокрытых стало больше — прогон завёрнут, даже если доля выросла", () => {
    const baseline = withUncovered(base, { branches: 329 });
    const current = withUncovered({ ...base, branches: 99 }, { branches: 330 });

    const verdict = compareCoverage(baseline, current);

    expect(verdict.ok).toBe(false);
    expect(verdict.drops).toEqual([
      { measure: "branches", was: 86, now: 99, by: "uncovered" },
    ]);
  });

  test("непокрытых стало меньше — это рост, по нему двигают базу", () => {
    const baseline = withUncovered(base, { branches: 329 });
    const current = withUncovered({ ...base }, { branches: 320 });

    const verdict = compareCoverage(baseline, current);

    expect(verdict.ok).toBe(true);
    expect(verdict.gains).toEqual([
      { measure: "branches", was: 86, now: 86, by: "uncovered" },
    ]);
  });

  test("база без чисел непокрытых сравнивается по долям, как до T244", () => {
    const current = { ...base, branches: 85.9, uncovered: { branches: 329 } };

    const verdict = compareCoverage(base, current);

    expect(verdict.ok).toBe(false);
    expect(verdict.drops).toEqual([
      { measure: "branches", was: 86, now: 85.9, by: "percent" },
    ]);
  });
});
