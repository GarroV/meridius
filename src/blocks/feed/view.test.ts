import { describe, expect, it } from "vitest";

import {
  feedHref,
  isLegacyPeriod,
  parseFeedView,
  roundsReportHref,
  submissionHref,
} from "./view";

const COUNTRY = "0d6fdf4e-1f16-4f3f-9f27-9b6f8b0a1c11";
const STORE = "3a2b7c1d-2e44-4b1a-8c5e-6f9d0a1b2c33";
const STATION = "9e8d7c6b-5a44-4321-9876-1a2b3c4d5e6f";

const SEPTEMBER = { from: "2026-09-01", to: "2026-09-30" } as const;
const RANGE = { kind: "range", range: SEPTEMBER } as const;

describe("parseFeedView", () => {
  it("пустой адрес — ни фильтров, ни периода: экран возьмёт своё умолчание, текущий месяц", () => {
    expect(parseFeedView({})).toStrictEqual({});
  });

  it("разбирает место и период «с — по» вместе: они работают вместе, а не по одному", () => {
    expect(
      parseFeedView({
        country: COUNTRY,
        store: STORE,
        station: STATION,
        from: "2026-09-01",
        to: "2026-09-30",
      }),
    ).toStrictEqual({
      countryId: COUNTRY,
      storeId: STORE,
      stationId: STATION,
      period: RANGE,
    });
  });

  it("значение не в формате uuid отбрасывается, а не уходит в запрос", () => {
    expect(
      parseFeedView({ country: "'; drop table submissions; --", store: STORE }),
    ).toStrictEqual({ storeId: STORE });
  });

  it("негодная дата — умолчание экрана, а не ошибка", () => {
    expect(
      parseFeedView({ from: "2026-09-31", to: "2026-10-05" }),
    ).toStrictEqual({});
  });

  it("старые адреса открываются тем же отрезком: «неделя» ленты и «30 дней» статистики", () => {
    expect(parseFeedView({ period: "week" })).toStrictEqual({
      period: { kind: "lastDays", days: 7 },
    });
    expect(parseFeedView({ period: "today" })).toStrictEqual({
      period: { kind: "lastDays", days: 1 },
    });
    expect(parseFeedView({ days: "30" })).toStrictEqual({
      period: { kind: "lastDays", days: 30 },
    });
    expect(parseFeedView({ days: "365" })).toStrictEqual({});
  });

  it("пара дат главнее старого параметра", () => {
    expect(
      parseFeedView({ from: "2026-09-01", to: "2026-09-30", days: "7" }),
    ).toStrictEqual({ period: RANGE });
  });

  it("повторённый параметр берётся первым значением, а не склеивается", () => {
    expect(parseFeedView({ store: [STORE, STATION] })).toStrictEqual({
      storeId: STORE,
    });
  });
});

describe("isLegacyPeriod", () => {
  it("узнаёт старый адрес, который надо перевести в «с — по»", () => {
    expect(isLegacyPeriod({ days: "7" })).toBe(true);
    expect(isLegacyPeriod({ period: "month" })).toBe(true);
    expect(isLegacyPeriod({ from: "2026-09-01", to: "2026-09-30" })).toBe(
      false,
    );
    expect(isLegacyPeriod({})).toBe(false);
  });
});

describe("feedHref", () => {
  it("адрес без фильтров — сам раздел", () => {
    expect(feedHref({})).toBe("/admin/feed");
  });

  it("период пишется парой дат", () => {
    expect(feedHref({ countryId: COUNTRY, period: RANGE })).toBe(
      `/admin/feed?country=${COUNTRY}&from=2026-09-01&to=2026-09-30`,
    );
  });

  it("с пиццерией ведёт на её экран: лента живёт там, страна задана самой пиццерией (D179)", () => {
    expect(
      feedHref({
        countryId: COUNTRY,
        storeId: STORE,
        stationId: STATION,
        period: RANGE,
      }),
    ).toBe(
      `/admin/feed/stores/${STORE}?station=${STATION}&from=2026-09-01&to=2026-09-30`,
    );
  });

  it("станция без пиццерии остаётся параметром раздела: он доведёт её до пиццерии", () => {
    expect(feedHref({ stationId: STATION })).toBe(
      `/admin/feed?station=${STATION}`,
    );
  });
});

describe("submissionHref", () => {
  it("карточка помнит фильтры и период: возврат ведёт туда же, откуда пришли", () => {
    expect(
      submissionHref("11111111-2222-4333-8444-555555555555", {
        countryId: COUNTRY,
        storeId: null,
        stationId: null,
        period: SEPTEMBER,
      }),
    ).toBe(
      `/admin/feed/11111111-2222-4333-8444-555555555555?country=${COUNTRY}&from=2026-09-01&to=2026-09-30`,
    );
  });
});

describe("roundsReportHref", () => {
  it("отчёт получает место и период, а не адрес экрана пиццерии", () => {
    expect(
      roundsReportHref({ storeId: STORE, stationId: STATION, period: RANGE }),
    ).toBe(
      `/admin/feed/report?store=${STORE}&station=${STATION}&from=2026-09-01&to=2026-09-30`,
    );
  });
});
