// «3 ч назад» вместо даты: главная — пульт на сейчас, и относительное время не требует
// выяснять пояс пиццерии, который у станций сети разный.
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export function ago(at: Date, now: Date, locale: string): string {
  const format = new Intl.RelativeTimeFormat(locale, {
    numeric: "auto",
    style: "short",
  });
  const past = Math.max(0, now.getTime() - at.getTime());

  if (past < HOUR_MS)
    return format.format(-Math.floor(past / MINUTE_MS), "minute");
  if (past < DAY_MS) return format.format(-Math.floor(past / HOUR_MS), "hour");
  return format.format(-Math.floor(past / DAY_MS), "day");
}
