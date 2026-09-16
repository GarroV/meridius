import { describe, expect, test } from "vitest";

import {
  assertValidSchedule,
  closedIntervals,
  currentInterval,
  formatLocalTime,
  intervalsForItem,
  isPeriodic,
  offsetInWindow,
  parseLocalTime,
} from "./schedule";
import type { ChecklistWindow, Item, ScheduleSegment } from "./types";

const DAY = { start: "08:00", end: "23:00" } satisfies ChecklistWindow;
const NIGHT = { start: "22:00", end: "02:00" } satisfies ChecklistWindow;

function item(schedule?: ScheduleSegment[], rest: Partial<Item> = {}): Item {
  return {
    id: "i",
    title: { ru: "пункт", en: "item" },
    type: "bool",
    ...(schedule ? { schedule } : {}),
    ...rest,
  };
}

/** Смещение в окне, но с внятным отказом: тест, промахнувшийся мимо окна, обязан сказать это вслух. */
function at(window: ChecklistWindow, localTime: string): number {
  const offset = offsetInWindow(window, localTime);
  if (offset === null) {
    throw new Error(`${localTime} вне окна ${window.start}—${window.end}`);
  }
  return offset;
}

const every = (
  from: string,
  to: string,
  everyMinutes: number,
): ScheduleSegment => ({
  from,
  to,
  everyMinutes,
});

describe("parseLocalTime", () => {
  test("читает часы и минуты в минуты от полуночи", () => {
    expect(parseLocalTime("08:00")).toBe(480);
    expect(parseLocalTime("00:00")).toBe(0);
    expect(parseLocalTime("23:59")).toBe(1439);
  });

  test("принимает время с секундами: так его отдаёт PostgreSQL", () => {
    expect(parseLocalTime("08:00:00")).toBe(480);
  });

  test("возвращает null на том, что временем не является", () => {
    for (const bad of ["", "8:00", "24:00", "08:60", "восемь", "08-00"]) {
      expect(parseLocalTime(bad), bad).toBeNull();
    }
  });
});

describe("formatLocalTime", () => {
  test("печатает минуты обратно временем", () => {
    expect(formatLocalTime(480)).toBe("08:00");
    expect(formatLocalTime(0)).toBe("00:00");
  });

  test("сутки за краем сворачиваются: 25:00 это 01:00 следующих суток", () => {
    expect(formatLocalTime(1500)).toBe("01:00");
  });
});

describe("isPeriodic", () => {
  test("пункт без расписания обычный", () => {
    expect(isPeriodic(item())).toBe(false);
  });

  test("пункт с пустым расписанием тоже обычный: пустой список не делает его периодическим", () => {
    expect(isPeriodic(item([]))).toBe(false);
  });

  test("пункт с отрезком периодический", () => {
    expect(isPeriodic(item([every("08:00", "16:00", 60)]))).toBe(true);
  });
});

describe("offsetInWindow", () => {
  test("считает минуты от начала окна", () => {
    expect(offsetInWindow(DAY, "08:00")).toBe(0);
    expect(offsetInWindow(DAY, "11:30")).toBe(210);
  });

  test("окно через полночь продолжает считать вперёд, а не сбрасывается", () => {
    expect(offsetInWindow(NIGHT, "23:00")).toBe(60);
    expect(offsetInWindow(NIGHT, "01:00")).toBe(180);
  });

  test("время вне окна не имеет смещения", () => {
    expect(offsetInWindow(DAY, "07:59")).toBeNull();
    expect(offsetInWindow(DAY, "23:00")).toBeNull();
    expect(offsetInWindow(NIGHT, "12:00")).toBeNull();
  });
});

