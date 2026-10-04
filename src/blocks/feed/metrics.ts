// Три показателя ленты (T045). Считаются по МАССИВУ СТРОК, который экран и показывает,
// а не отдельным запросом: два запроса с разной логикой фильтрации разъезжаются на
// первой же правке, и управляющий видит «14 заполнений» над лентой из тринадцати.
import type { FeedMetrics, FeedRow } from "./model";

export function computeMetrics(rows: readonly FeedRow[]): FeedMetrics {
  let failedCriticalCount = 0;
  let totalDurationMs = 0;

  for (const row of rows) {
    totalDurationMs += row.durationMs;
    // Заполнение, а не пункт: мера «заполнений с проваленным критичным пунктом» одна на
    // ленту, сводку и плитки (D183 п.5, D170).
    if (row.outcome.kind === "criticalFailed") failedCriticalCount += 1;
  }

  return {
    submissionCount: rows.length,
    failedCriticalCount,
    averageDurationMs:
      rows.length === 0 ? null : Math.round(totalDurationMs / rows.length),
  };
}
