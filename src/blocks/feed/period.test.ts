import { describe, expect, it } from "vitest";

import {
  MAX_RANGE_DAYS,
  currentMonth,
  isWholeMonths,
  lastDays,
  localToday,
  parseDayRange,
  parseLocalDate,
  periodNav,
  rangeBounds,
  rangeDayCount,
  rangeWindow,
  relativeDay,
  resolvePeriodAsk,
  shiftLocalDate,
  shiftRange,
} from "./period";

const NOW = new Date("2026-09-05T12:00:00Z");

describe("parseLocalDate", () => {
  it("принимает только настоящую дату «ГГГГ-ММ-ДД»", () => {
    expect(parseLocalDate("2026-09-05")).toBe("2026-09-05");
    expect(parseLocalDate("2024-02-29")).toBe("2024-02-29");
  });

  it("отвергает несуществующий день: 31 сентября не превращается в 1 октября", () => {
    expect(parseLocalDate("2026-09-31")).toBeNull();
    expect(parseLocalDate("2026-02-29")).toBeNull();
    expect(parseLocalDate("2026-13-01")).toBeNull();
  });

  it("отвергает всё, что не дата: значение приходит из адреса, то есть от кого угодно", () => {
    expect(parseLocalDate("2026-9-5")).toBeNull();
    expect(parseLocalDate("2026-09-05T00:00")).toBeNull();
    expect(parseLocalDate("")).toBeNull();
    expect(parseLocalDate(undefined)).toBeNull();
    expect(parseLocalDate(["2026-09-05"])).toBeNull();
  });
});

describe("parseDayRange", () => {
  it("пара дат — период с обеими границами включительно", () => {
    expect(parseDayRange("2026-09-01", "2026-09-30")).toStrictEqual({
      from: "2026-09-01",
      to: "2026-09-30",
    });
  });

  it("перепутанные местами границы меняются, а не дают пустой экран", () => {
    expect(parseDayRange("2026-09-30", "2026-09-01")).toStrictEqual({
      from: "2026-09-01",
      to: "2026-09-30",
    });
  });

  it("без одной из границ периода нет", () => {
    expect(parseDayRange("2026-09-01", undefined)).toBeNull();
    expect(parseDayRange("мусор", "2026-09-01")).toBeNull();
  });

  it("слишком длинный период обрезается до предела, считая от верхней границы", () => {
    const range = parseDayRange("2020-01-01", "2026-09-30");

    expect(range?.to).toBe("2026-09-30");
    expect(range === null ? 0 : rangeDayCount(range)).toBe(MAX_RANGE_DAYS);
  });

  it("предел можно задать свой: отчёт по обходам держит не больше месяца", () => {
    const range = parseDayRange("2026-08-01", "2026-09-30", 31);

    expect(range).toStrictEqual({ from: "2026-08-31", to: "2026-09-30" });
  });
});

describe("localToday и currentMonth", () => {
  it("сегодня — по поясу экрана: 20:00 UTC в Алматы уже следующее число", () => {
    expect(localToday(new Date("2026-09-30T20:00:00Z"), "Asia/Almaty")).toBe(
      "2026-10-01",
    );
    expect(localToday(new Date("2026-09-30T20:00:00Z"), "UTC")).toBe(
      "2026-09-30",
    );
  });

  it("по умолчанию — текущий месяц целиком, с первого по последнее число", () => {
    expect(currentMonth(NOW, "UTC")).toStrictEqual({
      from: "2026-09-01",
      to: "2026-09-30",
    });
    expect(currentMonth(new Date("2028-02-10T12:00:00Z"), "UTC")).toStrictEqual(
      { from: "2028-02-01", to: "2028-02-29" },
    );
  });

  it("месяц определяется местной датой: в Алматы 1 октября уже октябрь", () => {
    expect(
      currentMonth(new Date("2026-09-30T20:00:00Z"), "Asia/Almaty"),
    ).toStrictEqual({ from: "2026-10-01", to: "2026-10-31" });
  });
});

describe("lastDays — перевод старых адресов «7/30 дней» и «сегодня/неделя/месяц»", () => {
  it("N дней — сегодня и N−1 предыдущих суток", () => {
    expect(lastDays(7, NOW, "UTC")).toStrictEqual({
      from: "2026-08-30",
      to: "2026-09-05",
    });
    expect(lastDays(1, NOW, "UTC")).toStrictEqual({
      from: "2026-09-05",
      to: "2026-09-05",
    });
    expect(lastDays(30, NOW, "UTC")).toStrictEqual({
      from: "2026-08-07",
      to: "2026-09-05",
    });
  });
});

