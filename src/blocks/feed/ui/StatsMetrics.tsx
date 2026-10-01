import { getFormatter, getTranslations } from "next-intl/server";
import type { ReactElement } from "react";

import type { StatsModel } from "../stats-model";

/**
 * Четыре числа сводки (D170): заполнения, доля с проваленным критичным, поставленные
 * будильники, молчащие станции. Одна разметка на страну и на пиццерию (D179): числа
 * приходят готовыми, здесь доля только переводится в проценты.
 */

const CARD_CLASS =
  "bg-surface rounded-[var(--r-block)] border border-[var(--line-strong)] shadow-[var(--sh-xs)]";
// На телефоне друг под другом, на планшете по две, на широком — в ряд: сплюснутые подписи
// раздвигают колонку каркаса и уносят вбок всю страницу (та же причина, что у ленты).
const GRID_CLASS = "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4";
const CELL_CLASS =
  "border-t border-[var(--line)] p-[var(--space-7)] first:border-t-0 sm:[&:nth-child(2)]:border-t-0 lg:border-t-0 lg:[&:not(:first-child)]:border-l";
const VALUE_CLASS =
  "text-[length:var(--fs-num-hero)] leading-[1.1] font-semibold font-[family-name:var(--font-num)] [font-variant-numeric:tabular-nums]";
const CAPTION_CLASS =
  "mt-[var(--space-3)] text-[length:var(--fs-meta)] text-[var(--ink-3)]";

interface CellProps {
  readonly testId: string;
  readonly value: string;
  readonly caption: string;
  readonly alarming?: boolean;
}

function Cell({ testId, value, caption, alarming }: CellProps): ReactElement {
  return (
    <div className={CELL_CLASS}>
      <div
        data-testid={testId}
        className={VALUE_CLASS}
        // Красным — только когда есть что чинить: красный ноль обесценивает цвет.
        style={alarming === true ? { color: "var(--err)" } : undefined}
      >
        {value}
      </div>
      <div className={CAPTION_CLASS}>{caption}</div>
    </div>
  );
}

export async function StatsMetrics({
  model,
}: {
  readonly model: StatsModel;
}): Promise<ReactElement> {
  const t = await getTranslations("feed.stats");
  const format = await getFormatter();
  const share =
    model.criticalFailedShare === null
      ? t("noValue")
      : format.number(model.criticalFailedShare, {
          style: "percent",
          maximumFractionDigits: 1,
        });

  return (
    <div className={CARD_CLASS} data-testid="stats-metrics">
      <div className={GRID_CLASS}>
        <Cell
          testId="stats-submissions"
          value={String(model.submissionCount)}
          caption={t("submissions", { count: model.submissionCount })}
        />
        <Cell
          testId="stats-critical-share"
          value={share}
          alarming={model.criticalFailedCount > 0}
          caption={
            model.criticalFailedShare === null
              ? t("criticalShareEmpty")
              : t("criticalShare", {
                  failed: model.criticalFailedCount,
                  total: model.submissionCount,
                })
          }
        />
        <Cell
          testId="stats-alarms"
          value={String(model.alarmCount)}
          caption={t("alarms", { count: model.alarmCount })}
        />
        <Cell
          testId="stats-silent"
          value={String(model.silentStationCount)}
          alarming={model.silentStationCount > 0}
          caption={t("silent", { count: model.silentStationCount })}
        />
      </div>
    </div>
  );
}
