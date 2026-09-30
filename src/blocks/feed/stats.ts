// Статистика по стране и по пиццерии (D150). Состав решён в D170: за 7 или 30 дней —
// число заполнений, доля заполнений с проваленным критичным пунктом, пять чаще всего
// проваливаемых пунктов, поставленные будильники и станции, молчащие дольше суток.
//
// Всё считается запросом в момент просмотра из того, что уже пишется (заполнения,
// отметки обходов, будильники), — своей таблицы у статистики нет, и поменять набор можно
// без миграции. Числа — ядро (constitution, «Ядро и обвязка»): неверная доля выглядит
// ровно как верная, поэтому каждое сверено с базой в `stats.test.ts`.
//
// Правила счёта, принятые здесь:
//  - Период — скользящие 7 × 24 или 30 × 24 часа до момента просмотра, а не местные
//    сутки: у страны пиццерии в разных поясах, и «последние 7 дней» по одному поясу
//    отрезали бы у соседнего пояса часы наугад.
//  - Повтор заполнения (`duplicate`) — вторая запись того же заполнения, не второе
//    заполнение: в счёт не идёт.
//  - Провал считается по снимку заполнения (D002), по тому же правилу, что лента
//    (`stats-grading.ts` — его перевод на SQL со сверкой).
//  - «Чаще всего проваливаемые» — сколько раз пункт провален: в заполнениях и в
//    отметках обходов. Пункт опознаётся идентификатором: копии шаблона в пиццериях
//    хранят его неизменным, поэтому «Газ» из шаблона — одна строка на всю страну.
//  - Молчит станция, от которой ждут сигнала (к ней привязан живой чек-лист с
//    опубликованной версией), но ни заполнения, ни отметки обхода не было дольше суток.
//    Отсчёт — от последнего сигнала или от выхода первой версии, что позже: чек-лист,
//    вышедший два часа назад, молчанием станции не делает.
import { and, sql, type SQL } from "drizzle-orm";

import { getDb } from "@/blocks/data";
import type { LocalizedText } from "@/blocks/data";

import { scopeConditions, type FeedScope } from "./scope";
import { itemCriticalSql, itemFailedSql } from "./stats-grading";

export const STATS_PERIOD_DAYS = [7, 30] as const;
export type StatsPeriodDays = (typeof STATS_PERIOD_DAYS)[number];

/** Сколько пунктов в списке чаще всего проваливаемых (D170). */
export const TOP_FAILED_LIMIT = 5;
/** Сколько молчащих станций перечисляется поимённо; общее число отдаётся всегда. */
export const SILENT_LIST_LIMIT = 20;
/** Порог молчания (D170). */
export const SILENCE_HOURS = 24;

const HOUR_MS = 3_600_000;

export interface FailedItemStat {
  readonly itemId: string;
  /** Название из самого свежего провала: методист мог его поправить. */
  readonly title: LocalizedText;
  /** Сколько раз провален: заполнения и отметки обходов вместе. */
  readonly failures: number;
  /** В скольких пиццериях провален хотя бы раз. */
  readonly storeCount: number;
}

export interface SilentStation {
  readonly stationId: string;
  readonly stationName: string;
  readonly storeId: string;
  readonly storeName: string;
  /** С какого момента молчит. */
  readonly silentSince: Date;
  /** Последнее заполнение или отметка обхода; `null` — сигнала не было ни разу. */
  readonly lastSignalAt: Date | null;
}

export interface Stats {
  readonly from: Date;
  readonly to: Date;
  readonly submissionCount: number;
  /** Заполнений, где провален хотя бы один критичный пункт. */
  readonly criticalFailedCount: number;
  /** Их доля от всех заполнений; `null`, когда заполнений нет, — это не «0 %». */
  readonly criticalFailedShare: number | null;
  readonly topFailedItems: readonly FailedItemStat[];
  readonly alarmCount: number;
  readonly silentStationCount: number;
  /** Самые давно молчащие первыми, не больше `SILENT_LIST_LIMIT`. */
  readonly silentStations: readonly SilentStation[];
}

interface Window {
  readonly from: SQL;
  readonly to: SQL;
}

function timestamp(at: Date): SQL {
  return sql`${at.toISOString()}::timestamptz`;
}

