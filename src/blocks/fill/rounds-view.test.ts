// Сборка панели обходов — чистая: ни базы, ни React, ни словаря. Проверяется здесь
// ровно то, что читает смена одной строкой, не разворачивая список (D076).
import { describe, expect, test } from "vitest";

import type { ItemRounds, RoundsView, Section } from "@/blocks/data";

import type { RoundsLabels } from "./model";
import { buildRoundsPanel } from "./rounds-view";

const labels: RoundsLabels = {
  checkBefore: (time) => `Проверить до ${time}`,
  checkNow: "Проверить сейчас",
  doneAt: (time) => `Сделано в ${time}`,
  nextAt: (time) => `Следующий в ${time}`,
  finished: "Обходы на сегодня закончены",
  missed: (count) => `Пропущено ${String(count)}`,
  yes: "да",
  no: "нет",
};

function sections(titles: Record<string, string>): Section[] {
  return [
    {
      id: "s1",
      title: { ru: "Обходы", en: "Rounds" },
      source: "own",
      items: Object.entries(titles).map(([id, ru]) => ({
        id,
        title: { ru, en: ru },
        type: "bool" as const,
        severity: "critical" as const,
        schedule: [{ from: "08:00", to: "12:00", everyMinutes: 60 }],
      })),
    },
  ];
}

function mark(
  overrides: Partial<{
    itemId: string;
    intervalStart: number;
    atLocalTime: string;
    value: boolean | number | string;
    comment: string | null;
  }> = {},
) {
  return {
    id: `m-${String(overrides.intervalStart ?? 0)}`,
    itemId: overrides.itemId ?? "i1",
    intervalStart: overrides.intervalStart ?? 0,
    localDate: "2026-09-14",
    at: new Date("2026-09-14T08:12:00Z"),
    atLocalTime: overrides.atLocalTime ?? "08:12",
    value: overrides.value ?? true,
    comment: overrides.comment ?? null,
  };
}

/** Сетка 08:00–12:00 по часу: проходы в 8, 9, 10 и 11 (`to` — конец периода). */
function rounds(overrides: Partial<ItemRounds> = {}): ItemRounds {
  const grid = [0, 60, 120, 180].map((startMinutes) => ({
    startMinutes,
    endMinutes: startMinutes + 60,
    startLocalTime: `${String(8 + startMinutes / 60).padStart(2, "0")}:00`,
    state: "upcoming" as const,
    marks: [],
  }));
  return {
    itemId: "i1",
    intervals: grid,
    current: null,
    missedCount: 0,
    strayMarks: [],
    ...overrides,
  };
}

function view(items: ItemRounds[]): RoundsView {
  return {
    localDate: "2026-09-14",
    localTime: "09:30",
    offsetMinutes: 90,
    mode: "normal",
    window: { start: "08:00:00", end: "23:00:00" },
    items,
  };
}

function only<T>(values: readonly T[]): T {
  const [first] = values;
  if (first === undefined || values.length !== 1) {
    throw new Error(`Ожидался ровно один, получено ${String(values.length)}`);
  }
  return first;
}

