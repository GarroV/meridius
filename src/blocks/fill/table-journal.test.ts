// Правила журнала замеса теста: что считается заполненной строкой, что уходит на
// сервер и что сервер принимает обратно. Функции чистые — их зовут и браузер между
// касаниями, и разбор тела запроса; два разных свода правил разошлись бы молча.
import { describe, expect, test } from "vitest";

import {
  addRow,
  filledRows,
  parseTableRows,
  removeRow,
  setCell,
  TABLE_LIMITS,
} from "./table-journal";

describe("правка журнала на экране", () => {
  test("строка добавляется в конец и приходит пустой", () => {
    const rows = addRow([{ c1: "24,5" }]);

    expect(rows).toStrictEqual([{ c1: "24,5" }, {}]);
  });

  test("строк больше предела не заводится", () => {
    const full = Array.from({ length: TABLE_LIMITS.rows }, () => ({
      c1: "24",
    }));

    expect(addRow(full)).toHaveLength(TABLE_LIMITS.rows);
  });

  test("клетка правится по опознавателю колонки, соседняя остаётся", () => {
    const rows = setCell([{ c1: "24,5", c2: "200" }], 0, "c2", "210");

    expect(rows).toStrictEqual([{ c1: "24,5", c2: "210" }]);
  });

  test("правка клетки не трогает соседние строки", () => {
    const rows = setCell([{ c1: "24" }, { c1: "25" }], 1, "c1", "26");

    expect(rows).toStrictEqual([{ c1: "24" }, { c1: "26" }]);
  });

  test("правка не на своём месте оставляет журнал прежним", () => {
    const before = [{ c1: "24" }];

    expect(setCell(before, 5, "c1", "26")).toStrictEqual(before);
  });

  test("удаление строки оставляет остальные в прежнем порядке", () => {
    const rows = removeRow([{ c1: "24" }, { c1: "25" }, { c1: "26" }], 1);

    expect(rows).toStrictEqual([{ c1: "24" }, { c1: "26" }]);
  });

  test("пробелы внутри клетки при правке не режутся: сотрудник ещё печатает", () => {
    const rows = setCell([{}], 0, "c1", "медленно 4 ");

    expect(rows[0]?.["c1"]).toBe("медленно 4 ");
  });
});

describe("что уходит на сервер", () => {
  test("пустые строки отбрасываются, заполненные остаются в своём порядке", () => {
    const rows = filledRows([{ c1: "24" }, {}, { c1: "  " }, { c1: "25" }]);

    expect(rows).toStrictEqual([{ c1: "24" }, { c1: "25" }]);
  });

  test("крайние пробелы клетки срезаются, пустая клетка не хранится", () => {
    const rows = filledRows([{ c1: " 24 ", c2: "   " }]);

    expect(rows).toStrictEqual([{ c1: "24" }]);
  });

  test("журнал без единой заполненной строки уходит пустым", () => {
    expect(filledRows([{}, { c1: " " }])).toStrictEqual([]);
  });
});

describe("разбор журнала на сервере", () => {
  test("годный журнал разбирается и нормализуется", () => {
    expect(parseTableRows([{ c1: " 24 " }, {}])).toStrictEqual([{ c1: "24" }]);
  });

  test("не список — отказ", () => {
    expect(parseTableRows("24")).toBeNull();
  });

  test("строка не объект — отказ", () => {
    expect(parseTableRows([["24"]])).toBeNull();
  });

  test("клетка не строка — отказ, а не молчаливое приведение к тексту", () => {
    expect(parseTableRows([{ c1: 24 }])).toBeNull();
  });

  test("строк больше предела — отказ, а не обрезка", () => {
    const many = Array.from({ length: TABLE_LIMITS.rows + 1 }, () => ({
      c1: "24",
    }));

    expect(parseTableRows(many)).toBeNull();
  });

  test("клетка длиннее предела — отказ", () => {
    const long = "x".repeat(TABLE_LIMITS.cellLength + 1);

    expect(parseTableRows([{ c1: long }])).toBeNull();
  });

  test("опознаватель колонки длиннее предела — отказ", () => {
    const key = "c".repeat(TABLE_LIMITS.columnIdLength + 1);

    expect(parseTableRows([{ [key]: "24" }])).toBeNull();
  });
});