/** Время из базы числом миллисекунд: разбор строк времени драйвером здесь не нужен. */
function epochMs(column: SQL): SQL {
  return sql`(extract(epoch from ${column}) * 1000)::float8`;
}

function scopeWhere(scope: FeedScope): SQL {
  return and(...scopeConditions(scope)) ?? sql`true`;
}

/** Станция → пиццерия: к ним цепляются условия области видимости. */
const PLACE_JOIN = sql`join stations on stations.id = src.station_id
  join stores on stores.id = stations.store_id`;

/** Последний ответ на пункт в заполнении — как `answersByItem` в `data/grading.ts`. */
const LAST_ANSWER = sql`cross join lateral (
    select a.answer -> 'value' as value
    from jsonb_array_elements(src.answers) with ordinality as a(answer, n)
    where a.answer ->> 'itemId' = it.item ->> 'id'
    order by a.n desc
    limit 1
  ) as ans`;

/** Пункты снимка заполнения. */
const SNAPSHOT_ITEMS = sql`cross join lateral jsonb_array_elements(src.snapshot) as sec(section)
  cross join lateral jsonb_array_elements(sec.section -> 'items') as it(item)`;

function submissionsInWindow(scope: FeedScope, window: Window): SQL {
  return sql`${scopeWhere(scope)}
    and not src.duplicate
    and src.submitted_at >= ${window.from}
    and src.submitted_at <= ${window.to}`;
}

interface SummaryRow extends Record<string, unknown> {
  readonly total: number;
  readonly critical_failed: number;
}

async function loadSummary(
  scope: FeedScope,
  window: Window,
): Promise<SummaryRow> {
  const failedCritical = sql`exists (
    select 1 from (select 1) as one
    ${SNAPSHOT_ITEMS}
    ${LAST_ANSWER}
    where ${itemCriticalSql(sql`it.item`)}
      and ${itemFailedSql(sql`it.item`, sql`ans.value`)}
  )`;

  const result = await getDb().execute<SummaryRow>(sql`
    select count(*)::int as total,
      count(*) filter (where ${failedCritical})::int as critical_failed
    from submissions as src
    ${PLACE_JOIN}
    where ${submissionsInWindow(scope, window)}`);

  return result.rows[0] ?? { total: 0, critical_failed: 0 };
}

interface FailedItemRow extends Record<string, unknown> {
  readonly item_id: string;
  readonly title: LocalizedText | null;
  readonly failures: number;
  readonly store_count: number;
}

async function loadTopFailed(
  scope: FeedScope,
  window: Window,
): Promise<FailedItemStat[]> {
  const fromSubmissions = sql`
    select it.item ->> 'id' as item_id, it.item -> 'title' as title,
      src.submitted_at as at, stores.id as store_id
    from submissions as src
    ${PLACE_JOIN}
    ${SNAPSHOT_ITEMS}
    ${LAST_ANSWER}
    where ${submissionsInWindow(scope, window)}
      and ${itemFailedSql(sql`it.item`, sql`ans.value`)}`;

  // Отметка обхода хранит только идентификатор пункта: сам пункт — в её версии.
  const fromChecks = sql`
    select src.item_id, it.item -> 'title' as title, src.at, stores.id as store_id
    from checks as src
    ${PLACE_JOIN}
    join checklist_versions as v on v.id = src.version_id
    cross join lateral (
      select found.item
      from jsonb_array_elements(v.sections) as sec(section)
      cross join lateral jsonb_array_elements(sec.section -> 'items') as found(item)
      where found.item ->> 'id' = src.item_id
      limit 1
    ) as it
    where ${scopeWhere(scope)}
      and src.at >= ${window.from}
      and src.at <= ${window.to}
      and ${itemFailedSql(sql`it.item`, sql`src.value`)}`;

  const result = await getDb().execute<FailedItemRow>(sql`
    with failures as (${fromSubmissions} union all ${fromChecks})
    select item_id,
      (array_agg(title order by at desc))[1] as title,
      count(*)::int as failures,
      count(distinct store_id)::int as store_count
    from failures
    group by item_id
    order by failures desc, item_id
    limit ${TOP_FAILED_LIMIT}`);

  return result.rows.map((row) => ({
    itemId: row.item_id,
    title: row.title ?? {},
    failures: row.failures,
    storeCount: row.store_count,
  }));
}

