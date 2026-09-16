import { describe, expect, test } from "vitest";

import type { Section } from "@/blocks/data";

import type { RoundsDay, RoundsMark } from "./rounds-grid";
import { buildRoundsGrid } from "./rounds-grid";

const WINDOW = { start: "08:00", end: "12:00" } as const;

/** Обход раз в час с 08:00 до 12:00: четыре прохода — 08, 09, 10, 11. */
const HOURLY: Section["items"][number] = {
  id: "i-line",
  title: { ru: "Линия раздачи", en: "Toppings line" },
  type: "bool",
  severity: "critical",
  schedule: [{ from: "08:00", to: "12:00", everyMinutes: 60 }],
};

/** Пункт без расписания: в сетке обходов его быть не должно вовсе. */
const PLAIN: Section["items"][number] = {
  id: "i-tables",
  title: { ru: "Столы протёрты", en: "Tables wiped" },
  type: "bool",
  severity: "normal",
};

function sections(
  items: readonly Section["items"][number][] = [HOURLY, PLAIN],
): Section[] {
  return [
    {
      id: "s-1",
      title: { ru: "Секция", en: "Section" },
      source: "own",
      items: [...items],
    },
  ];
}

function day(localDate: string, over: Partial<RoundsDay> = {}): RoundsDay {
  return {
    checklistId: "c-1",
    localDate,
    window: WINDOW,
    mode: "normal",
    sections: sections(),
    // Проход давно закончился: 300 минут от 08:00 — это 13:00.
    elapsedMinutes: 300,
    ...over,
  };
}

function mark(localDate: string, intervalStart: number): RoundsMark {
  return { checklistId: "c-1", localDate, itemId: "i-line", intervalStart };
}

describe("сетка обходов", () => {
  test("колонки — часы прохода, строка одна на периодический пункт", () => {
    const grid = buildRoundsGrid([day("2026-09-06")], []);

    expect(grid.columns).toStrictEqual(["08:00", "09:00", "10:00", "11:00"]);
    // Пункт без расписания в отчёт не попадает: обхода у него нет, и пустая строка
    // на весь экран читалась бы как «обход сорван», а не «обхода нет».
    expect(grid.rows.map((row) => row.itemId)).toStrictEqual(["i-line"]);
  });

  test("проход без отметки в закрытом интервале — пропуск", () => {
    const grid = buildRoundsGrid([day("2026-09-06")], [mark("2026-09-06", 60)]);

    const [row] = grid.rows;

    expect(row?.cells.map((cell) => cell?.done)).toStrictEqual([0, 1, 0, 0]);
    expect(row?.cells.map((cell) => cell?.missed)).toStrictEqual([1, 0, 1, 1]);
    expect(grid.doneCount).toBe(1);
    expect(grid.missedCount).toBe(3);
  });

  test("идущий и будущий проходы пропуском не считаются", () => {
    // 09:30 по местному времени: 90 минут от начала окна. Восьмичасовой проход
    // закрылся, девятичасовой идёт, остальные ещё не начинались. Объявить идущий
    // проход пропуском значит торопить смену.
    const grid = buildRoundsGrid(
      [day("2026-09-06", { elapsedMinutes: 90 })],
      [],
    );

    const [row] = grid.rows;

    expect(row?.cells.map((cell) => cell?.missed)).toStrictEqual([1, 0, 0, 0]);
    expect(row?.cells.map((cell) => cell?.pending)).toStrictEqual([0, 1, 1, 1]);
    expect(grid.missedCount).toBe(1);
  });

  test("несколько суток складываются в одну клетку", () => {
    // Ровно то, ради чего отчёт и заведён: видно, что сыплется ДЕСЯТЬ часов,
    // а не «кто-то один раз забыл».
    const days = [day("2026-09-04"), day("2026-09-05"), day("2026-09-06")];
    const marks = [
      mark("2026-09-04", 0),
      mark("2026-09-05", 0),
      mark("2026-09-06", 0),
      mark("2026-09-04", 60),
    ];

    const grid = buildRoundsGrid(days, marks);
    const [row] = grid.rows;

    expect(row?.cells[0]).toStrictEqual({ done: 3, missed: 0, pending: 0 });
    expect(row?.cells[1]).toStrictEqual({ done: 1, missed: 2, pending: 0 });
    expect(row?.cells[2]).toStrictEqual({ done: 0, missed: 3, pending: 0 });
  });

  test("отметка не в свой интервал в клетку не попадает", () => {
    // Методист сменил шаг посреди смены, и отметка легла на сетку, которой больше
    // нет. Терять её молча нельзя — обход БЫЛ сделан, — поэтому она считается
    // отдельно и сеткой не прикидывается.
    const grid = buildRoundsGrid([day("2026-09-06")], [mark("2026-09-06", 30)]);

    expect(grid.rows[0]?.cells.map((cell) => cell?.done)).toStrictEqual([
      0, 0, 0, 0,
    ]);
    expect(grid.strayMarkCount).toBe(1);
  });

  test("пункт, выпавший по режиму смены, обхода не требует", () => {
    // В критичной смене обычных пунктов не существует вовсе (D067): требовать по ним
    // обход значило бы копить пропуски по работе, которую сами же и отменили.
    const plainRound: Section["items"][number] = {
      ...HOURLY,
      id: "i-plain-round",
      severity: "normal",
    };
    const grid = buildRoundsGrid(
      [
        day("2026-09-06", {
          mode: "critical",
          sections: sections([plainRound]),
        }),
      ],
      [],
    );

    expect(grid.rows).toStrictEqual([]);
    expect(grid.columns).toStrictEqual([]);
  });

  test("у окон с разным шагом колонки общие, а клетки — свои", () => {
    const evening: RoundsDay = day("2026-09-06", {
      checklistId: "c-2",
      window: { start: "08:00", end: "12:00" },
      sections: sections([
        {
          ...HOURLY,
          id: "i-fridge",
          title: { ru: "Холодильник", en: "Fridge" },
          schedule: [{ from: "10:00", to: "12:00", everyMinutes: 120 }],
        },
      ]),
    });

    const grid = buildRoundsGrid([day("2026-09-06"), evening], []);

    expect(grid.columns).toStrictEqual(["08:00", "09:00", "10:00", "11:00"]);
    const fridge = grid.rows.find((row) => row.itemId === "i-fridge");
    // Холодильник проверяют один раз в 10:00 — в чужие часы клеток у него нет,
    // и пустая клетка не должна читаться как пропуск.
    expect(fridge?.cells.map((cell) => cell === null)).toStrictEqual([
      true,
      true,
      false,
      true,
    ]);
  });

  test("название пункта берётся из последних суток", () => {
    // Пункт переименовали, и отчёт за месяц обязан называть его так, как он
    // называется сейчас, — иначе шапка отчёта расходится с редактором.
    const renamed = day("2026-09-06", {
      sections: sections([
        {
          ...HOURLY,
          title: { ru: "Линия раздачи и соусы", en: "Line and sauces" },
        },
      ]),
    });

    const grid = buildRoundsGrid([renamed, day("2026-09-04")], []);

    expect(grid.rows[0]?.itemTitle["ru"]).toBe("Линия раздачи и соусы");
  });
});
