// Состояние ленты живёт в адресе: ссылкой на «Кухню Алматы за неделю» можно поделиться
// в чате, и она откроется тем же экраном. Всё, что приходит из адреса, разбирается
// строго — это ввод от кого угодно, а не от нашей же формы.
import { DEFAULT_PERIOD, isFeedPeriod, type FeedPeriod } from "./period";
import {
  FEED_PATH,
  ROUNDS_REPORT_PATH,
  storeStatsPath,
  submissionPath,
} from "./routes";

export const COUNTRY_PARAM = "country";
export const STORE_PARAM = "store";
export const STATION_PARAM = "station";
export const PERIOD_PARAM = "period";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Значения параметров адреса. Next отдаёт их именно так: строка, список или ничего. */
export type SearchParams = Record<string, string | string[] | undefined>;

export interface FeedView {
  countryId?: string;
  storeId?: string;
  stationId?: string;
  period: FeedPeriod;
}

function single(value: string | string[] | undefined): string | undefined {
  if (value === undefined) return undefined;
  // Повторённый параметр (`?store=a&store=b`) — попытка подсунуть неожиданное:
  // берём первое значение, а не склеиваем.
  return Array.isArray(value) ? value[0] : value;
}

function uuidOrNothing(
  value: string | string[] | undefined,
): string | undefined {
  const raw = single(value);
  return raw !== undefined && UUID_PATTERN.test(raw) ? raw : undefined;
}

/** Разбирает адрес ленты. Непонятное отбрасывается молча: это не ошибка, а мусор. */
export function parseFeedView(params: SearchParams): FeedView {
  const period = single(params[PERIOD_PARAM]);
  const view: FeedView = {
    period: isFeedPeriod(period) ? period : DEFAULT_PERIOD,
  };

  const countryId = uuidOrNothing(params[COUNTRY_PARAM]);
  if (countryId !== undefined) view.countryId = countryId;

  const storeId = uuidOrNothing(params[STORE_PARAM]);
  if (storeId !== undefined) view.storeId = storeId;

  const stationId = uuidOrNothing(params[STATION_PARAM]);
  if (stationId !== undefined) view.stationId = stationId;

  return view;
}

/** Параметры адреса ленты. Умолчание и пустые значения в адрес не попадают. */
function feedQuery(
  view: FeedView,
  keys: readonly string[] = [
    COUNTRY_PARAM,
    STORE_PARAM,
    STATION_PARAM,
    PERIOD_PARAM,
  ],
): string {
  const query = new URLSearchParams();
  const entries: [string, string | undefined][] = [
    [COUNTRY_PARAM, view.countryId],
    [STORE_PARAM, view.storeId],
    [STATION_PARAM, view.stationId],
    [PERIOD_PARAM, view.period === DEFAULT_PERIOD ? undefined : view.period],
  ];

  for (const [key, value] of entries) {
    if (keys.includes(key) && value !== undefined && value !== "") {
      query.set(key, value);
    }
  }
  return query.toString();
}

function withQuery(path: string, query: string): string {
  return query === "" ? path : `${path}?${query}`;
}

/**
 * Адрес ленты с заданным состоянием. Лента живёт на экране пиццерии (D179): с выбранной
 * пиццерией адрес ведёт туда, станция и период — параметрами. Без пиццерии — в раздел
 * «Статистика»; станцию без пиццерии раздел сам доведёт до её пиццерии.
 */
export function feedHref(view: FeedView): string {
  if (view.storeId !== undefined && view.storeId !== "") {
    return withQuery(
      storeStatsPath(view.storeId),
      feedQuery(view, [STATION_PARAM, PERIOD_PARAM]),
    );
  }
  return withQuery(FEED_PATH, feedQuery(view));
}

/** Адрес отчёта об обходах с тем же состоянием фильтров, что у ленты. */
export function roundsReportHref(view: FeedView): string {
  return withQuery(ROUNDS_REPORT_PATH, feedQuery(view));
}

/** Состояние фильтров в том виде, в каком его отдаёт модель экрана (незаданное — `null`). */
export interface FeedFilterState {
  readonly countryId: string | null;
  readonly storeId: string | null;
  readonly stationId: string | null;
  readonly period: FeedPeriod;
}

/** Обратный перевод: из состояния экрана — в разбор адреса. */
export function toFeedView(state: FeedFilterState): FeedView {
  const view: FeedView = { period: state.period };
  if (state.countryId !== null) view.countryId = state.countryId;
  if (state.storeId !== null) view.storeId = state.storeId;
  if (state.stationId !== null) view.stationId = state.stationId;
  return view;
}

/**
 * Адрес карточки с сохранёнными фильтрами ленты: из карточки возвращаются в ту же
 * ленту, из которой пришли, а не в ленту «за сегодня по всей сети».
 */
export function submissionHref(id: string, state: FeedFilterState): string {
  return withQuery(submissionPath(id), feedQuery(toFeedView(state)));
}
