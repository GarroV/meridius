// Адреса раздела «Статистика» (D179): страна и период в 7 или 30 дней (D170).
//
// Страна, пиццерия, станция и период ленты читаются разбором ленты (`parseFeedView`):
// имена параметров у них общие, поэтому старые ссылки ленты и бывшей статистики
// доезжают до нового раздела с тем же выбором. Своё здесь — только период статистики.
//
// Модуль чистый — без базы.
import { FEED_PATH } from "./routes";
import { DEFAULT_PERIOD } from "./period";
import {
  COUNTRY_PARAM,
  feedHref,
  parseFeedView,
  type FeedView,
  type SearchParams,
} from "./view";

/** Два периода статистики (D170). */
export const STATS_PERIOD_DAYS = [7, 30] as const;
export type StatsPeriodDays = (typeof STATS_PERIOD_DAYS)[number];

/** Что считает сводка: область и период. */
export interface StatsView {
  readonly countryId?: string;
  readonly storeId?: string;
  readonly days: StatsPeriodDays;
}

export const DAYS_PARAM = "days";
const DEFAULT_STATS_DAYS: StatsPeriodDays = 7;

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Период статистики из адреса. Непонятное — умолчание: это мусор, а не ошибка. */
export function parseStatsDays(params: SearchParams): StatsPeriodDays {
  const raw = single(params[DAYS_PARAM]);
  return (
    STATS_PERIOD_DAYS.find((days) => String(days) === raw) ?? DEFAULT_STATS_DAYS
  );
}

function withDays(href: string, days: StatsPeriodDays | undefined): string {
  if (days === undefined || days === DEFAULT_STATS_DAYS) return href;
  return `${href}${href.includes("?") ? "&" : "?"}${DAYS_PARAM}=${String(days)}`;
}

/** Экран страны: список стран слева, плитки её пиццерий справа. */
export function countryStatsHref(view: {
  readonly countryId?: string | null | undefined;
  readonly days?: StatsPeriodDays | undefined;
}): string {
  const href =
    view.countryId === undefined || view.countryId === null
      ? FEED_PATH
      : `${FEED_PATH}?${COUNTRY_PARAM}=${encodeURIComponent(view.countryId)}`;
  return withDays(href, view.days);
}

/** Экран пиццерии: период статистики, а для ленты — станция и её период. */
export function storeStatsHref(
  storeId: string,
  view: {
    readonly days?: StatsPeriodDays | undefined;
    readonly stationId?: string | null | undefined;
    readonly period?: FeedView["period"] | undefined;
  } = {},
): string {
  const feed: FeedView = {
    storeId,
    period: view.period ?? DEFAULT_PERIOD,
    ...(view.stationId === undefined || view.stationId === null
      ? {}
      : { stationId: view.stationId }),
  };
  return withDays(feedHref(feed), view.days);
}

/**
 * Куда ведёт бывший адрес статистики `/admin/feed/stats` (D179): с пиццерией — на её
 * экран, иначе — в раздел с той же страной. Период переезжает как есть.
 */
export function legacyStatsTarget(params: SearchParams): string {
  const view = parseFeedView(params);
  const days = parseStatsDays(params);
  return view.storeId === undefined
    ? countryStatsHref({ countryId: view.countryId, days })
    : storeStatsHref(view.storeId, { days });
}
