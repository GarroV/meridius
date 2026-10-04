import { describe, expect, it } from "vitest";

import { computeMetrics } from "./metrics";
import type { FeedRow } from "./model";

function row(durationMs: number, criticalFailed = 0): FeedRow {
  return {
    id: `row-${String(durationMs)}-${String(criticalFailed)}`,
    submittedAt: new Date("2026-09-05T09:12:00Z"),
    startedAt: new Date("2026-09-05T09:08:36Z"),
    durationMs,
    countryName: "Казахстан",
    storeName: "Алматы, Абая 44",
    stationName: "Кухня",
    checklistTitle: "Открытие кухни",
    versionNumber: 2,
    timeZone: "Asia/Almaty",
    whenKind: "today",
    mode: "normal",
    outcome:
      criticalFailed > 0
        ? { kind: "criticalFailed", count: criticalFailed }
        : { kind: "ok" },
  };
}

describe("computeMetrics", () => {
  it("считает заполнения, из них с проваленным критичным пунктом, и среднее время по одному и тому же списку", () => {
    const metrics = computeMetrics([
      row(204_000, 1),
      row(72_000),
      row(125_000, 2),
    ]);

    expect(metrics.submissionCount).toBe(3);
    // Мера одна на всех экранах (D183 п.5, D170): заполнения, а не пункты — заполнение
    // с двумя проваленными критичными считается один раз, как у сводки и плиток.
    expect(metrics.failedCriticalCount).toBe(2);
    expect(metrics.averageDurationMs).toBe(133_667);
  });

  it("пустая лента — нули и отсутствующее среднее, а не деление на ноль", () => {
    const metrics = computeMetrics([]);

    expect(metrics).toStrictEqual({
      submissionCount: 0,
      failedCriticalCount: 0,
      averageDurationMs: null,
    });
  });

  it("заполнения без провалов дают ноль по второму показателю", () => {
    expect(computeMetrics([row(60_000), row(60_000)])).toStrictEqual({
      submissionCount: 2,
      failedCriticalCount: 0,
      averageDurationMs: 60_000,
    });
  });
});
