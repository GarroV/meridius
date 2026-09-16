// Поле расписания периодических обходов: закрытые списки выбора, подпись чипа и
// подсказки кнопок окна настройки. Часть случаев (`isRemindOption`) уже проверяется
// косвенно через `validation.test.ts`; здесь — весь модуль напрямую.
import { describe, expect, test } from "vitest";

import type { ChecklistWindow, Item, ScheduleSegment } from "@/blocks/data";

import {
  canAddSegment,
  chipSummary,
  isRemindOption,
  MAX_SEGMENTS,
  nextSegment,
  REMIND_OPTIONS,
  removeSegment,
  replaceSegment,
  STEP_OPTIONS,
  stepOptionsFor,
} from "./schedule-field";

function segment(
  from: string,
  to: string,
  everyMinutes: number,
): ScheduleSegment {
  return { from, to, everyMinutes };
}

function item(schedule?: ScheduleSegment[]): Item {
  return {
    id: "i",
    title: { ru: "пункт" },
    type: "bool",
    ...(schedule === undefined ? {} : { schedule }),
  };
}

/** Три отрезка на день — общий образец для проверок replaceSegment/removeSegment. */
function threeSegments(): ScheduleSegment[] {
  return [
    segment("08:00", "12:00", 30),
    segment("12:00", "18:00", 60),
    segment("18:00", "23:00", 120),
  ];
}

describe("isRemindOption", () => {
  test("истинна для каждого значения из REMIND_OPTIONS", () => {
    for (const value of REMIND_OPTIONS) {
      expect(isRemindOption(value), String(value)).toBe(true);
    }
  });

  test("ложна для 0: «молчать» — это отсутствие значения, а не ноль", () => {
    expect(isRemindOption(0)).toBe(false);
  });

  test("ложна для числа не из списка", () => {
    expect(isRemindOption(15)).toBe(false);
  });

  test("ложна для строки, даже если она похожа на число из списка", () => {
    expect(isRemindOption("10")).toBe(false);
  });
});

describe("stepOptionsFor", () => {
  test("без записанного шага — ровно STEP_OPTIONS", () => {
    expect(stepOptionsFor(undefined)).toStrictEqual(STEP_OPTIONS);
  });

  test("возвращает копию, а не сам список", () => {
    const before = [...STEP_OPTIONS];
    const result = stepOptionsFor(undefined);

    result.push(999);

    expect(STEP_OPTIONS).toStrictEqual(before);
  });

  test("шаг, уже входящий в список, дубликата не добавляет", () => {
    expect(stepOptionsFor(60)).toStrictEqual(STEP_OPTIONS);
  });

  test("нестандартный шаг попадает в список по возрастанию, а не в конец", () => {
    expect(stepOptionsFor(45)).toStrictEqual([30, 45, 60, 120, 180, 240]);
  });
});

describe("chipSummary", () => {
  test("пункт без расписания — none", () => {
    expect(chipSummary(item())).toStrictEqual({ kind: "none" });
  });

  test("пустой список расписания — тоже none, а не отдельное состояние", () => {
    expect(chipSummary(item([]))).toStrictEqual({ kind: "none" });
  });

  test("один отрезок — single с его границами и шагом", () => {
    const only = segment("08:00", "12:00", 30);

    expect(chipSummary(item([only]))).toStrictEqual({
      kind: "single",
      from: "08:00",
      to: "12:00",
      everyMinutes: 30,
    });
  });

  test("два и больше отрезков — many с их числом", () => {
    const schedule = [
      segment("08:00", "12:00", 30),
      segment("12:00", "23:00", 60),
    ];

    expect(chipSummary(item(schedule))).toStrictEqual({
      kind: "many",
      count: 2,
    });
  });
});

describe("nextSegment", () => {
  const window: ChecklistWindow = { start: "08:00", end: "23:00" };

  test("на пустом расписании берёт окно целиком и шаг по умолчанию 60", () => {
    expect(nextSegment([], window)).toStrictEqual({
      from: "08:00",
      to: "23:00",
      everyMinutes: 60,
    });
  });

  test("время окна с секундами не попадает в отрезок", () => {
    const withSeconds: ChecklistWindow = { start: "06:00:00", end: "22:00:00" };

    expect(nextSegment([], withSeconds)).toStrictEqual({
      from: "06:00",
      to: "22:00",
      everyMinutes: 60,
    });
  });

  test("второй отрезок начинается там, где кончился последний, и наследует его шаг", () => {
    const schedule = [segment("08:00", "12:00", 30)];

    expect(nextSegment(schedule, window)).toStrictEqual({
      from: "12:00",
      to: "23:00",
      everyMinutes: 30,
    });
  });

  test("последний отрезок уже дошёл до конца окна — предлагается отрезок от начала", () => {
    // Иначе предложенный отрезок получился бы «от конца окна до конца окна» — пустым
    // и запрещённым `assertValidSchedule`.
    const schedule = [segment("08:00", "23:00", 60)];

    const proposed = nextSegment(schedule, window);

    expect(proposed.from).not.toBe(proposed.to);
    expect(proposed).toStrictEqual({
      from: "23:00",
      to: "08:00",
      everyMinutes: 60,
    });
  });
});

describe("canAddSegment", () => {
  test("на пустом расписании добавить можно", () => {
    expect(canAddSegment([])).toBe(true);
  });

  test(`на расписании из ${String(MAX_SEGMENTS)} отрезков — нельзя`, () => {
    const full = Array.from({ length: MAX_SEGMENTS }, () =>
      segment("08:00", "09:00", 60),
    );

    expect(canAddSegment(full)).toBe(false);
  });
});

describe("replaceSegment", () => {
  test("меняет поле указанного отрезка и не трогает соседей", () => {
    const before = threeSegments();

    const after = replaceSegment(before, 1, { everyMinutes: 90 });

    expect(after).toStrictEqual([
      segment("08:00", "12:00", 30),
      segment("12:00", "18:00", 90),
      segment("18:00", "23:00", 120),
    ]);
  });

  test("возвращает новый список, исходный не изменён", () => {
    const before = threeSegments();

    const after = replaceSegment(before, 0, { from: "07:00" });

    expect(after).not.toBe(before);
    expect(before).toStrictEqual(threeSegments());
  });

  test("номер вне списка — состав не меняется", () => {
    const before = threeSegments();

    expect(replaceSegment(before, -1, { everyMinutes: 90 })).toStrictEqual(
      before,
    );
    expect(
      replaceSegment(before, before.length, { everyMinutes: 90 }),
    ).toStrictEqual(before);
  });
});

describe("removeSegment", () => {
  test("убирает указанный отрезок, остальные остаются в прежнем порядке", () => {
    expect(removeSegment(threeSegments(), 1)).toStrictEqual([
      segment("08:00", "12:00", 30),
      segment("18:00", "23:00", 120),
    ]);
  });

  test("удаление единственного отрезка даёт пустой список", () => {
    expect(removeSegment([segment("08:00", "23:00", 60)], 0)).toStrictEqual([]);
  });

  test("исходный список не изменён", () => {
    const before = threeSegments();

    removeSegment(before, 1);

    expect(before).toStrictEqual(threeSegments());
  });
});
