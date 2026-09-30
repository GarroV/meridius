import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import type { ReactElement } from "react";

import { ADMIN_SECTIONS } from "@/blocks/core/admin-sections";
import { formActionPath } from "@/blocks/core/base-path";
import { AdminShell } from "@/blocks/core/ui/AdminShell";

import { DEFAULT_PERIOD } from "../period";
import { STATS_PATH } from "../routes";
import type { StatsModel } from "../stats-model";
import { feedHref } from "../view";
import { StatsFilterSelects } from "./StatsFilterSelects";
import { StatsSilentTable, StatsTopFailedTable } from "./StatsTables";
import { TopbarActions } from "./TopbarActions";

/**
 * Экран статистики (D150, D170): сводка по стране или по одной пиццерии за 7 или 30
 * дней. Эталона в `docs/furca/design/` у экрана нет — он появился решением владельца
 * после эталонов, поэтому собран из деталей соседних экранов блока: карточка фильтров и
 * плитки показателей ленты, таблицы — как в ленте. Графиков и выгрузки нет (D170).
 *
 * Числа приходят готовыми из модели. Здесь их только подписывают: доля переводится в
 * проценты, и больше ничего не пересчитывается.
 */

const CARD_CLASS =
  "bg-surface rounded-[var(--r-block)] border border-[var(--line-strong)] shadow-[var(--sh-xs)]";
const FILTERS_CLASS = "p-[var(--space-7)]";
const ROW_CLASS = "flex flex-wrap items-end gap-[var(--space-5)]";
const RESET_CLASS =
  "ml-auto inline-flex h-[var(--control-h)] items-center justify-center gap-[var(--space-4)] rounded-[var(--r-control)] border border-transparent bg-transparent px-[var(--space-6)] text-[length:var(--fs-body)] font-medium text-[var(--ink-2)] no-underline hover:bg-[var(--surface-3)] hover:text-ink";
const APPLY_CLASS =
  "bg-surface text-ink inline-flex h-[var(--control-h)] items-center justify-center rounded-[var(--r-control)] border border-[var(--line-control)] px-[var(--space-6)] text-[length:var(--fs-body)] font-medium";
const META_CLASS = "text-[length:var(--fs-meta)] text-[var(--ink-3)]";
const BACK_CLASS =
  "inline-flex h-[var(--control-h-sm)] items-center justify-center gap-[var(--space-4)] rounded-[var(--r-control)] border border-transparent bg-transparent px-[var(--space-5)] text-[length:var(--fs-dense)] font-medium text-[var(--ink-2)] no-underline hover:bg-[var(--surface-3)] hover:text-ink";
// Четыре плитки: на телефоне друг под другом, на планшете по две, на широком — в ряд.
// Та же причина, что у плиток ленты (`FeedMetrics.tsx`): сплюснутые подписи раздвигают
// колонку каркаса и уносят вбок всю страницу.
const GRID_CLASS = "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4";
const CELL_CLASS =
  "border-t border-[var(--line)] p-[var(--space-7)] first:border-t-0 sm:[&:nth-child(2)]:border-t-0 lg:border-t-0 lg:[&:not(:first-child)]:border-l";
const VALUE_CLASS =
  "text-[length:var(--fs-num-hero)] leading-[1.1] font-semibold font-[family-name:var(--font-num)] [font-variant-numeric:tabular-nums]";
const CAPTION_CLASS =
  "mt-[var(--space-3)] text-[length:var(--fs-meta)] text-[var(--ink-3)]";
const EMPTY_CLASS =
  "flex flex-col items-center gap-[var(--space-5)] px-[var(--space-8)] py-[var(--space-10)] text-center text-[var(--ink-2)]";
const EMPTY_TITLE_CLASS =
  "text-ink m-0 text-[length:var(--fs-title)] leading-[var(--lh-title)] font-semibold";
const BTN_CLASS =
  "bg-surface text-ink inline-flex h-[var(--control-h)] items-center justify-center gap-[var(--space-4)] rounded-[var(--r-control)] border border-[var(--line-control)] px-[var(--space-6)] text-[length:var(--fs-body)] font-medium no-underline hover:border-[var(--line-control-2)] hover:bg-[var(--surface-2)]";