describe("shiftRange — стрелки ← →", () => {
  it("целый месяц листается месяцем, а не на 30 дней", () => {
    const september = { from: "2026-09-01", to: "2026-09-30" };

    expect(shiftRange(september, 1)).toStrictEqual({
      from: "2026-10-01",
      to: "2026-10-31",
    });
    expect(shiftRange(september, -1)).toStrictEqual({
      from: "2026-08-01",
      to: "2026-08-31",
    });
  });

  it("месяц через февраль остаётся месяцем: из марта — в февраль с 28-м", () => {
    expect(
      shiftRange({ from: "2026-03-01", to: "2026-03-31" }, -1),
    ).toStrictEqual({ from: "2026-02-01", to: "2026-02-28" });
  });

  it("несколько целых месяцев листаются на столько же месяцев", () => {
    expect(
      shiftRange({ from: "2026-01-01", to: "2026-03-31" }, 1),
    ).toStrictEqual({ from: "2026-04-01", to: "2026-06-30" });
    expect(
      shiftRange({ from: "2026-11-01", to: "2026-12-31" }, 1),
    ).toStrictEqual({ from: "2027-01-01", to: "2027-02-28" });
  });

  it("произвольный отрезок листается на свою длину, без зазора и без нахлёста", () => {
    const week = { from: "2026-09-03", to: "2026-09-09" };

    expect(shiftRange(week, 1)).toStrictEqual({
      from: "2026-09-10",
      to: "2026-09-16",
    });
    expect(shiftRange(week, -1)).toStrictEqual({
      from: "2026-08-27",
      to: "2026-09-02",
    });
  });

  it("один день листается днём", () => {
    expect(
      shiftRange({ from: "2026-09-05", to: "2026-09-05" }, -1),
    ).toStrictEqual({ from: "2026-09-04", to: "2026-09-04" });
  });

  it("неполный месяц — не месяц: с 1-го по 29 сентября листается на 29 дней", () => {
    expect(
      shiftRange({ from: "2026-09-01", to: "2026-09-29" }, 1),
    ).toStrictEqual({ from: "2026-09-30", to: "2026-10-28" });
  });
});

describe("isWholeMonths и rangeDayCount", () => {
  it("узнаёт целые месяцы и считает дни включительно", () => {
    expect(isWholeMonths({ from: "2026-02-01", to: "2026-02-28" })).toBe(true);
    expect(isWholeMonths({ from: "2026-02-02", to: "2026-02-28" })).toBe(false);
    expect(isWholeMonths({ from: "2026-02-01", to: "2026-02-27" })).toBe(false);
    expect(rangeDayCount({ from: "2026-09-01", to: "2026-09-30" })).toBe(30);
    expect(rangeDayCount({ from: "2026-09-05", to: "2026-09-05" })).toBe(1);
  });
});