describe("buildRoundsPanel", () => {
  test("идёт непройденный обход: строка говорит, до какого времени успеть", () => {
    const grid = rounds();
    const current = grid.intervals[1];
    if (current === undefined) throw new Error("нет прохода");

    const panel = buildRoundsPanel({
      rounds: view([{ ...grid, current: { ...current, state: "open" } }]),
      sections: sections({ i1: "Линия начинения" }),
      locales: ["ru"],
      labels,
    });

    const item = only(panel.items);
    expect(item.title).toBe("Линия начинения");
    expect(item.type).toBe("bool");
    // Критичный обход: провал без объяснения не принимается ни формой, ни сервером.
    expect(item.commentOnFailure).toBe(true);
    expect(item.state).toBe("due");
    expect(item.headline).toBe("Проверить до 10:00");
    expect(item.canMark).toBe(true);
  });

  test("обход текущего прохода сделан: строка показывает время отметки, а не призыв идти", () => {
    const grid = rounds();
    const current = grid.intervals[1];
    if (current === undefined) throw new Error("нет прохода");
    const done = {
      ...current,
      state: "done" as const,
      marks: [mark({ intervalStart: 60, atLocalTime: "09:05" })],
    };

    const panel = buildRoundsPanel({
      rounds: view([
        {
          ...grid,
          intervals: [grid.intervals[0] ?? current, done],
          current: done,
        },
      ]),
      sections: sections({ i1: "Линия начинения" }),
      locales: ["ru"],
      labels,
    });

    const item = only(panel.items);
    expect(item.state).toBe("done");
    expect(item.headline).toBe("Сделано в 09:05");
    expect(item.canMark).toBe(false);
  });

  test("пропуски названы числом и не прячутся за главной строкой", () => {
    const grid = rounds();
    const current = grid.intervals[2];
    if (current === undefined) throw new Error("нет прохода");

    const panel = buildRoundsPanel({
      rounds: view([
        { ...grid, current: { ...current, state: "open" }, missedCount: 2 },
      ]),
      sections: sections({ i1: "Линия начинения" }),
      locales: ["ru"],
      labels,
    });

    const item = only(panel.items);
    expect(item.missedCount).toBe(2);
    expect(item.note).toContain("Пропущено 2");
    expect(panel.missedTotal).toBe(2);
  });

  test("сетка кончилась: обходов сегодня больше не ждут", () => {
    const panel = buildRoundsPanel({
      rounds: view([rounds({ current: null })]),
      sections: sections({ i1: "Линия начинения" }),
      locales: ["ru"],
      labels,
    });

    const item = only(panel.items);
    expect(item.state).toBe("finished");
    expect(item.headline).toBe("Обходы на сегодня закончены");
    expect(item.canMark).toBe(false);
  });

  test("после отметки вторая строка называет время следующего обхода", () => {
    const grid = rounds();
    const first = grid.intervals[0];
    const second = grid.intervals[1];
    if (first === undefined || second === undefined)
      throw new Error("нет прохода");
    const done = {
      ...first,
      state: "done" as const,
      marks: [mark({ intervalStart: 0 })],
    };

    const panel = buildRoundsPanel({
      rounds: {
        ...view([]),
        offsetMinutes: 30,
        items: [{ ...grid, intervals: [done, second], current: done }],
      },
      sections: sections({ i1: "Линия начинения" }),
      locales: ["ru"],
      labels,
    });

    expect(only(panel.items).note).toContain("Следующий в 09:00");
  });

  test("развёрнутый список показывает отметки свежими сверху и переводит ответ словами", () => {
    const grid = rounds();
    const first = grid.intervals[0];
    const second = grid.intervals[1];
    if (first === undefined || second === undefined)
      throw new Error("нет прохода");

    const panel = buildRoundsPanel({
      rounds: view([
        {
          ...grid,
          intervals: [
            {
              ...first,
              state: "done",
              marks: [
                mark({ intervalStart: 0, atLocalTime: "08:12", value: true }),
              ],
            },
            {
              ...second,
              state: "done",
              marks: [
                mark({
                  intervalStart: 60,
                  atLocalTime: "09:05",
                  value: false,
                  comment: "подтаяло",
                }),
              ],
            },
          ],
          current: null,
        },
      ]),
      sections: sections({ i1: "Линия начинения" }),
      locales: ["ru"],
      labels,
    });

    const item = only(panel.items);
    expect(item.marks.map((m) => m.interval)).toEqual(["09:00", "08:00"]);
    expect(item.marks.map((m) => m.value)).toEqual(["нет", "да"]);
    expect(item.marks[0]?.failed).toBe(true);
    expect(item.marks[0]?.comment).toBe("подтаяло");
    expect(item.marks[0]?.at).toBe("09:05");
  });

  test("отметки, выпавшие из сетки, показываются в списке, а не пропадают", () => {
    const panel = buildRoundsPanel({
      rounds: view([
        rounds({
          strayMarks: [mark({ intervalStart: 45, atLocalTime: "08:50" })],
        }),
      ]),
      sections: sections({ i1: "Линия начинения" }),
      locales: ["ru"],
      labels,
    });

    expect(only(panel.items).marks).toHaveLength(1);
  });

  test("пункт без названия на экран не выходит: это недописанный черновик методиста", () => {
    const panel = buildRoundsPanel({
      rounds: view([rounds()]),
      sections: [
        {
          id: "s1",
          title: { ru: "Обходы", en: "Rounds" },
          source: "own",
          items: [{ id: "i1", title: {}, type: "bool", severity: "critical" }],
        },
      ],
      locales: ["ru"],
      labels,
    });

    expect(panel.items).toHaveLength(0);
  });

  test("обходов нет вовсе — панели нет, а не пустая рамка", () => {
    const panel = buildRoundsPanel({
      rounds: view([]),
      sections: sections({}),
      locales: ["ru"],
      labels,
    });

    expect(panel.items).toHaveLength(0);
    expect(panel.missedTotal).toBe(0);
  });
});