type Translate = Awaited<ReturnType<typeof getTranslations>>;
type Formatter = Awaited<ReturnType<typeof getFormatter>>;

function breadcrumbOf(model: StatsModel, t: Translate): string {
  const { selection } = model;
  const country =
    selection.countries.find((row) => row.id === selection.countryId)?.name ??
    t("crumbs.allCountries");
  const store =
    selection.stores.find((row) => row.id === selection.storeId)?.name ??
    t("crumbs.allStores");
  return `${country} · ${store}`;
}

function periodText(model: StatsModel, format: Formatter, t: Translate) {
  const day = (at: Date): string =>
    format.dateTime(at, {
      day: "numeric",
      month: "long",
      timeZone: model.timeZone,
    });
  return t("stats.period", {
    days: model.selection.days,
    from: day(model.from),
    to: day(model.to),
  });
}

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

async function StatsFilters({
  model,
}: {
  readonly model: StatsModel;
}): Promise<ReactElement> {
  const t = await getTranslations("feed");
  return (
    <div className={CARD_CLASS}>
      <form
        method="get"
        action={formActionPath(STATS_PATH)}
        data-testid="stats-filters"
        className={`${FILTERS_CLASS} ${ROW_CLASS}`}
      >
        <StatsFilterSelects
          selection={model.selection}
          labels={{
            country: t("filters.country"),
            store: t("filters.store"),
            period: t("filters.period"),
            all: t("filters.all"),
            days: { "7": t("stats.days7"), "30": t("stats.days30") },
          }}
        />
        <noscript>
          <button type="submit" className={APPLY_CLASS}>
            {t("filters.apply")}
          </button>
        </noscript>
        <Link
          href={STATS_PATH}
          data-testid="stats-reset"
          className={RESET_CLASS}
        >
          {t("filters.reset")}
        </Link>
      </form>
    </div>
  );
}

async function StatsMetrics({
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

async function StatsEmpty(): Promise<ReactElement> {
  const t = await getTranslations("feed.stats");
  return (
    <div className={CARD_CLASS}>
      <div className={EMPTY_CLASS} data-testid="stats-empty">
        <p className={EMPTY_TITLE_CLASS}>{t("emptyTitle")}</p>
        <p className="m-0 max-w-[520px]">{t("emptyText")}</p>
        <Link href={ADMIN_SECTIONS.checklists.path} className={BTN_CLASS}>
          {t("emptyAction")}
        </Link>
      </div>
    </div>
  );
}

export async function StatsScreen({
  model,
}: {
  readonly model: StatsModel;
}): Promise<ReactElement> {
  const t = await getTranslations("feed");
  const format = await getFormatter();
  // Назад — в ленту с тем же выбором страны и пиццерии, за её период по умолчанию.
  const back = feedHref({
    period: DEFAULT_PERIOD,
    ...(model.selection.countryId === null
      ? {}
      : { countryId: model.selection.countryId }),
    ...(model.selection.storeId === null
      ? {}
      : { storeId: model.selection.storeId }),
  });

  return (
    <AdminShell
      testId="stats-screen"
      active="feed"
      breadcrumb={breadcrumbOf(model, t)}
      title={t("stats.title")}
      topbarAction={
        <TopbarActions>
          <span className={META_CLASS} data-testid="stats-period">
            {periodText(model, format, t)}
          </span>
          <Link
            href={back}
            data-testid="stats-feed-link"
            className={BACK_CLASS}
          >
            {t("stats.backToFeed")}
          </Link>
        </TopbarActions>
      }
    >
      <StatsFilters model={model} />

      <p className={META_CLASS} data-testid="stats-lead">
        {t("stats.lead")}
      </p>

      {model.isEmpty ? (
        <StatsEmpty />
      ) : (
        <>
          <StatsMetrics model={model} />
          <StatsTopFailedTable model={model} />
          <StatsSilentTable model={model} />
        </>
      )}
    </AdminShell>
  );
}
