import { getTranslations } from "next-intl/server";
import type { ReactElement } from "react";

import { formatDuration } from "../format";
import type { FeedMetrics as FeedMetricsModel } from "../model";
import type { FeedPeriod } from "../period";

/**
 * Три показателя за выбранный период (эталон `.kpi` в feed.html).
 *
 * Числа приходят готовыми из модели, посчитанные по тому же массиву строк, который
 * показан в ленте (T045). Здесь их не пересчитывают и не досчитывают: собственный
 * счёт на экране — самый простой способ показать «14 заполнений» над лентой из
 * тринадцати.
 */

const CARD_CLASS =
  "bg-surface rounded-[var(--r-block)] border border-[var(--line-strong)] shadow-[var(--sh-xs)]";
// Три плитки в ряд — как на эталоне, но только с `sm`. На телефоне колонке содержимого
// остаётся 167 px, и три колонки требуют 198: подпись вроде «Проваленных критичных»
// не влезает в треть и раздвигает колонку каркаса, унося вбок всю страницу (замер на
// 375 px: этот блок один давал scrollWidth 406). Поставленные друг под друга плитки
// читаются на телефоне лучше сплюснутых, а разделитель переезжает слева наверх.
const GRID_CLASS = "grid grid-cols-1 gap-[var(--space-7)] sm:grid-cols-3";
const CELL_CLASS = "p-[var(--space-7)]";
const CELL_DIVIDED_CLASS = `${CELL_CLASS} border-t border-[var(--line)] sm:border-t-0 sm:border-l`;
const VALUE_CLASS =
  "text-[length:var(--fs-num-hero)] leading-[1.1] font-semibold font-[family-name:var(--font-num)] [font-variant-numeric:tabular-nums]";
const CAPTION_CLASS =
  "mt-[var(--space-3)] text-[length:var(--fs-meta)] text-[var(--ink-3)]";

const PERIOD_CAPTION: Record<FeedPeriod, string> = {
  today: "periodToday",
  week: "periodWeek",
  month: "periodMonth",
};

export interface FeedMetricsProps {
  readonly metrics: FeedMetricsModel;
  readonly period: FeedPeriod;
}

interface CellProps {
  readonly testId: string;
  readonly value: string;
  readonly caption: string;
  readonly divided?: boolean;
  readonly alarming?: boolean;
}

function Cell({
  testId,
  value,
  caption,
  divided = false,
  alarming = false,
}: CellProps): ReactElement {
  return (
    <div className={divided ? CELL_DIVIDED_CLASS : CELL_CLASS}>
      <div
        data-testid={testId}
        className={VALUE_CLASS}
        // Красным — только когда провалы действительно есть: красный ноль пугает
        // на ровном месте и обесценивает цвет там, где он что-то значит.
        style={alarming ? { color: "var(--err)" } : undefined}
      >
        {value}
      </div>
      <div className={CAPTION_CLASS}>{caption}</div>
    </div>
  );
}

export async function FeedMetrics({
  metrics,
  period,
}: FeedMetricsProps): Promise<ReactElement> {
  const t = await getTranslations("feed.metrics");

  return (
    <div className={CARD_CLASS} data-testid="feed-metrics">
      <div className={GRID_CLASS}>
        <Cell
          testId="metric-submissions"
          value={String(metrics.submissionCount)}
          caption={t("submissions", {
            count: metrics.submissionCount,
            period: t(PERIOD_CAPTION[period]),
          })}
        />
        <Cell
          testId="metric-critical"
          divided
          alarming={metrics.failedCriticalCount > 0}
          value={String(metrics.failedCriticalCount)}
          caption={t("failedCritical", { count: metrics.failedCriticalCount })}
        />
        <Cell
          testId="metric-duration"
          divided
          value={
            metrics.averageDurationMs === null
              ? t("noValue")
              : formatDuration(metrics.averageDurationMs)
          }
          caption={t("averageDuration")}
        />
      </div>
    </div>
  );
}
