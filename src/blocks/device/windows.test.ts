// Часы привязанной вкладки: когда проснуться и когда снять недозаполненное.
//
// Проверки здесь не ради процента. Ошибка в этом расчёте молчит и стоит дорого в обе
// стороны: опознаватель окна, дрогнувший между отрисовками, снимает форму вместе с
// наполовину заполненным чек-листом посреди смены, а опознаватель, не сменившийся на
// границе, оставляет вчерашние отметки открытыми на следующую смену. Ни то, ни другое
// не видно глазом — экран в обоих случаях выглядит рабочим.
//
// Время задаётся мигом и часовым поясом пиццерии, а не «сейчас»: у машины прогона свой
// пояс, и проверка, зависящая от него, зелена только там, где её писали.
import { describe, expect, test } from "vitest";

import { tabletClock, type StationWindows } from "./windows";

const AMSTERDAM = "Europe/Amsterdam";
const SECONDS_IN_DAY = 24 * 60 * 60;

/** 23 сентября 2026, 10:00 в Амстердаме (UTC+2 летом). */
const MORNING = new Date("2026-09-23T08:00:00Z");

function station(
  windows: readonly { start: string; end: string }[],
  timeZone = AMSTERDAM,
): StationWindows {
  return { windows, timeZone };
}

describe("часы вкладки планшета", () => {
  test("окно идёт: вкладка просыпается к его концу, а не раньше", () => {
    const clock = tabletClock(
      station([{ start: "06:00:00", end: "23:00:00" }]),
      MORNING,
    );

    // 10:00 → 23:00 — тринадцать часов.
    expect(clock.nextChangeInSeconds).toBe(13 * 60 * 60);
    expect(clock.opensInSeconds).toBeNull();
  });

  test("окно ещё не открылось: вкладка говорит, через сколько откроется", () => {
    const clock = tabletClock(
      station([{ start: "18:00:00", end: "23:00:00" }]),
      MORNING,
    );

    expect(clock.opensInSeconds).toBe(8 * 60 * 60);
    expect(clock.nextChangeInSeconds).toBe(8 * 60 * 60);
  });

  test("опознаватель окна НЕ меняется, пока окно то же самое", () => {
    const windows = station([{ start: "06:00:00", end: "23:00:00" }]);
    const early = tabletClock(windows, MORNING);
    const later = tabletClock(
      windows,
      new Date(MORNING.getTime() + 37 * 60 * 1000),
    );

    // Тридцать семь минут спустя — то же окно, значит та же форма и тот же черновик.
    expect(later.windowKey).toBe(early.windowKey);
  });

  test("опознаватель окна меняется, когда окно сменилось", () => {
    const windows = station([
      { start: "06:00:00", end: "12:00:00" },
      { start: "12:00:00", end: "23:00:00" },
    ]);

    const before = tabletClock(windows, MORNING);
    // 12:30 по Амстердаму — идёт уже второе окно.
    const after = tabletClock(windows, new Date("2026-09-23T10:30:00Z"));

    expect(after.windowKey).not.toBe(before.windowKey);
  });

  test("окно через полночь считается открытым и до, и после неё", () => {
    const night = station([{ start: "22:00:00", end: "04:00:00" }]);

    // 01:00 по Амстердаму — ночная смена идёт.
    const inside = tabletClock(night, new Date("2026-09-23T23:00:00Z"));
    expect(inside.opensInSeconds).toBeNull();
    expect(inside.nextChangeInSeconds).toBe(3 * 60 * 60);

    // 10:00 — уже закрылось, до открытия двенадцать часов.
    const outside = tabletClock(night, MORNING);
    expect(outside.opensInSeconds).toBe(12 * 60 * 60);
  });

  test("граница ровно сейчас отодвигается на сутки, а не зовёт просыпаться в ноль секунд", () => {
    // 06:00 по Амстердаму — миг открытия окна.
    const clock = tabletClock(
      station([{ start: "06:00:00", end: "23:00:00" }]),
      new Date("2026-09-23T04:00:00Z"),
    );

    // Ближайшая граница — конец окна, а не его начало: начало наступило только что.
    expect(clock.nextChangeInSeconds).toBe(17 * 60 * 60);
    expect(clock.nextChangeInSeconds).not.toBe(0);
    expect(clock.nextChangeInSeconds).toBeLessThan(SECONDS_IN_DAY);
  });

  test("у станции без опубликованных чек-листов будить вкладку не за чем", () => {
    const empty = tabletClock(station([]), MORNING);

    expect(empty.nextChangeInSeconds).toBeNull();
    expect(empty.opensInSeconds).toBeNull();
    expect(tabletClock(null, MORNING).windowKey).toBe(empty.windowKey);
  });

  test("время считается по поясу ПИЦЦЕРИИ, а не по поясу машины", () => {
    const windows = [{ start: "06:00:00", end: "23:00:00" }];

    // Один и тот же миг: в Амстердаме 10:00 (окно идёт), в Окленде 20:00 следующего
    // дня — тоже идёт, но до конца остаётся другое время.
    const amsterdam = tabletClock(station(windows), MORNING);
    const auckland = tabletClock(station(windows, "Pacific/Auckland"), MORNING);

    expect(amsterdam.nextChangeInSeconds).not.toBe(
      auckland.nextChangeInSeconds,
    );
  });
});
