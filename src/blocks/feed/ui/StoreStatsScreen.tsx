import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import type { ReactElement } from "react";

import { AdminShell } from "@/blocks/core/ui/AdminShell";

import { storeStatsPath } from "../routes";
import type { StoreStatsModel } from "../store-model";
import { DAYS_PARAM, storeStatsHref } from "../stats-view";
import { AlarmStrip } from "./AlarmStrip";
import { FeedEmpty } from "./FeedEmpty";
import { FeedFilters } from "./FeedFilters";
import { FeedMetrics } from "./FeedMetrics";
import { FeedTable } from "./FeedTable";
import { PeriodSwitch } from "./PeriodSwitch";
import { StatsMetrics } from "./StatsMetrics";
import { StatsSilentTable, StatsTopFailedTable } from "./StatsTables";
import { StoreChecklistsTable } from "./StoreChecklistsTable";
import { TopbarActions } from "./TopbarActions";

/**
 * Экран пиццерии раздела «Статистика» (D179). Владелец: «при проваливании в плитку он
 * видит все чеклисты что в пиццерии и статистику по ним + текущий статус». Сверху —
 * сводка пиццерии за период (D170) и её чек-листы, ниже — то, что «переехало» из
 * «Заполнений»: тревоги и лента заполнений этой пиццерии, со станцией и периодом ленты.
 *
 * Эталона в `docs/furca/design/` у экрана нет: он собран из деталей соседних экранов
 * блока (плитки сводки, таблицы, полоса тревог и лента — как были).
 */

const LINK_CLASS =
  "inline-flex h-[var(--control-h-sm)] items-center justify-center gap-[var(--space-4)] rounded-[var(--r-control)] border border-transparent bg-transparent px-[var(--space-5)] text-[length:var(--fs-dense)] font-medium text-[var(--ink-2)] no-underline hover:bg-[var(--surface-3)] hover:text-ink";
const META_CLASS = "text-[length:var(--fs-meta)] text-[var(--ink-3)]";
const H2_CLASS =
  "m-0 text-[length:var(--fs-title)] leading-[var(--lh-title)] font-semibold";
const CRUMB_LINK_CLASS = "text-[var(--ink-3)] no-underline hover:underline";

type Formatter = Awaited<ReturnType<typeof getFormatter>>;
type Translate = Awaited<ReturnType<typeof getTranslations>>;

function periodText(
  model: StoreStatsModel,
  format: Formatter,
  t: Translate,
): string {
  const day = (at: Date): string =>
    format.dateTime(at, {
      day: "numeric",
      month: "long",
      timeZone: model.timeZone,
    });
  return t("stats.period", {
    days: model.days,
    from: day(model.stats.from),
    to: day(model.stats.to),
  });
}

async function FeedPart({
  model,
}: {
  readonly model: StoreStatsModel;
}): Promise<ReactElement> {
  const t = await getTranslations("feed.store");
  const { feed } = model;
  const path = storeStatsPath(model.storeId);

  return (
    <section
      className="flex flex-col gap-[var(--space-7)]"
      aria-labelledby="store-feed-title"
      data-testid="store-feed"
    >
      <div>
        <h2 id="store-feed-title" className={H2_CLASS}>
          {t("feedTitle")}
        </h2>
        <p className={`m-0 mt-[var(--space-2)] ${META_CLASS}`}>
          {t("feedLead")}
        </p>
      </div>
      {/* Тревоги выше ленты: это единственное, что требует действия сегодня (D053). */}
      <AlarmStrip alarms={feed.alarms} selection={feed.selection} />
      <FeedFilters
        selection={feed.selection}
        timeZone={feed.timeZone}
        timeZoneAmbiguous={false}
        action={path}
        withPlace={false}
        hidden={{ [DAYS_PARAM]: String(model.days) }}
      />
      <FeedMetrics metrics={feed.metrics} period={feed.selection.period} />
      {feed.emptyKind === null ? (
        <FeedTable
          rows={feed.rows}
          selection={feed.selection}
          limitReached={feed.limitReached}
        />
      ) : (
        <FeedEmpty kind={feed.emptyKind} resetHref={path} />
      )}
    </section>
  );
}

export async function StoreStatsScreen({
  model,
}: {
  readonly model: StoreStatsModel;
}): Promise<ReactElement> {
  const t = await getTranslations("feed");
  const format = await getFormatter();
  const { feed } = model;

  const breadcrumb = (
    <>
      <Link href={model.backHref} className={CRUMB_LINK_CLASS}>
        {model.countryName ?? t("store.crumb")}
      </Link>
      {" · "}
      {model.storeName}
    </>
  );

  return (
    <AdminShell
      testId="store-stats-screen"
      active="feed"
      breadcrumb={breadcrumb}
      title={model.storeName}
      topbarAction={
        <TopbarActions>
          <span className={META_CLASS} data-testid="stats-period">
            {periodText(model, format, t)}
          </span>
          <PeriodSwitch
            days={model.days}
            hrefOf={(days) =>
              storeStatsHref(model.storeId, {
                days,
                stationId: feed.selection.stationId,
                period: feed.selection.period,
              })
            }
          />
          <Link
            href={model.reportHref}
            data-testid="feed-report-link"
            className={LINK_CLASS}
          >
            {t("store.report")}
          </Link>
          <Link
            href={model.backHref}
            data-testid="store-back"
            className={LINK_CLASS}
          >
            {t("store.back")}
          </Link>
        </TopbarActions>
      }
    >
      <StatsMetrics model={model.stats} />
      <StoreChecklistsTable model={model} />
      <StatsTopFailedTable model={model.stats} />
      <StatsSilentTable model={model.stats} />
      <FeedPart model={model} />
    </AdminShell>
  );
}
