import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import type { ReactElement } from "react";

import { ADMIN_SECTIONS } from "@/blocks/core/admin-sections";

import type { StoreChecklistRow, StoreStatsModel } from "../store-model";
import {
  CARD_CLASS,
  META_CLASS,
  NOTE_CLASS,
  SCROLL_CLASS,
  SectionHead,
  TABLE_CLASS,
  TD_CLASS,
  TD_NUM_CLASS,
  TH_CLASS,
  TH_NUM_CLASS,
  scrollRegion,
} from "./StatsTables";
import { TodayStatusTag } from "./TodayStatusTag";

/**
 * Чек-листы пиццерии (D179): по строке на работающий чек-лист — станция и окно, статус
 * на сегодня и статистика за период (состав D170). Оформление — как у таблиц сводки.
 * Числа готовые: доля только переводится в проценты.
 */

const HEAD_ID = "store-checklists-title";
const NAME_CLASS =
  "font-medium text-ink no-underline hover:text-[var(--accent)] hover:underline";

type Translate = Awaited<ReturnType<typeof getTranslations>>;
type Formatter = Awaited<ReturnType<typeof getFormatter>>;

function criticalText(
  row: StoreChecklistRow,
  format: Formatter,
  t: Translate,
): string {
  const { criticalFailedShare, criticalFailedCount } = row.summary;
  if (criticalFailedShare === null) return t("stats.noValue");
  return t("store.criticalValue", {
    share: format.number(criticalFailedShare, {
      style: "percent",
      maximumFractionDigits: 1,
    }),
    failed: criticalFailedCount,
  });
}

function lastText(
  row: StoreChecklistRow,
  timeZone: string,
  format: Formatter,
  t: Translate,
): string {
  const at = row.summary.lastSubmittedAt;
  if (at === null) return t("store.never");
  return format.dateTime(at, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  });
}

export async function StoreChecklistsTable({
  model,
}: {
  readonly model: StoreStatsModel;
}): Promise<ReactElement> {
  const t = await getTranslations("feed");
  const format = await getFormatter();

  return (
    <section className={CARD_CLASS} data-testid="store-checklists">
      <SectionHead
        id={HEAD_ID}
        title={t("store.checklistsTitle")}
        lead={t("store.checklistsLead")}
      />
      {model.checklists.length === 0 ? (
        <p className={NOTE_CLASS} data-testid="store-checklists-empty">
          {t("store.noChecklists")}{" "}
          <Link href={ADMIN_SECTIONS.stations.path} className="underline">
            {t("store.noChecklistsAction")}
          </Link>
        </p>
      ) : (
        <div className={SCROLL_CLASS} {...scrollRegion(HEAD_ID)}>
          <table className={TABLE_CLASS}>
            <thead>
              <tr>
                <th className={TH_CLASS}>{t("store.colChecklist")}</th>
                <th className={TH_CLASS}>{t("store.colToday")}</th>
                <th className={TH_NUM_CLASS}>{t("store.colSubmissions")}</th>
                <th className={TH_NUM_CLASS}>{t("store.colCritical")}</th>
                <th className={TH_CLASS}>{t("store.colLast")}</th>
              </tr>
            </thead>
            <tbody>
              {model.checklists.map((row) => (
                <tr key={row.checklistId} data-testid="store-checklist-row">
                  <td className={TD_CLASS}>
                    <Link href={row.href} className={NAME_CLASS}>
                      {row.title}
                    </Link>
                    <div className={META_CLASS}>
                      {row.stationName} · {row.window}
                    </div>
                  </td>
                  <td className={TD_CLASS}>
                    <TodayStatusTag
                      status={row.status}
                      timeZone={model.timeZone}
                    />
                  </td>
                  <td
                    className={TD_NUM_CLASS}
                    data-testid="checklist-submissions"
                  >
                    {String(row.summary.submissionCount)}
                  </td>
                  <td className={TD_NUM_CLASS} data-testid="checklist-critical">
                    {criticalText(row, format, t)}
                  </td>
                  <td className={`${TD_CLASS} whitespace-nowrap`}>
                    {lastText(row, model.timeZone, format, t)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
