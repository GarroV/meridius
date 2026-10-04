// Период экранов «Статистики» (D183 п.4, правило interface-logic п.3): один на экран,
// календарь «с — по» и стрелки ← →. По умолчанию — текущий месяц.
//
// Период — пара МЕСТНЫХ дат, обе включительно, а не пара моментов: человек выбирает
// «с 1 по 30 сентября», и в какие моменты UTC это превращается, решает пояс экрана
// (D183 п.6 — как раньше: пиццерия выбрана — её пояс, иначе общий пояс фильтра или
// пояс площадки). Границы времени считаются здесь и только здесь.
//
// Модуль чистый — без базы.
import { zoneOffsetMs, zonedDayParts, zonedDayStart } from "./zone";

const DAY_MS = 86_400_000;

/** Местная дата «ГГГГ-ММ-ДД». */
export type LocalDate = string;

/** Период: местные даты, обе границы включительно. */
export interface DayRange {
  readonly from: LocalDate;
  readonly to: LocalDate;
}

/** Границы периода во времени. */
export interface DateRange {
  readonly from: Date;
  readonly to: Date;
}

/**
 * Самый длинный период, который экран согласен считать. Предел — не вкус, а защита:
 * даты приходят из адреса, и «с 1900 года» иначе стало бы запросом по всей истории.
 */
export const MAX_RANGE_DAYS = 366;

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function pad(value: number, width = 2): string {
  return String(value).padStart(width, "0");
}

