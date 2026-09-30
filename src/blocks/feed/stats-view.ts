// Адрес экрана статистики: страна, пиццерия и период в 7 или 30 дней (D170).
//
// Разбор свой, а не `parseFeedView`: у ленты три периода эталона и фильтр станции, а у
// статистики ни того ни другого. Общие здесь только имена параметров страны и
// пиццерии — ими ссылка с ленты доезжает до статистики с тем же выбором.
//
// Модуль чистый — без базы: его читает и клиентский список периода.
import { STATS_PATH } from "./routes";
import { COUNTRY_PARAM, STORE_PARAM, type SearchParams } from "./view";

/** Два периода статистики (D170). */
export const STATS_PERIOD_DAYS = [7, 30] as const;
export type StatsPeriodDays = (typeof STATS_PERIOD_DAYS)[number];

export const DAYS_PARAM = "days";
const DEFAULT_STATS_DAYS: StatsPeriodDays = 7;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface StatsView {
  readonly countryId?: string;
  readonly storeId?: string;
  readonly days: StatsPeriodDays;
}

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function uuidOrNothing(
  value: string | string[] | undefined,
): string | undefined {
  const raw = single(value);
  return raw !== undefined && UUID_PATTERN.test(raw) ? raw : undefined;
}

function daysOf(value: string | string[] | undefined): StatsPeriodDays {
  const raw = single(value);
  return (
    STATS_PERIOD_DAYS.find((days) => String(days) === raw) ?? DEFAULT_STATS_DAYS
  );
}

/** Разбирает адрес статистики. Непонятное отбрасывается молча: это мусор, а не ошибка. */
export function parseStatsView(params: SearchParams): StatsView {
  const countryId = uuidOrNothing(params[COUNTRY_PARAM]);
  const storeId = uuidOrNothing(params[STORE_PARAM]);
  return {
    days: daysOf(params[DAYS_PARAM]),
    ...(countryId === undefined ? {} : { countryId }),
    ...(storeId === undefined ? {} : { storeId }),
  };
}

/** Адрес статистики с заданным выбором. Умолчание в адрес не попадает. */
export function statsHref(view: {
  readonly countryId?: string | null;
  readonly storeId?: string | null;
  readonly days?: StatsPeriodDays;
}): string {
  const query = new URLSearchParams();
  if (view.countryId) query.set(COUNTRY_PARAM, view.countryId);
  if (view.storeId) query.set(STORE_PARAM, view.storeId);
  if (view.days !== undefined && view.days !== DEFAULT_STATS_DAYS) {
    query.set(DAYS_PARAM, String(view.days));
  }
  const search = query.toString();
  return search === "" ? STATS_PATH : `${STATS_PATH}?${search}`;
}
