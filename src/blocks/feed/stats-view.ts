// Адреса раздела «Статистика» (D179): страна, пиццерия и один период на экран (D183 п.4).
//
// Страна, пиццерия, станция и период читаются разбором ленты (`parseFeedView`): имена
// параметров у них общие, поэтому старые ссылки ленты и бывшей статистики доезжают до
// нового раздела с тем же выбором.
//
// Модуль чистый — без базы.
import type { DayRange, PeriodAsk } from "./period";
import {
  feedHref,
  parseFeedView,
  type FeedView,
  type SearchParams,
} from "./view";

/** Что считает сводка: область и период. */
export interface StatsView {
  readonly countryId?: string;
  readonly storeId?: string;
  readonly period?: PeriodAsk | undefined;
}

function asRange(period: DayRange | undefined): PeriodAsk | undefined {
  return period === undefined ? undefined : { kind: "range", range: period };
}

/** Экран страны: список стран слева, плитки её пиццерий справа. */
export function countryStatsHref(view: {
  readonly countryId?: string | null | undefined;
  readonly period?: DayRange | undefined;
}): string {
  const country =
    view.countryId === undefined || view.countryId === null
      ? {}
      : { countryId: view.countryId };
  const period = asRange(view.period);
  return feedHref({ ...country, ...(period === undefined ? {} : { period }) });
}

/** Экран пиццерии: период и станция ленты. */
export function storeStatsHref(
  storeId: string,
  view: {
    readonly period?: DayRange | undefined;
    readonly stationId?: string | null | undefined;
  } = {},
): string {
  const period = asRange(view.period);
  const feed: FeedView = {
    storeId,
    ...(period === undefined ? {} : { period }),
    ...(view.stationId === undefined || view.stationId === null
      ? {}
      : { stationId: view.stationId }),
  };
  return feedHref(feed);
}

/**
 * Куда ведёт бывший адрес статистики `/admin/feed/stats` (D179): с пиццерией — на её
 * экран, иначе — в раздел с той же страной. Период переезжает как есть: старый `days=`
 * экран сам переведёт в даты, когда узнает свой пояс.
 */
export function legacyStatsTarget(params: SearchParams): string {
  const view = parseFeedView(params);
  const place: FeedView =
    view.storeId === undefined
      ? view.countryId === undefined
        ? {}
        : { countryId: view.countryId }
      : { storeId: view.storeId };
  return feedHref({
    ...place,
    ...(view.period === undefined ? {} : { period: view.period }),
  });
}