describe("shiftLocalDate", () => {
  it("сдвигает дату по календарю через границы месяца и года", () => {
    expect(shiftLocalDate("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftLocalDate("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("rangeBounds — границы периода во времени", () => {
  it("сутки — целиком в поясе экрана, а не последние 24 часа", () => {
    const range = rangeBounds(
      { from: "2026-09-05", to: "2026-09-05" },
      "Asia/Almaty",
    );

    expect(range.from).toStrictEqual(new Date("2026-09-04T19:00:00Z"));
    expect(range.to).toStrictEqual(new Date("2026-09-05T18:59:59.999Z"));
  });

  it("верхняя граница включает последнюю миллисекунду суток: слой доступа сравнивает включительно", () => {
    const range = rangeBounds({ from: "2026-09-01", to: "2026-09-30" }, "UTC");

    expect(range.from).toStrictEqual(new Date("2026-09-01T00:00:00Z"));
    expect(range.to).toStrictEqual(new Date("2026-09-30T23:59:59.999Z"));
  });

  it("границы — начало суток даже через перевод часов (Берлин, 29 марта 2026)", () => {
    const range = rangeBounds(
      { from: "2026-03-26", to: "2026-03-29" },
      "Europe/Berlin",
    );

    expect(range.from).toStrictEqual(new Date("2026-03-25T23:00:00Z"));
    // 30 марта начинается уже по летнему времени, в 22:00 UTC.
    expect(range.to).toStrictEqual(new Date("2026-03-29T21:59:59.999Z"));
  });

  it("пояс с большим смещением не сдвигает сутки на день (Киритимати, UTC+14)", () => {
    const range = rangeBounds(
      { from: "2026-09-05", to: "2026-09-05" },
      "Pacific/Kiritimati",
    );

    expect(range.from).toStrictEqual(new Date("2026-09-04T10:00:00Z"));
  });
});

describe("rangeWindow — окно счёта статистики", () => {
  it("верхняя граница — момент просмотра, если период его захватывает: будущее в счёт не идёт", () => {
    const window = rangeWindow(
      { from: "2026-09-01", to: "2026-09-30" },
      NOW,
      "UTC",
    );

    expect(window.from).toStrictEqual(new Date("2026-09-01T00:00:00Z"));
    expect(window.to).toStrictEqual(NOW);
  });

  it("прошедший период считается до конца своего последнего дня", () => {
    const window = rangeWindow(
      { from: "2026-08-01", to: "2026-08-31" },
      NOW,
      "UTC",
    );

    expect(window.to).toStrictEqual(new Date("2026-08-31T23:59:59.999Z"));
  });
});

describe("relativeDay", () => {
  const now = new Date("2026-09-05T12:00:00Z");

  it("сегодняшнее заполнение показывается одним временем, без даты", () => {
    expect(relativeDay(new Date("2026-09-05T09:12:00Z"), now, "UTC")).toBe(
      "today",
    );
  });

  it("вчерашнее — «вчера», а не голое время: иначе 21:40 читается как сегодняшнее", () => {
    expect(relativeDay(new Date("2026-09-04T21:40:00Z"), now, "UTC")).toBe(
      "yesterday",
    );
  });

  it("позавчерашнее и старше показывается датой", () => {
    expect(relativeDay(new Date("2026-09-03T21:40:00Z"), now, "UTC")).toBe(
      "older",
    );
  });

  it("сутки считаются в поясе пиццерии: 20:00 UTC в Алматы — это уже завтра", () => {
    expect(
      relativeDay(new Date("2026-09-04T20:00:00Z"), now, "Asia/Almaty"),
    ).toBe("today");
  });

  it("заполнение из будущего (часы сервера сдвинули) не ломает экран", () => {
    expect(relativeDay(new Date("2026-09-06T09:00:00Z"), now, "UTC")).toBe(
      "today",
    );
  });
});

describe("resolvePeriodAsk — что показывает экран", () => {
  it("без своих дат — текущий месяц по поясу экрана", () => {
    expect(resolvePeriodAsk(undefined, NOW, "UTC")).toStrictEqual({
      from: "2026-09-01",
      to: "2026-09-30",
    });
  });

  it("старый адрес «7 дней» — тот же отрезок, что и раньше, датами", () => {
    expect(
      resolvePeriodAsk({ kind: "lastDays", days: 7 }, NOW, "UTC"),
    ).toStrictEqual({ from: "2026-08-30", to: "2026-09-05" });
  });

  it("пара дат — как есть, но не длиннее предела экрана", () => {
    const range = { from: "2026-08-01", to: "2026-09-30" };

    expect(resolvePeriodAsk({ kind: "range", range }, NOW, "UTC")).toBe(range);
    expect(
      resolvePeriodAsk({ kind: "range", range }, NOW, "UTC", 31),
    ).toStrictEqual({ from: "2026-08-31", to: "2026-09-30" });
  });
});

describe("periodNav — куда ведут стрелки", () => {
  it("назад можно всегда, вперёд — пока следующий отрезок начинается не позже сегодня", () => {
    const nav = periodNav({ from: "2026-09-01", to: "2026-09-30" }, NOW, "UTC");

    expect(nav.previous).toStrictEqual({
      from: "2026-08-01",
      to: "2026-08-31",
    });
    expect(nav.next).toBeNull();
  });

  it("из прошлого месяца стрелка вперёд ведёт в текущий", () => {
    const nav = periodNav({ from: "2026-08-01", to: "2026-08-31" }, NOW, "UTC");

    expect(nav.next).toStrictEqual({ from: "2026-09-01", to: "2026-09-30" });
  });

  it("отрезок, кончившийся вчера, листается вперёд на сегодняшний", () => {
    const nav = periodNav({ from: "2026-09-04", to: "2026-09-04" }, NOW, "UTC");

    expect(nav.next).toStrictEqual({ from: "2026-09-05", to: "2026-09-05" });
  });

  it("сегодня — по поясу экрана: в Алматы 1 октября уже можно листнуть в октябрь", () => {
    const nav = periodNav(
      { from: "2026-09-01", to: "2026-09-30" },
      new Date("2026-09-30T20:00:00Z"),
      "Asia/Almaty",
    );

    expect(nav.next).toStrictEqual({ from: "2026-10-01", to: "2026-10-31" });
  });
});
