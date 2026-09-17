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
      { measure: "functions", was: 91, now: 90.94 },
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