async function loadAlarmCount(
  scope: FeedScope,
  window: Window,
): Promise<number> {
  // Будильник, снятый сотрудником, из таблицы удаляется (D070) — в счёт идут те,
  // что стоят или отзвонили и не сняты. Это и есть «поставленные» с оговоркой на экране.
  const result = await getDb().execute<{ total: number }>(sql`
    select count(*)::int as total
    from alarms as src
    ${PLACE_JOIN}
    where ${scopeWhere(scope)}
      and src.created_at >= ${window.from}
      and src.created_at <= ${window.to}`);
  return result.rows[0]?.total ?? 0;
}

interface SilentRow extends Record<string, unknown> {
  readonly station_id: string;
  readonly station_name: string;
  readonly store_id: string;
  readonly store_name: string;
  readonly silent_since_ms: number;
  readonly last_signal_ms: number | null;
  readonly total: number;
}

async function loadSilent(
  scope: FeedScope,
  now: SQL,
): Promise<{ count: number; stations: SilentStation[] }> {
  const result = await getDb().execute<SilentRow>(sql`
    with expected as (
      select stations.id as station_id, stations.name as station_name,
        stores.id as store_id, stores.name as store_name,
        pub.first_published,
        greatest(
          (select max(s.submitted_at) from submissions as s
            where s.station_id = stations.id and s.submitted_at <= ${now}),
          (select max(c.at) from checks as c
            where c.station_id = stations.id and c.at <= ${now})
        ) as last_signal
      from stations
      join stores on stores.id = stations.store_id
      cross join lateral (
        select min(v.published_at) as first_published
        from checklists as c
        join checklist_versions as v on v.checklist_id = c.id
        where c.station_id = stations.id
          and c.archived_at is null
          and not c.is_template
          and v.published_at is not null
          and exists (
            select 1 from checklist_versions as live
            where live.checklist_id = c.id and live.status = 'published'
          )
      ) as pub
      where ${scopeWhere(scope)} and pub.first_published is not null
    ), silent as (
      select *, greatest(last_signal, first_published) as silent_since
      from expected
    )
    select station_id, station_name, store_id, store_name,
      ${epochMs(sql`silent_since`)} as silent_since_ms,
      ${epochMs(sql`last_signal`)} as last_signal_ms,
      (count(*) over ())::int as total
    from silent
    where silent_since < ${now} - make_interval(hours => ${SILENCE_HOURS})
    order by silent_since, station_id
    limit ${SILENT_LIST_LIMIT}`);

  return {
    count: result.rows[0]?.total ?? 0,
    stations: result.rows.map((row) => ({
      stationId: row.station_id,
      stationName: row.station_name,
      storeId: row.store_id,
      storeName: row.store_name,
      silentSince: new Date(row.silent_since_ms),
      lastSignalAt:
        row.last_signal_ms === null ? null : new Date(row.last_signal_ms),
    })),
  };
}

/** Доля; `null`, когда делить не на что. */
export function shareOf(part: number, whole: number): number | null {
  return whole === 0 ? null : part / whole;
}

/**
 * Статистика области `scope` за `days` суток до `now`. `now` приходит параметром:
 * границы периода и порог молчания иначе не проверить, не подменяя часы.
 */
export async function loadStats(
  scope: FeedScope,
  days: StatsPeriodDays,
  now: Date,
): Promise<Stats> {
  const from = new Date(now.getTime() - days * 24 * HOUR_MS);
  const window: Window = { from: timestamp(from), to: timestamp(now) };

  const [summary, topFailedItems, alarmCount, silent] = await Promise.all([
    loadSummary(scope, window),
    loadTopFailed(scope, window),
    loadAlarmCount(scope, window),
    loadSilent(scope, window.to),
  ]);

  return {
    from,
    to: now,
    submissionCount: summary.total,
    criticalFailedCount: summary.critical_failed,
    criticalFailedShare: shareOf(summary.critical_failed, summary.total),
    topFailedItems,
    alarmCount,
    silentStationCount: silent.count,
    silentStations: silent.stations,
  };
}
