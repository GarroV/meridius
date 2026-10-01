import { getFormatter, getTranslations } from "next-intl/server";
import type { ReactElement } from "react";

import type { TodayStatus, TodayStatusKind } from "../today-status";

/**
 * Статус чек-листа на сегодня (D179) — метка ядра `.tag` (D164). Цвет несёт смысл, как у
 * итога заполнения: зелёный — заполнен, красный — окно пропущено, нейтральный — ещё
 * ждём или не ждали вовсе. Время подписано в поясе пиццерии.
 */
const TAG_CLASS: Record<TodayStatusKind, string> = {
  filled: "tag tag--ok",
  upcoming: "tag tag--neutral",
  open: "tag tag--accent",
  missed: "tag tag--err",
  notExpected: "tag tag--neutral tag--dashed",
  unknownZone: "tag tag--warn",
};

export async function TodayStatusTag({
  status,
  timeZone,
}: {
  readonly status: TodayStatus;
  readonly timeZone: string;
}): Promise<ReactElement> {
  const t = await getTranslations("feed.today");
  const format = await getFormatter();
  const text =
    status.kind === "notExpected" || status.kind === "unknownZone"
      ? t(status.kind)
      : t(status.kind, {
          time: format.dateTime(status.at, {
            hour: "2-digit",
            minute: "2-digit",
            timeZone,
          }),
        });

  return (
    <span
      className={`${TAG_CLASS[status.kind]} whitespace-nowrap`}
      data-testid="today-status"
      data-kind={status.kind}
    >
      {text}
    </span>
  );
}
