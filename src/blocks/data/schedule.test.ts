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

describe("окно «без ограничения» (T160)", () => {
  // «00:00–24:00» — одно из трёх готовых окон редактора (`window-field.ts`), и в
  // колонке `time` это законное значение. Час 24 общий `parseLocalTime` не разбирает
  // никогда — и вся регулярность под таким окном молча выключалась: ни отказа, ни следа.
  const WHOLE_DAY = {
    start: "00:00:00",
    end: "24:00:00",
  } satisfies ChecklistWindow;
  const FROM_MORNING = {
    start: "08:00",
    end: "24:00",
  } satisfies ChecklistWindow;

  test("время суток лежит ВНУТРИ такого окна, а не вне его", () => {
    expect(offsetInWindow(WHOLE_DAY, "00:00")).toBe(0);
    expect(offsetInWindow(WHOLE_DAY, "12:00")).toBe(720);
    expect(offsetInWindow(WHOLE_DAY, "23:59")).toBe(1439);
    expect(offsetInWindow(FROM_MORNING, "08:00")).toBe(0);
    expect(offsetInWindow(FROM_MORNING, "23:59")).toBe(959);
    expect(offsetInWindow(FROM_MORNING, "07:59")).toBeNull();
  });

  test("обходы под ним есть: круглые сутки часовым шагом — двадцать четыре прохода", () => {
    const got = intervalsForItem(
      item([every("00:00", "23:59", 60)]),
      WHOLE_DAY,
      "normal",
    );
    expect(got).toHaveLength(24);
    expect(got[0]).toEqual({ startMinutes: 0, endMinutes: 60 });
    expect(got.at(-1)).toEqual({ startMinutes: 1380, endMinutes: 1439 });
  });

  test("окно с 08:00 до конца суток обрезает сетку концом суток, а не серединой", () => {
    const got = intervalsForItem(
      item([every("22:00", "23:59", 60)]),
      FROM_MORNING,
      "normal",
    );
    expect(got).toEqual([
      { startMinutes: 840, endMinutes: 900 },
      { startMinutes: 900, endMinutes: 959 },
    ]);
  });

  test("граница суток законна только как КОНЕЦ окна: ни отметкой, ни границей отрезка", () => {
    expect(parseLocalTime("24:00")).toBeNull();
    expect(offsetInWindow(WHOLE_DAY, "24:00")).toBeNull();
    expect(() => {
      assertValidSchedule([every("00:00", "24:00", 60)]);
    }).toThrow(RangeError);
  });
});

describe("пересекающиеся отрезки (T161)", () => {
  // Отметка встаёт в ОДИН проход (D066: `currentInterval` берёт первый подходящий).
  // Два прохода, идущих в один и тот же миг, значат ровно одно: второй закроется без
  // отметки и покажет «пропущено» тому, кто обход сделал. Ложное обвинение — тот же
  // вред, что и отказ сотруднику, только с другой стороны.
  const WORKDAY = { start: "06:00", end: "22:00" } satisfies ChecklistWindow;

  test("отвергает наложенные друг на друга отрезки", () => {
    expect(() => {
      assertValidSchedule([
        every("08:00", "16:00", 60),
        every("08:20", "16:00", 60),
      ]);
    }).toThrow(RangeError);
  });

  test("отвергает полное совпадение и вложенность", () => {
    expect(() => {
      assertValidSchedule([
        every("08:00", "16:00", 60),
        every("08:00", "16:00", 120),
      ]);
    }).toThrow(RangeError);
    expect(() => {
      assertValidSchedule([
        every("08:00", "16:00", 60),
        every("10:00", "12:00", 30),
      ]);
    }).toThrow(RangeError);
  });

  test("отвергает пересечение через полночь", () => {
    expect(() => {
      assertValidSchedule([
        every("22:00", "02:00", 60),
        every("01:00", "05:00", 60),
      ]);
    }).toThrow(RangeError);
  });

  test("называет оба отрезка: иначе методист ищет пересечение глазами", () => {
    expect(() => {
      assertValidSchedule([
        every("06:00", "08:00", 60),
        every("08:00", "12:00", 60),
        every("10:00", "14:00", 60),
      ]);
    }).toThrow(/2 и 3/);
  });

  test("смежные отрезки пересечением НЕ считаются: их и предлагает кнопка «добавить»", () => {
    expect(() => {
      assertValidSchedule([
        every("08:00", "12:00", 60),
        every("12:00", "16:00", 120),
      ]);
    }).not.toThrow();
    expect(() => {
      assertValidSchedule([
        every("22:00", "02:00", 60),
        every("02:00", "06:00", 60),
      ]);
    }).not.toThrow();
  });

  test("до сетки проходов пересечение не доезжает", () => {
    // Раньше: под этим окном отрезки давали в 09:10 сразу два прохода (140–200 и
    // 180–240). Отметка вставала в первый, второй закрывался в 10:30 без своей
    // отметки — и уезжал в отчёт пропуском.
    expect(() =>
      intervalsForItem(
        item([every("08:00", "16:00", 60), every("08:20", "16:00", 60)]),
        WORKDAY,
        "normal",
      ),
    ).toThrow(RangeError);
  });

  test("у законного расписания два прохода никогда не идут одновременно", () => {
    const cases: { schedule: ScheduleSegment[]; window: ChecklistWindow }[] = [
      { schedule: [every("08:00", "16:00", 60)], window: WORKDAY },
      {
        schedule: [every("08:00", "12:00", 30), every("12:00", "22:00", 120)],
        window: WORKDAY,
      },
      {
        schedule: [every("22:00", "02:00", 60), every("02:00", "06:00", 120)],
        window: NIGHT,
      },
      {
        schedule: [every("00:00", "23:59", 60)],
        window: { start: "00:00", end: "24:00" },
      },
    ];
    for (const { schedule, window } of cases) {
      const intervals = intervalsForItem(item(schedule), window, "normal");
      expect(intervals.length, JSON.stringify(schedule)).toBeGreaterThan(0);
      for (const [index, interval] of intervals.entries()) {
        const next = intervals[index + 1];
        if (next === undefined) continue;
        expect(
          next.startMinutes,
          JSON.stringify(schedule),
        ).toBeGreaterThanOrEqual(interval.endMinutes);
      }
    }
  });
});
