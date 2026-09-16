// Периоды ленты: три варианта из эталона (`docs/furca/design/screens/feed.html`).
// Границы — календарные сутки в поясе экрана, а не «последние 24 часа»: управляющий
// спрашивает «что было сегодня», а не «что было с этого часа вчера».
import { zonedDayStart } from "./zone";

const DAY_MS = 86_400_000;

export const FEED_PERIODS = ["today", "week", "month"] as const;

export type FeedPeriod = (typeof FEED_PERIODS)[number];

export const DEFAULT_PERIOD: FeedPeriod = "today";

/** Сколько суток захватывает период, считая сегодняшние. */
const PERIOD_DAYS: Record<FeedPeriod, number> = {
  today: 1,
  week: 7,
  month: 30,
};

export interface DateRange {
  readonly from: Date;
  readonly to: Date;
}

export function isFeedPeriod(value: unknown): value is FeedPeriod {
  return (FEED_PERIODS as readonly unknown[]).includes(value);
}

/**
 * Границы периода. Верхняя — последняя миллисекунда суток: слой доступа сравнивает
 * `to` включительно (`lte`), и обрезание до 23:59:59.000 потеряло бы заполнение,
 * пришедшее в последнюю секунду дня.
 */
export function resolvePeriod(
  period: FeedPeriod,
  now: Date,
  timeZone: string,
): DateRange {
  const todayStart = zonedDayStart(now, timeZone);
  const daysBack = PERIOD_DAYS[period] - 1;

  // Отсчёт ведётся от местного полудня, а не от полуночи: сутки перевода часов длятся
  // 23 или 25 часов, и вычитание ровных 24 часов из полуночи попадает в предыдущий день
  // (проверено: неделя от 1 апреля в Берлине начиналась 25 марта вместо 26-го).
  const noon = todayStart.getTime() + DAY_MS / 2;
  const from = zonedDayStart(new Date(noon - daysBack * DAY_MS), timeZone);
  const nextDayStart = zonedDayStart(new Date(noon + DAY_MS), timeZone);

  return { from, to: new Date(nextDayStart.getTime() - 1) };
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
