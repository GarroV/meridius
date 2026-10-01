// Статус чек-листа на сегодня (D179): правило выбора прохода и итог по нему.
//
// Факты о проходах (границы, заполнение, режим) приносит запрос базы, а здесь — только
// правило, поэтому оно проверяется без базы, на моментах с известным ответом.
import { describe, expect, test } from "vitest";

import {
  countToday,
  isMissedToday,
  todayStatusOf,
  type ChecklistDay,
  type PassFacts,
} from "./today-status";

const at = (iso: string): Date => new Date(iso);

/** Утреннее окно 06:00–12:00 по UTC, 06.09.2026. */
function morning(overrides: Partial<PassFacts> = {}): PassFacts {
  return {
    startAt: at("2026-09-06T06:00:00Z"),
    endAt: at("2026-09-06T12:00:00Z"),
    filledAt: null,
    expected: true,
    ...overrides,
  };
}

/** У обычного окна проход «сегодня» один: и заканчивается, и начинается сегодня. */
function sameDay(pass: PassFacts): ChecklistDay {
  return { endingToday: pass, startingToday: pass };
}

describe("статус чек-листа на сегодня", () => {
  test("до открытия окна — ждёт, со временем открытия", () => {
    expect(
      todayStatusOf(sameDay(morning()), at("2026-09-06T04:00:00Z")),
    ).toStrictEqual({ kind: "upcoming", at: at("2026-09-06T06:00:00Z") });
  });

  test("окно открыто и не заполнено — открыто, со временем закрытия", () => {
    expect(
      todayStatusOf(sameDay(morning()), at("2026-09-06T09:00:00Z")),
    ).toStrictEqual({ kind: "open", at: at("2026-09-06T12:00:00Z") });
  });

  test("заполнен внутри окна — заполнен, со временем заполнения, даже пока окно открыто", () => {
    const filledAt = at("2026-09-06T08:30:00Z");
    expect(
      todayStatusOf(sameDay(morning({ filledAt })), at("2026-09-06T09:00:00Z")),
    ).toStrictEqual({ kind: "filled", at: filledAt });
  });

  test("окно закрылось без заполнения — пропущен, со временем закрытия", () => {
    expect(
      todayStatusOf(sameDay(morning()), at("2026-09-06T14:00:00Z")),
    ).toStrictEqual({ kind: "missed", at: at("2026-09-06T12:00:00Z") });
  });

  test("ровно в минуту закрытия окно уже закрыто", () => {
    expect(
      todayStatusOf(sameDay(morning()), at("2026-09-06T12:00:00Z")).kind,
    ).toBe("missed");
  });

  test("режим смены отменил чек-лист — его не ждут, а не «пропущен»", () => {
    expect(
      todayStatusOf(
        sameDay(morning({ expected: false })),
        at("2026-09-06T14:00:00Z"),
      ),
    ).toStrictEqual({ kind: "notExpected" });
  });

  test("режим отменил чек-лист, пока окно открыто, — тоже не ждут", () => {
    expect(
      todayStatusOf(
        sameDay(morning({ expected: false })),
        at("2026-09-06T09:00:00Z"),
      ),
    ).toStrictEqual({ kind: "notExpected" });
  });

  test("пояс пиццерии неизвестен базе — так и сказано, а не «ждёт»", () => {
    expect(todayStatusOf(null, at("2026-09-06T09:00:00Z"))).toStrictEqual({
      kind: "unknownZone",
    });
  });
});

describe("окно через полночь (20:00–00:00)", () => {
  // Вчерашний вечер: 05.09 20:00 → 06.09 00:00. Сегодняшний: 06.09 20:00 → 07.09 00:00.
  const lastNight: PassFacts = {
    startAt: at("2026-09-05T20:00:00Z"),
    endAt: at("2026-09-06T00:00:00Z"),
    filledAt: null,
    expected: true,
  };
  const tonight: PassFacts = {
    startAt: at("2026-09-06T20:00:00Z"),
    endAt: at("2026-09-07T00:00:00Z"),
    filledAt: null,
    expected: true,
  };
  const day: ChecklistDay = { endingToday: lastNight, startingToday: tonight };

  test("днём статус говорит о вчерашнем вечере: он пропущен", () => {
    expect(todayStatusOf(day, at("2026-09-06T10:00:00Z"))).toStrictEqual({
      kind: "missed",
      at: at("2026-09-06T00:00:00Z"),
    });
  });

  test("в 23:00 открыт сегодняшний вечер — статус о нём, а не о вчерашнем", () => {
    expect(todayStatusOf(day, at("2026-09-06T23:00:00Z"))).toStrictEqual({
      kind: "open",
      at: at("2026-09-07T00:00:00Z"),
    });
  });

  test("тревога о пропуске смотрит только на проход, закончившийся сегодня", () => {
    // В 23:00 вечер открыт, но вчерашний проход пропущен — тревога об этом остаётся.
    expect(isMissedToday(day.endingToday, at("2026-09-06T23:00:00Z"))).toBe(
      true,
    );
  });
});

describe("пропуск для тревоги", () => {
  test("окно открыто — не пропуск", () => {
    expect(isMissedToday(morning(), at("2026-09-06T09:00:00Z"))).toBe(false);
  });

  test("закрыто и заполнено — не пропуск", () => {
    expect(
      isMissedToday(
        morning({ filledAt: at("2026-09-06T08:00:00Z") }),
        at("2026-09-06T14:00:00Z"),
      ),
    ).toBe(false);
  });

  test("закрыто, не заполнено, но режим отменил — не пропуск", () => {
    expect(
      isMissedToday(morning({ expected: false }), at("2026-09-06T14:00:00Z")),
    ).toBe(false);
  });

  test("закрыто, не заполнено, ждали — пропуск", () => {
    expect(isMissedToday(morning(), at("2026-09-06T14:00:00Z"))).toBe(true);
  });
});

describe("счёт статусов для плитки пиццерии", () => {
  test("заполнено, ждёт (до окна и в окне) и пропущено считаются раздельно", () => {
    const t = at("2026-09-06T12:00:00Z");
    expect(
      countToday([
        { kind: "filled", at: t },
        { kind: "filled", at: t },
        { kind: "upcoming", at: t },
        { kind: "open", at: t },
        { kind: "missed", at: t },
        { kind: "notExpected" },
        { kind: "unknownZone" },
      ]),
    ).toStrictEqual({ filled: 2, waiting: 2, missed: 1, total: 7 });
  });

  test("пусто — нули, а не пропуск строки", () => {
    expect(countToday([])).toStrictEqual({
      filled: 0,
      waiting: 0,
      missed: 0,
      total: 0,
    });
  });
});