describe("intervalsForItem", () => {
  test("равномерный отрезок разворачивается по шагу", () => {
    const got = intervalsForItem(
      item([every("08:00", "12:00", 60)]),
      DAY,
      "normal",
    );
    expect(got.map((i) => formatLocalTime(i.startMinutes + 480))).toEqual([
      "08:00",
      "09:00",
      "10:00",
      "11:00",
    ]);
  });

  test("конец отрезка — конец периода, а не время последнего обхода", () => {
    const got = intervalsForItem(
      item([every("08:00", "12:00", 60)]),
      DAY,
      "normal",
    );
    expect(got.map((i) => formatLocalTime(i.endMinutes + 480))).toEqual([
      "09:00",
      "10:00",
      "11:00",
      "12:00",
    ]);
  });

  test("два отрезка с разным шагом складываются в одну сетку", () => {
    const got = intervalsForItem(
      item([every("08:00", "10:00", 60), every("10:00", "14:00", 120)]),
      DAY,
      "normal",
    );
    expect(got.map((i) => formatLocalTime(i.startMinutes + 480))).toEqual([
      "08:00",
      "09:00",
      "10:00",
      "12:00",
    ]);
  });

  test("последний интервал укорачивается концом отрезка, а не вылезает за него", () => {
    const got = intervalsForItem(
      item([every("08:00", "11:00", 120)]),
      DAY,
      "normal",
    );
    expect(got.map((i) => formatLocalTime(i.endMinutes + 480))).toEqual([
      "10:00",
      "11:00",
    ]);
  });

  test("отрезок, вылезающий за окно чек-листа, обрезается окном", () => {
    const got = intervalsForItem(
      item([every("06:00", "10:00", 60)]),
      DAY,
      "normal",
    );
    expect(got.map((i) => formatLocalTime(i.startMinutes + 480))).toEqual([
      "08:00",
      "09:00",
    ]);
  });

  test("отрезок целиком вне окна не даёт интервалов", () => {
    expect(
      intervalsForItem(item([every("03:00", "06:00", 60)]), DAY, "normal"),
    ).toEqual([]);
  });

  test("окно через полночь разворачивается сквозь неё", () => {
    const got = intervalsForItem(
      item([every("23:00", "01:00", 60)]),
      NIGHT,
      "normal",
    );
    expect(got.map((i) => formatLocalTime(i.startMinutes + 1320))).toEqual([
      "23:00",
      "00:00",
    ]);
  });

  test("пункт без расписания интервалов не даёт", () => {
    expect(intervalsForItem(item(), DAY, "normal")).toEqual([]);
  });

  test("пункт, выпавший по режиму смены, не даёт интервалов: сегодня его нет вовсе", () => {
    const normal = item([every("08:00", "12:00", 60)], { severity: "normal" });
    expect(intervalsForItem(normal, DAY, "normal")).toHaveLength(4);
    expect(intervalsForItem(normal, DAY, "critical")).toEqual([]);
  });

  test("критичный пункт остаётся во всех режимах", () => {
    const critical = item([every("08:00", "12:00", 60)], {
      severity: "critical",
    });
    for (const mode of ["normal", "reduced", "critical"] as const) {
      expect(intervalsForItem(critical, DAY, mode), mode).toHaveLength(4);
    }
  });

  test("интервалы идут подряд и не перекрываются", () => {
    const got = intervalsForItem(
      item([every("08:00", "10:00", 60), every("10:00", "14:00", 120)]),
      DAY,
      "normal",
    );
    let previousEnd = Number.NEGATIVE_INFINITY;
    for (const interval of got) {
      expect(interval.startMinutes).toBeGreaterThanOrEqual(previousEnd);
      previousEnd = interval.endMinutes;
    }
  });
});

describe("currentInterval", () => {
  const intervals = intervalsForItem(
    item([every("08:00", "12:00", 60)]),
    DAY,
    "normal",
  );

  test("находит интервал, внутри которого идёт время", () => {
    expect(currentInterval(intervals, at(DAY, "10:20"))?.startMinutes).toBe(
      120,
    );
  });

  test("граница принадлежит начинающемуся интервалу, а не кончающемуся", () => {
    expect(currentInterval(intervals, at(DAY, "10:00"))?.startMinutes).toBe(
      120,
    );
  });

  test("после последнего интервала текущего нет", () => {
    expect(currentInterval(intervals, at(DAY, "12:30"))).toBeNull();
  });

  test("в пустой сетке текущего нет", () => {
    expect(currentInterval([], 0)).toBeNull();
  });
});

describe("closedIntervals", () => {
  const intervals = intervalsForItem(
    item([every("08:00", "12:00", 60)]),
    DAY,
    "normal",
  );

  test("закрытыми считаются только те, чей конец уже прошёл", () => {
    const got = closedIntervals(intervals, at(DAY, "10:20"));
    expect(got.map((i) => formatLocalTime(i.startMinutes + 480))).toEqual([
      "08:00",
      "09:00",
    ]);
  });

  test("идущий интервал ещё не закрыт: по нему не может быть пропуска", () => {
    const got = closedIntervals(intervals, at(DAY, "10:00"));
    expect(got).toHaveLength(2);
  });

  test("в конце прохода закрыты все", () => {
    expect(closedIntervals(intervals, at(DAY, "22:59"))).toHaveLength(4);
  });
});

describe("assertValidSchedule", () => {
  test("молчит на исправном расписании", () => {
    expect(() => {
      assertValidSchedule([every("08:00", "16:00", 60)]);
    }).not.toThrow();
  });

  test("падает на нулевом и отрицательном шаге: иначе разворот зациклится", () => {
    expect(() => {
      assertValidSchedule([every("08:00", "16:00", 0)]);
    }).toThrow();
    expect(() => {
      assertValidSchedule([every("08:00", "16:00", -60)]);
    }).toThrow();
  });

  test("падает на шаге, который не делится на минуту", () => {
    expect(() => {
      assertValidSchedule([every("08:00", "16:00", 1.5)]);
    }).toThrow();
  });

  test("падает на сломанном времени", () => {
    expect(() => {
      assertValidSchedule([every("8:00", "16:00", 60)]);
    }).toThrow();
  });

  test("падает на пустом отрезке: он молча не дал бы ни одного обхода", () => {
    expect(() => {
      assertValidSchedule([every("08:00", "08:00", 60)]);
    }).toThrow();
  });

  test("падает на том, что вообще не список отрезков", () => {
    expect(() => {
      assertValidSchedule("каждый час" as never);
    }).toThrow();
  });
});
