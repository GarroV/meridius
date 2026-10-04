// Состояние ленты живёт в адресе: ссылкой на «Кухню Алматы за неделю» можно поделиться
// в чате, и она откроется тем же экраном. Всё, что приходит из адреса, разбирается
// строго — это ввод от кого угодно, а не от нашей же формы.
import { parseDayRange, type DayRange, type PeriodAsk } from "./period";
import {
  FEED_PATH,
  ROUNDS_REPORT_PATH,
  storeStatsPath,
  submissionPath,
} from "./routes";

export const COUNTRY_PARAM = "country";
export const STORE_PARAM = "store";
export const STATION_PARAM = "station";
export const FROM_PARAM = "from";
export const TO_PARAM = "to";
/** Старые параметры периода: `period=today|week|month` ленты и `days=7|30` статистики. */
const LEGACY_PERIOD_PARAM = "period";
const LEGACY_DAYS_PARAM = "days";

/** Сколько дней значили старые периоды — ими открываются старые ссылки. */
const LEGACY_PERIOD_DAYS: Readonly<Record<string, number>> = {
  today: 1,
  week: 7,
  month: 30,
};
const LEGACY_STATS_DAYS: readonly number[] = [7, 30];

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Значения параметров адреса. Next отдаёт их именно так: строка, список или ничего. */
export type SearchParams = Record<string, string | string[] | undefined>;

export interface FeedView {
  countryId?: string;
  storeId?: string;
  stationId?: string;
  period?: PeriodAsk;
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

/** Период из адреса: пара дат, иначе старый параметр, иначе — ничего (умолчание экрана). */
function parsePeriodAsk(params: SearchParams): PeriodAsk | undefined {
  const range = parseDayRange(
    single(params[FROM_PARAM]),
    single(params[TO_PARAM]),
  );
  if (range !== null) return { kind: "range", range };

  const legacy = LEGACY_PERIOD_DAYS[single(params[LEGACY_PERIOD_PARAM]) ?? ""];
  if (legacy !== undefined) return { kind: "lastDays", days: legacy };

  const days = Number(single(params[LEGACY_DAYS_PARAM]));
  return LEGACY_STATS_DAYS.includes(days)
    ? { kind: "lastDays", days }
    : undefined;
}

/**
 * Адрес со старым периодом: экран открывается, но переадресует на тот же отрезок в виде
 * «с — по», чтобы в адресной строке и в ссылках дальше жил один формат.
 */
export function isLegacyPeriod(params: SearchParams): boolean {
  return parsePeriodAsk(params)?.kind === "lastDays";
}

/** Разбирает адрес ленты. Непонятное отбрасывается молча: это не ошибка, а мусор. */
export function parseFeedView(params: SearchParams): FeedView {
  const view: FeedView = {};
  const period = parsePeriodAsk(params);
  if (period !== undefined) view.period = period;

  const countryId = uuidOrNothing(params[COUNTRY_PARAM]);
  if (countryId !== undefined) view.countryId = countryId;

  const storeId = uuidOrNothing(params[STORE_PARAM]);
  if (storeId !== undefined) view.storeId = storeId;

  const stationId = uuidOrNothing(params[STATION_PARAM]);
  if (stationId !== undefined) view.stationId = stationId;

  return view;
}

/** Параметры периода в адресе: пара дат, а старый период — как пришёл (см. `PeriodAsk`). */
function periodEntries(period: PeriodAsk | undefined): [string, string][] {
  if (period === undefined) return [];
  if (period.kind === "range") {
    return [
      [FROM_PARAM, period.range.from],
      [TO_PARAM, period.range.to],
    ];
  }
  return [[LEGACY_DAYS_PARAM, String(period.days)]];
}

/** Ключ группы «период» в списке параметров, которые адрес обязан нести. */
const PERIOD_KEY = "period";

/** Параметры адреса ленты. Пустые значения в адрес не попадают. */
function feedQuery(
  view: FeedView,
  keys: readonly string[] = [
    COUNTRY_PARAM,
    STORE_PARAM,
    STATION_PARAM,
    PERIOD_KEY,
  ],
): string {
  const query = new URLSearchParams();
  const entries: [string, string | undefined][] = [
    [COUNTRY_PARAM, view.countryId],
    [STORE_PARAM, view.storeId],
    [STATION_PARAM, view.stationId],
  ];

  for (const [key, value] of entries) {
    if (keys.includes(key) && value !== undefined && value !== "") {
      query.set(key, value);
    }
  }
  if (keys.includes(PERIOD_KEY)) {
    for (const [key, value] of periodEntries(view.period))
      query.set(key, value);
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
      feedQuery(view, [STATION_PARAM, PERIOD_KEY]),
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
  /** Период экрана — уже датами: умолчание и старые адреса к этому моменту разобраны. */
  readonly period: DayRange;
}

/** Обратный перевод: из состояния экрана — в разбор адреса. */
export function toFeedView(state: FeedFilterState): FeedView {
  const view: FeedView = { period: { kind: "range", range: state.period } };
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