function formatDate(year: number, month: number, day: number): LocalDate {
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

function partsOf(date: LocalDate): [number, number, number] {
  const match = DATE_PATTERN.exec(date);
  if (match === null) {
    throw new RangeError(`Местная дата не разобрана: «${date}»`);
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function utcMidnight(date: LocalDate): number {
  const [year, month, day] = partsOf(date);
  return Date.UTC(year, month - 1, day);
}

function fromUtcMidnight(ms: number): LocalDate {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Дата из адреса. Только настоящий календарный день: «2026-09-31» отвергается, а не
 * перетекает в 1 октября, как сделал бы `Date`.
 */
export function parseLocalDate(raw: unknown): LocalDate | null {
  if (typeof raw !== "string") return null;
  const match = DATE_PATTERN.exec(raw);
  if (match === null) return null;
  const [year, month, day] = [
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
  ];
  const probe = new Date(Date.UTC(year, month - 1, day));
  const isReal =
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day;
  return isReal ? raw : null;
}

/** Местная дата со сдвигом на целые сутки — по календарю, а не вычитанием часов. */
export function shiftLocalDate(date: LocalDate, deltaDays: number): LocalDate {
  return fromUtcMidnight(utcMidnight(date) + deltaDays * DAY_MS);
}

/** Сколько суток в периоде, обе границы включительно. */
export function rangeDayCount(range: DayRange): number {
  return (
    Math.round((utcMidnight(range.to) - utcMidnight(range.from)) / DAY_MS) + 1
  );
}

/**
 * Период из пары дат адреса. Перепутанные границы меняются местами; слишком длинный
 * период обрезается до `maxDays`, считая от верхней границы — её человек видит как
 * «по», и она остаётся той, что он выбрал. Без любой из границ периода нет: `null`.
 */
export function parseDayRange(
  rawFrom: unknown,
  rawTo: unknown,
  maxDays: number = MAX_RANGE_DAYS,
): DayRange | null {
  const first = parseLocalDate(rawFrom);
  const second = parseLocalDate(rawTo);
  if (first === null || second === null) return null;

  const [from, to] = first <= second ? [first, second] : [second, first];
  const range = { from, to };
  return rangeDayCount(range) > maxDays
    ? { from: shiftLocalDate(to, -(maxDays - 1)), to }
    : range;
}

/** Сегодняшняя местная дата в поясе экрана. */
export function localToday(now: Date, timeZone: string): LocalDate {
  const { year, month, day } = zonedDayParts(now, timeZone);
  return formatDate(year, month, day);
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Месяц, в который попадает дата, — с первого по последнее число. */
function monthOf(date: LocalDate): DayRange {
  const [year, month] = partsOf(date);
  return {
    from: formatDate(year, month, 1),
    to: formatDate(year, month, lastDayOfMonth(year, month)),
  };
}

/** Умолчание экрана: текущий месяц по поясу экрана, целиком. */
export function currentMonth(now: Date, timeZone: string): DayRange {
  return monthOf(localToday(now, timeZone));
}

/**
 * «Последние N дней» — сегодня и N−1 предыдущих суток. Нужен только для старых адресов
 * (`days=7|30`, `period=today|week|month`): они открываются тем же отрезком, что и
 * раньше, но уже как обычный период «с — по».
 */
export function lastDays(days: number, now: Date, timeZone: string): DayRange {
  const to = localToday(now, timeZone);
  return { from: shiftLocalDate(to, -(days - 1)), to };
}

/** Период — целые месяцы: с первого числа одного по последнее число другого. */
export function isWholeMonths(range: DayRange): boolean {
  return (
    monthOf(range.from).from === range.from && monthOf(range.to).to === range.to
  );
}

function monthIndex(date: LocalDate): number {
  const [year, month] = partsOf(date);
  return year * 12 + (month - 1);
}

function monthAt(index: number): DayRange {
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return monthOf(formatDate(year, month, 1));
}

/**
 * Стрелка ← или →. Целые месяцы листаются месяцами (сентябрь → октябрь, а не «на 30
 * дней» с хвостом в 1 ноября), любой другой отрезок — на свою длину, без зазора и
 * без нахлёста с исходным.
 */
export function shiftRange(range: DayRange, direction: 1 | -1): DayRange {
  if (isWholeMonths(range)) {
    const first = monthIndex(range.from);
    const span = monthIndex(range.to) - first + 1;
    const start = first + direction * span;
    return { from: monthAt(start).from, to: monthAt(start + span - 1).to };
  }
  const delta = direction * rangeDayCount(range);
  return {
    from: shiftLocalDate(range.from, delta),
    to: shiftLocalDate(range.to, delta),
  };
}

/**
 * Момент начала местных суток даты. От местного полудня, а не от полуночи UTC: у поясов
 * со смещением больше двенадцати часов полночь UTC приходится на другой местный день.
 */
function dayStart(date: LocalDate, timeZone: string): Date {
  const noonUtc = utcMidnight(date) + DAY_MS / 2;
  const localNoon = noonUtc - zoneOffsetMs(new Date(noonUtc), timeZone);
  return zonedDayStart(new Date(localNoon), timeZone);
}

/**
 * Границы периода во времени. Верхняя — последняя миллисекунда последних суток: слой
 * доступа сравнивает `to` включительно (`lte`), и обрезание до 23:59:59.000 потеряло
 * бы заполнение, пришедшее в последнюю секунду дня.
 */
export function rangeBounds(range: DayRange, timeZone: string): DateRange {
  const from = dayStart(range.from, timeZone);
  const next = dayStart(shiftLocalDate(range.to, 1), timeZone);
  return { from, to: new Date(next.getTime() - 1) };
}

/**
 * Окно счёта статистики: границы периода, но не дальше момента просмотра — заполнение
 * «из будущего» (сдвинутые часы) в счёт не идёт.
 */
export function rangeWindow(
  range: DayRange,
  now: Date,
  timeZone: string,
): DateRange {
  const bounds = rangeBounds(range, timeZone);
  return bounds.to > now ? { from: bounds.from, to: now } : bounds;
}

/**
 * Какой период просит адрес. Своих дат нет (`undefined`) — умолчание экрана, текущий
 * месяц. Пара дат — период «с — по». Старый адрес (`period=`, `days=`) — «последние N
 * дней»: его границы зависят от пояса экрана, поэтому в даты он превращается уже при
 * сборке экрана, когда пояс известен.
 */
export type PeriodAsk =
  | { readonly kind: "range"; readonly range: DayRange }
  | { readonly kind: "lastDays"; readonly days: number };

/** Период, который покажет экран: просьба адреса, разобранная в поясе экрана. */
export function resolvePeriodAsk(
  ask: PeriodAsk | undefined,
  now: Date,
  timeZone: string,
  maxDays: number = MAX_RANGE_DAYS,
): DayRange {
  if (ask === undefined) return currentMonth(now, timeZone);
  if (ask.kind === "lastDays") return lastDays(ask.days, now, timeZone);
  return rangeDayCount(ask.range) > maxDays
    ? { from: shiftLocalDate(ask.range.to, -(maxDays - 1)), to: ask.range.to }
    : ask.range;
}

/** Куда ведут стрелки ← →. `next` — `null`, когда следующий отрезок целиком в будущем. */
export interface PeriodNav {
  readonly period: DayRange;
  readonly previous: DayRange;
  readonly next: DayRange | null;
}

export function periodNav(
  period: DayRange,
  now: Date,
  timeZone: string,
): PeriodNav {
  const next = shiftRange(period, 1);
  return {
    period,
    previous: shiftRange(period, -1),
    next: next.from > localToday(now, timeZone) ? null : next,
  };
}

/** Как далеко заполнение от сегодняшнего дня: от этого зависит вид отметки времени. */
export type RelativeDay = "today" | "yesterday" | "older";

/**
 * Сравнение идёт по календарным суткам в поясе, а не по разнице в часах: заполнение
 * в 23:50 и просмотр в 00:10 — это разные дни, хотя между ними двадцать минут.
 *
 * Время из будущего (часы сервера или устройства сдвинуты) считается сегодняшним:
 * подписи «через день» на экране истории быть не может.
 */
export function relativeDay(
  at: Date,
  now: Date,
  timeZone: string,
): RelativeDay {
  const today = zonedDayStart(now, timeZone).getTime();
  const day = zonedDayStart(at, timeZone).getTime();

  if (day >= today) return "today";

  const yesterday = zonedDayStart(
    new Date(today - DAY_MS / 2),
    timeZone,
  ).getTime();
  return day >= yesterday ? "yesterday" : "older";
}
