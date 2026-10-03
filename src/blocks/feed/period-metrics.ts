// Три показателя за период — агрегатом базы, для главной кабинета (D174).
//
// Лента считает показатели по своим строкам (T045), но её выдача обрезана на 200: у
// пиццерии, где за неделю заполнили больше, счёт по строкам молча занижал бы главную.
// Здесь те же три числа считает база по всем заполнениям периода, и по правилу
// «Статистики»: период и область — `submissionsInWindow` (календарные сутки в поясе
// экрана, повтор не в счёт), провал критичного пункта — `itemCriticalSql` и
// `itemFailedSql`, сверенные с кодом в `stats-grading.test.ts`.
import { sql } from "drizzle-orm";

import { getDb } from "@/blocks/data";

import type { FeedMetrics } from "./model";
import type { FeedScope } from "./scope";
import {
  LAST_ANSWER,
  PLACE_JOIN,
  SNAPSHOT_ITEMS,
  epochMs,
  periodWindow,
  submissionsInWindow,
} from "./stats-sql";
import { itemCriticalSql, itemFailedSql } from "./stats-grading";

interface MetricsRow extends Record<string, unknown> {
  readonly total: number;
  readonly failed_critical: number;
  /** Средняя длительность в мс; `null`, когда заполнений нет. */
  readonly average_ms: number | null;
}

/** Проваленных критичных пунктов в заполнении `src` — как `countFailedCritical`. */
const FAILED_CRITICAL_ITEMS = sql`(
    select count(*) from (select 1) as one
    ${SNAPSHOT_ITEMS}
    ${LAST_ANSWER}
    where ${itemCriticalSql(sql`it.item`)}
      and ${itemFailedSql(sql`it.item`, sql`ans.value`)}
  )`;

/**
 * Длительность не меньше нуля, как у строки ленты: часы планшета не синхронизированы
 * с сервером, и отрицательное время заполнения уводило бы среднее вниз.
 */
const DURATION_MS = sql`greatest(0, ${epochMs(sql`src.submitted_at`)} - ${epochMs(sql`src.started_at`)})`;

/**
 * Показатели области `scope` за `days` местных суток в поясе `timeZone`, считая
 * сегодняшние; верхняя граница — момент просмотра `now`.
 */
export async function loadPeriodMetrics(
  scope: FeedScope,
  days: number,
  now: Date,
  timeZone: string,
): Promise<FeedMetrics> {
  const { window } = periodWindow(days, now, timeZone);
  const result = await getDb().execute<MetricsRow>(sql`
    select count(*)::int as total,
      coalesce(sum(${FAILED_CRITICAL_ITEMS}), 0)::int as failed_critical,
      avg(${DURATION_MS})::float8 as average_ms
    from submissions as src
    ${PLACE_JOIN}
    where ${submissionsInWindow(scope, window)}`);

  const row = result.rows[0];
  if (row === undefined || row.total === 0) {
    return {
      submissionCount: 0,
      failedCriticalCount: 0,
      averageDurationMs: null,
    };
  }
  return {
    submissionCount: row.total,
    failedCriticalCount: row.failed_critical,
    averageDurationMs:
      row.average_ms === null ? null : Math.round(row.average_ms),
  };
}
