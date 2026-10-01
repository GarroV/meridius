// Общие куски SQL статистики (D170): период, область видимости, пункты снимка и правило
// «провален критичный пункт». Лежат отдельно, потому что ими считают и сводка по
// области (`stats.ts`), и разбивка по пиццериям и чек-листам (`stats-breakdown.ts`) —
// две копии правила провала разъехались бы молча, а обе продолжали бы что-то показывать.
//
// В запросах заполнение называется `src`: к нему цепляются станция и пиццерия.
import { and, sql, type SQL } from "drizzle-orm";

import { scopeConditions, type FeedScope } from "./scope";
import { itemCriticalSql, itemFailedSql } from "./stats-grading";
import type { StatsPeriodDays } from "./stats-view";

const HOUR_MS = 3_600_000;

/** Границы периода выражениями SQL. */
export interface Window {
  readonly from: SQL;
  readonly to: SQL;
}

function timestamp(at: Date): SQL {
  return sql`${at.toISOString()}::timestamptz`;
}

/**
 * Скользящий период: `days` × 24 часа до `now`, а не местные сутки — у страны пиццерии в
 * разных поясах, и «последние 7 дней» по одному поясу отрезали бы у соседнего часы наугад.
 */
export function periodWindow(
  days: StatsPeriodDays,
  now: Date,
): { readonly from: Date; readonly window: Window } {
  const from = new Date(now.getTime() - days * 24 * HOUR_MS);
  return { from, window: { from: timestamp(from), to: timestamp(now) } };
}

/** Время из базы числом миллисекунд: разбор строк времени драйвером здесь не нужен. */
export function epochMs(column: SQL): SQL {
  return sql`(extract(epoch from ${column}) * 1000)::float8`;
}

export function scopeWhere(scope: FeedScope): SQL {
  return and(...scopeConditions(scope)) ?? sql`true`;
}

/** Станция → пиццерия: к ним цепляются условия области видимости. */
export const PLACE_JOIN = sql`join stations on stations.id = src.station_id
  join stores on stores.id = stations.store_id`;

/** Последний ответ на пункт в заполнении — как `answersByItem` в `data/grading.ts`. */
export const LAST_ANSWER = sql`cross join lateral (
    select a.answer -> 'value' as value
    from jsonb_array_elements(src.answers) with ordinality as a(answer, n)
    where a.answer ->> 'itemId' = it.item ->> 'id'
    order by a.n desc
    limit 1
  ) as ans`;

/** Пункты снимка заполнения. */
export const SNAPSHOT_ITEMS = sql`cross join lateral jsonb_array_elements(src.snapshot) as sec(section)
  cross join lateral jsonb_array_elements(sec.section -> 'items') as it(item)`;

/** В заполнении `src` провален хотя бы один критичный пункт — по снимку (D002). */
export const FAILED_CRITICAL = sql`exists (
    select 1 from (select 1) as one
    ${SNAPSHOT_ITEMS}
    ${LAST_ANSWER}
    where ${itemCriticalSql(sql`it.item`)}
      and ${itemFailedSql(sql`it.item`, sql`ans.value`)}
  )`;

/**
 * Заполнения области за период. Повтор (`duplicate`) — вторая запись того же заполнения,
 * а не второе заполнение: в счёт не идёт.
 */
export function submissionsInWindow(scope: FeedScope, window: Window): SQL {
  return sql`${scopeWhere(scope)}
    and not src.duplicate
    and src.submitted_at >= ${window.from}
    and src.submitted_at <= ${window.to}`;
}
