// Сигнал станции о просроченном обходе — чистый расчёт: ни базы, ни React, ни словаря.
// Проверяется здесь ровно то, что решает, звонить ли станции и когда панели перерисоваться.
import { describe, expect, test } from "vitest";

import type { ItemRounds, RoundInterval, RoundsView } from "@/blocks/data";

import type { OverdueItem } from "./overdue";
import { buildOverdue } from "./overdue";

function interval(overrides: Partial<RoundInterval> = {}): RoundInterval {
  return {
    startMinutes: 0,
    endMinutes: 60,
    startLocalTime: "08:00",
    state: "upcoming",
    marks: [],
    ...overrides,
  };
}

function itemRounds(overrides: Partial<ItemRounds> = {}): ItemRounds {
  return {
    itemId: "i1",
    intervals: [],
    current: null,
    missedCount: 0,
    strayMarks: [],
    ...overrides,
  };
}

function roundsView(items: ItemRounds[], offsetMinutes = 0): RoundsView {
  return {
    localDate: "2026-09-14",
    localTime: "08:00",
    offsetMinutes,
    mode: "normal",
    window: { start: "08:00:00", end: "23:00:00" },
    items,
  };
}

function overdueItem(overrides: Partial<OverdueItem> = {}): OverdueItem {
  return {
    itemId: "i1",
    title: "Линия начинения",
    remindEveryMinutes: undefined,
    state: "due",
    missedCount: 0,
    ...overrides,
  };
}

describe("buildOverdue", () => {
  test("пунктов с настройкой нет вовсе: сигнала быть не может", () => {
    const result = buildOverdue({
      rounds: roundsView([]),
      items: [
        overdueItem({
          remindEveryMinutes: undefined,
          state: "due",
          missedCount: 3,
        }),
      ],
    });

    expect(result.ringsOnMiss).toBe(false);
    expect(result.overdue).toBeNull();
  });

  test("настройка есть, но просрочек нет: панель молчит", () => {
    const result = buildOverdue({
      rounds: roundsView([]),
      items: [
        overdueItem({ remindEveryMinutes: 20, state: "due", missedCount: 0 }),
      ],
    });

    expect(result.ringsOnMiss).toBe(true);
    expect(result.overdue).toBeNull();
  });

  test("гаснет с отметкой: state done со старым пропуском не звонит", () => {
    // D066: отметка встаёт в текущий проход и пропущенные не догоняет, поэтому
    // missedCount после первого пропуска не обнуляется никогда. Гасит сигнал не число
    // пропусков, а сам факт отметки — она переводит строку в state === "done".
    const result = buildOverdue({
      rounds: roundsView([]),
      items: [
        overdueItem({ remindEveryMinutes: 20, state: "done", missedCount: 2 }),
      ],
    });

    expect(result.overdue).toBeNull();
  });

  test("просрочка есть, но текущего прохода нет (waiting): станция молчит", () => {
    // Отметить сейчас всё равно нельзя — запись отказывает «обхода сейчас не ждут», —
    // и звонок, который нечем погасить, был бы издевательством над сменой.
    const result = buildOverdue({
      rounds: roundsView([]),
      items: [
        overdueItem({
          remindEveryMinutes: 20,
          state: "waiting",
          missedCount: 2,
        }),
      ],
    });

    expect(result.overdue).toBeNull();
  });

  test("просрочка есть, но обходы на сегодня закончены (finished): станция молчит", () => {
    const result = buildOverdue({
      rounds: roundsView([]),
      items: [
        overdueItem({
          remindEveryMinutes: 20,
          state: "finished",
          missedCount: 2,
        }),
      ],
    });

    expect(result.overdue).toBeNull();
  });

  test("один звонящий пункт: сигнал повторяет по его собственной настройке", () => {
    const result = buildOverdue({
      rounds: roundsView([]),
      items: [
        overdueItem({
          title: "Линия начинения",
          remindEveryMinutes: 20,
          state: "due",
          missedCount: 2,
        }),
      ],
    });

    expect(result.overdue).toEqual({
      missedCount: 2,
      titles: ["Линия начинения"],
      repeatEverySeconds: 1200,
    });
  });

  test("три звонящих пункта дают ОДИН сигнал по самой частой настройке", () => {
    // Главная проверка задачи: три просрочки — один звонок, а не три (D068).
    const result = buildOverdue({
      rounds: roundsView([]),
      items: [
        overdueItem({
          itemId: "i1",
          title: "Линия начинения",
          remindEveryMinutes: 60,
          state: "due",
          missedCount: 1,
        }),
        overdueItem({
          itemId: "i2",
          title: "Холодильник",
          remindEveryMinutes: 10,
          state: "due",
          missedCount: 2,
        }),
        overdueItem({
          itemId: "i3",
          title: "Витрина",
          remindEveryMinutes: 20,
          state: "due",
          missedCount: 3,
        }),
      ],
    });

    expect(result.overdue).toEqual({
      missedCount: 6,
      titles: ["Линия начинения", "Холодильник", "Витрина"],
      repeatEverySeconds: 600,
    });
  });

  test("пункт без настройки не попадает в звонок, даже если рядом просрочен", () => {
    const result = buildOverdue({
      rounds: roundsView([]),
      items: [
        overdueItem({
          itemId: "i1",
          title: "Без сигнала",
          remindEveryMinutes: undefined,
          state: "due",
          missedCount: 5,
        }),
        overdueItem({
          itemId: "i2",
          title: "Со звонком",
          remindEveryMinutes: 20,
          state: "due",
          missedCount: 1,
        }),
      ],
    });

    expect(result.overdue).toEqual({
      missedCount: 1,
      titles: ["Со звонком"],
      repeatEverySeconds: 1200,
    });
  });

  test("nextChangeInSeconds: offsetMinutes посреди прохода — до конца этого прохода", () => {
    const result = buildOverdue({
      rounds: roundsView(
        [
          itemRounds({
            intervals: [interval({ startMinutes: 0, endMinutes: 60 })],
          }),
        ],
        30,
      ),
      items: [],
    });

    expect(result.nextChangeInSeconds).toBe(1800);
  });

  test("nextChangeInSeconds: offsetMinutes ровно на границе — берётся следующая, а не ноль", () => {
    const result = buildOverdue({
      rounds: roundsView(
        [
          itemRounds({
            intervals: [
              interval({ startMinutes: 0, endMinutes: 60 }),
              interval({ startMinutes: 60, endMinutes: 120 }),
            ],
          }),
        ],
        60,
      ),
      items: [],
    });

    expect(result.nextChangeInSeconds).toBe(3600);
  });

  test("nextChangeInSeconds: все границы позади — null", () => {
    const result = buildOverdue({
      rounds: roundsView(
        [
          itemRounds({
            intervals: [interval({ startMinutes: 0, endMinutes: 60 })],
          }),
        ],
        200,
      ),
      items: [],
    });

    expect(result.nextChangeInSeconds).toBeNull();
  });

  test("nextChangeInSeconds: минимальная граница среди нескольких пунктов с разными сетками", () => {
    const result = buildOverdue({
      rounds: roundsView(
        [
          itemRounds({
            itemId: "i1",
            intervals: [interval({ startMinutes: 0, endMinutes: 60 })],
          }),
          itemRounds({
            itemId: "i2",
            intervals: [interval({ startMinutes: 0, endMinutes: 30 })],
          }),
        ],
        10,
      ),
      items: [],
    });

    expect(result.nextChangeInSeconds).toBe(1200);
  });
});
