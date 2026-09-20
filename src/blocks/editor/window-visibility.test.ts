import { describe, expect, it } from "vitest";

import { closedWindowNotice, windowVisibility } from "./window-visibility";

describe("windowVisibility", () => {
  it("окно открыто: местное время внутри границ", () => {
    const verdict = windowVisibility({ start: "06:00", end: "11:00" }, "08:15");

    expect(verdict).toEqual({ open: true, opensAt: "06:00", tomorrow: false });
  });

  it("начало окна включительно: ровно 06:00 — уже открыто", () => {
    const verdict = windowVisibility({ start: "06:00", end: "11:00" }, "06:00");

    expect(verdict?.open).toBe(true);
  });

  it("конец окна исключительно: ровно 11:00 — уже закрыто", () => {
    const verdict = windowVisibility({ start: "06:00", end: "11:00" }, "11:00");

    expect(verdict?.open).toBe(false);
  });

  it("публикация в 11:30 в утреннее окно: сотрудник увидит её завтра с 06:00", () => {
    const verdict = windowVisibility({ start: "06:00", end: "11:00" }, "11:30");

    expect(verdict).toEqual({ open: false, opensAt: "06:00", tomorrow: true });
  });

  it("публикация в 11:30 в вечернее окно: сотрудник увидит её сегодня с 20:00", () => {
    const verdict = windowVisibility({ start: "20:00", end: "00:00" }, "11:30");

    expect(verdict).toEqual({ open: false, opensAt: "20:00", tomorrow: false });
  });

  it("окно без ограничения (00:00–24:00) открыто в любой час", () => {
    for (const now of ["00:00", "11:30", "23:59"]) {
      expect(
        windowVisibility({ start: "00:00", end: "24:00" }, now)?.open,
      ).toBe(true);
    }
  });

  it("окно через полночь открыто до и после полуночи", () => {
    const window = { start: "22:00", end: "02:00" };

    expect(windowVisibility(window, "23:10")?.open).toBe(true);
    expect(windowVisibility(window, "01:10")?.open).toBe(true);
  });

  it("окно через полночь закрыто днём и откроется сегодня же", () => {
    const verdict = windowVisibility({ start: "22:00", end: "02:00" }, "11:30");

    expect(verdict).toEqual({ open: false, opensAt: "22:00", tomorrow: false });
  });

  it("границы с секундами из базы читаются и показываются без них", () => {
    const verdict = windowVisibility(
      { start: "06:00:00", end: "11:00:00" },
      "11:30:41",
    );

    expect(verdict).toEqual({ open: false, opensAt: "06:00", tomorrow: true });
  });

  it("непонятное время не даёт вердикта: молчание вместо выдумки", () => {
    expect(windowVisibility({ start: "06:00", end: "11:00" }, "")).toBeNull();
    expect(windowVisibility({ start: "", end: "11:00" }, "11:30")).toBeNull();
    expect(
      windowVisibility({ start: "06:00", end: "нет" }, "11:30"),
    ).toBeNull();
    expect(
      windowVisibility({ start: "06:00", end: "11:00" }, "25:00"),
    ).toBeNull();
  });
});

describe("closedWindowNotice", () => {
  it("окно закрыто: сообщение несёт всё, что назовёт экран", () => {
    const notice = closedWindowNotice(
      { start: "06:00", end: "11:00" },
      "11:30",
    );

    expect(notice).toEqual({
      now: "11:30",
      start: "06:00",
      end: "11:00",
      opensAt: "06:00",
      tomorrow: true,
    });
  });

  it("окно открыто — сообщения нет: говорить нечего", () => {
    expect(
      closedWindowNotice({ start: "06:00", end: "11:00" }, "08:15"),
    ).toBeNull();
  });

  it("круглосуточное окно не даёт сообщения ни в один час", () => {
    expect(
      closedWindowNotice({ start: "00:00", end: "24:00" }, "23:59"),
    ).toBeNull();
  });

  it("непонятное время не даёт сообщения, а не сообщение о закрытом окне", () => {
    expect(closedWindowNotice({ start: "06:00", end: "11:00" }, "")).toBeNull();
  });
});
