import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactElement } from "react";

import { STATS_PERIOD_DAYS, type StatsPeriodDays } from "../stats-view";

/**
 * Переключатель периода статистики «7 дней / 30 дней» (D170) — пилюля ядра `.seg`
 * (D164). Положения — ссылки: период живёт в адресе, и ссылкой на «30 дней по Алматы»
 * можно поделиться. Выбранное положение помечено `aria-current`, как в эталоне.
 */
export async function PeriodSwitch({
  days,
  hrefOf,
}: {
  readonly days: StatsPeriodDays;
  readonly hrefOf: (days: StatsPeriodDays) => string;
}): Promise<ReactElement> {
  const t = await getTranslations("feed.stats");
  const labels: Record<StatsPeriodDays, string> = {
    7: t("days7"),
    30: t("days30"),
  };

  return (
    <nav aria-label={t("periodLabel")} className="seg" data-testid="stats-days">
      {STATS_PERIOD_DAYS.map((option) =>
        option === days ? (
          <span key={option} className="seg__current" aria-current="page">
            {labels[option]}
          </span>
        ) : (
          <Link
            key={option}
            href={hrefOf(option)}
            className="seg__item no-underline"
            data-testid={`stats-days-${String(option)}`}
          >
            {labels[option]}
          </Link>
        ),
      )}
    </nav>
  );
}
