import { getFormatter, getTranslations } from "next-intl/server";
import type { ReactElement } from "react";

import type { StatsModel } from "../stats-model";

/**
 * Две таблицы статистики: пять чаще всего проваливаемых пунктов и станции, молчащие
 * дольше суток. Оформление — как у таблицы ленты (`FeedTable.tsx`); на узком экране
 * таблица прокручивается внутри своей карточки, а не уносит вбок страницу.
 */

const CARD_CLASS =
  "bg-surface rounded-[var(--r-block)] border border-[var(--line-strong)] shadow-[var(--sh-xs)]";
const HEAD_CLASS =
  "rounded-t-[var(--r-block)] border-b border-[var(--line)] bg-[var(--surface-3)] px-[var(--space-7)] py-[var(--space-6)]";
const TITLE_CLASS =
  "m-0 text-[length:var(--fs-title)] leading-[var(--lh-title)] font-semibold";
const LEAD_CLASS =
  "m-0 mt-[var(--space-3)] text-[length:var(--fs-meta)] text-[var(--ink-3)]";
const SCROLL_CLASS = "overflow-x-auto";
const TABLE_CLASS =
  "w-full border-collapse text-[length:var(--fs-dense)] leading-[var(--lh-dense)]";
const TH_CLASS =
  "border-b border-[var(--line-strong)] bg-[var(--surface-3)] px-[var(--cell-pad-x)] py-[var(--space-4)] text-left text-[length:var(--fs-micro)] leading-[var(--lh-micro)] font-semibold tracking-[var(--tracking-micro)] text-[var(--ink-2)] uppercase whitespace-nowrap";
const TH_NUM_CLASS = `${TH_CLASS} text-right`;
const TD_CLASS =
  "border-b border-[var(--line)] px-[var(--cell-pad-x)] py-[var(--space-5)] align-middle";
const TD_NUM_CLASS = `${TD_CLASS} text-right font-[family-name:var(--font-num)] text-[length:var(--fs-num)] [font-variant-numeric:tabular-nums] whitespace-nowrap`;
const META_CLASS = "text-[length:var(--fs-meta)] text-[var(--ink-3)]";
const NOTE_CLASS =
  "px-[var(--space-7)] py-[var(--space-6)] text-[length:var(--fs-meta)] text-[var(--ink-3)]";

/**
 * Прокручиваемая область таблицы достижима с клавиатуры: на телефоне таблица шире окна,
 * и без фокуса её правую часть не прокрутить ничем, кроме пальца (axe,
 * `scrollable-region-focusable`).
 */
function scrollRegion(labelledBy: string) {
  return {
    tabIndex: 0,
    role: "region",
    "aria-labelledby": labelledBy,
  } as const;
}

interface SectionHeadProps {
  readonly id: string;
  readonly title: string;
  readonly lead: string;
}

function SectionHead({ id, title, lead }: SectionHeadProps): ReactElement {
  return (
    <div className={HEAD_CLASS}>
      <h2 id={id} className={TITLE_CLASS}>
        {title}
      </h2>
      <p className={LEAD_CLASS}>{lead}</p>
    </div>
  );
}

export async function StatsTopFailedTable({
  model,
}: {
  readonly model: StatsModel;
}): Promise<ReactElement> {
  const t = await getTranslations("feed.stats");
  // Колонка пиццерий нужна, только пока пиццерия не выбрана: внутри одной она всегда 1.
  const showStores = model.selection.storeId === null;

  return (
    <section className={CARD_CLASS} aria-labelledby="stats-top-title">
      <SectionHead
        id="stats-top-title"
        title={t("topTitle")}
        lead={t("topLead")}
      />
      {model.topFailedItems.length === 0 ? (
        <p className={NOTE_CLASS} data-testid="stats-top-empty">
          {t("topEmpty")}
        </p>
      ) : (
        <div className={SCROLL_CLASS} {...scrollRegion("stats-top-title")}>
          <table className={TABLE_CLASS} data-testid="stats-top">
            <thead>
              <tr>
                <th scope="col" className={TH_CLASS}>
                  {t("topItem")}
                </th>
                <th scope="col" className={TH_NUM_CLASS}>
                  {t("topFailures")}
                </th>
                {showStores ? (
                  <th scope="col" className={TH_NUM_CLASS}>
                    {t("topStores")}
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {model.topFailedItems.map((item) => (
                <tr key={item.itemId} data-testid="stats-top-row">
                  <td className={TD_CLASS}>{item.title}</td>
                  <td className={TD_NUM_CLASS} data-testid="stats-top-failures">
                    {item.failures}
                  </td>
                  {showStores ? (
                    <td className={TD_NUM_CLASS}>{item.storeCount}</td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

const HOURS_PER_DAY = 24;

export async function StatsSilentTable({
  model,
}: {
  readonly model: StatsModel;
}): Promise<ReactElement> {
  const t = await getTranslations("feed.stats");
  const format = await getFormatter();

  const silentFor = (hours: number): string =>
    hours < HOURS_PER_DAY
      ? t("silentHours", { hours })
      : t("silentDays", {
          days: Math.floor(hours / HOURS_PER_DAY),
          hours: hours % HOURS_PER_DAY,
        });

  return (
    <section className={CARD_CLASS} aria-labelledby="stats-silent-title">
      <SectionHead
        id="stats-silent-title"
        title={t("silentTitle")}
        lead={t("silentLead")}
      />
      {model.silentStations.length === 0 ? (
        <p className={NOTE_CLASS} data-testid="stats-silent-empty">
          {t("silentEmpty")}
        </p>
      ) : (
        <>
          <div className={SCROLL_CLASS} {...scrollRegion("stats-silent-title")}>
            <table className={TABLE_CLASS} data-testid="stats-silent-list">
              <thead>
                <tr>
                  <th scope="col" className={TH_CLASS}>
                    {t("silentStation")}
                  </th>
                  <th scope="col" className={TH_NUM_CLASS}>
                    {t("silentFor")}
                  </th>
                  <th scope="col" className={TH_CLASS}>
                    {t("silentLast")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {model.silentStations.map((station) => (
                  <tr key={station.stationId} data-testid="stats-silent-row">
                    <td className={TD_CLASS}>
                      {station.stationName}
                      <div className={META_CLASS}>{station.storeName}</div>
                    </td>
                    <td className={TD_NUM_CLASS}>
                      {silentFor(station.silentHours)}
                    </td>
                    <td className={`${TD_CLASS} whitespace-nowrap`}>
                      {station.lastSignalAt === null
                        ? t("silentNever")
                        : format.dateTime(station.lastSignalAt, {
                            day: "numeric",
                            month: "long",
                            hour: "2-digit",
                            minute: "2-digit",
                            timeZone: station.timeZone,
                          })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {model.silentStationCount > model.silentStations.length ? (
            <p className={NOTE_CLASS} data-testid="stats-silent-more">
              {t("silentMore", {
                shown: model.silentStations.length,
                total: model.silentStationCount,
              })}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
