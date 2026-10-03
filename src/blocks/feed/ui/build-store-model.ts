// Сборка экрана пиццерии (D179): её чек-листы со статистикой и статусом на сегодня,
// сводка за период, тревоги и лента заполнений.
//
// Лента собирается первой и отдельно: только она знает, видна ли пиццерия вошедшему —
// чужая или несуществующая пиццерия в её выборе сбрасывается (D145), и тогда экрана нет.
// Остальное считают те же модули, что у плиток страны, поэтому плитка и экран, куда она
// ведёт, говорят одно и то же.
import type { Locale } from "@/blocks/core/locale";
import { scopeOf as scopeOfViewer, type Viewer } from "@/blocks/auth/scope";

import { checklistHref } from "../checklist-link";
import type { FeedScope } from "../scope";
import { loadSummariesBy, summaryOf } from "../stats-breakdown";
import { countryStatsHref, type StatsPeriodDays } from "../stats-view";
import type { StoreChecklistRow, StoreStatsModel } from "../store-model";
import { pickText } from "../text";
import { todayStatusOf } from "../today-status";
import { listLiveChecklists, type LiveChecklist } from "../today-windows";
import { roundsReportHref, type FeedView } from "../view";
import { buildFeedModel } from "./build-model";
import { buildStatsModel } from "./build-stats-model";

/** «06:00:00» → «06:00»: секунды окна никто не задаёт. */
function hhmm(time: string): string {
  return time.slice(0, 5);
}

export interface StoreView {
  readonly storeId: string;
  readonly days: StatsPeriodDays;
  /** Станция и период ленты; страну и пиццерию задаёт адрес экрана. */
  readonly feed: FeedView;
}

interface RowContext {
  readonly locale: Locale;
  readonly now: Date;
  readonly summaries: Awaited<ReturnType<typeof loadSummariesBy>>;
}

function toRow(row: LiveChecklist, context: RowContext): StoreChecklistRow {
  return {
    checklistId: row.checklistId,
    title: pickText(row.checklistTitle, context.locale),
    stationName: row.stationName,
    window: `${hhmm(row.windowStart)}–${hhmm(row.windowEnd)}`,
    status: todayStatusOf(row.day, context.now),
    summary: summaryOf(context.summaries, row.checklistId),
    href: checklistHref(row.checklistId),
  };
}

/** Модель экрана; `null` — пиццерии нет или она чужая. */
export async function buildStoreModel(
  view: StoreView,
  locale: Locale,
  viewer: Viewer,
  now: Date = new Date(),
): Promise<StoreStatsModel | null> {
  const { countryId: _country, storeId: _store, ...feedFilters } = view.feed;
  void _country;
  void _store;
  const feed = await buildFeedModel(
    { ...feedFilters, storeId: view.storeId },
    locale,
    viewer,
    now,
  );
  const store = feed.selection.stores.find(
    (row) => row.id === feed.selection.storeId,
  );
  if (store === undefined) return null;

  const scope: FeedScope = {
    visible: scopeOfViewer(viewer),
    storeId: store.id,
  };
  const [stats, live, summaries] = await Promise.all([
    buildStatsModel(
      { storeId: store.id, days: view.days },
      locale,
      viewer,
      now,
    ),
    listLiveChecklists(scope, now),
    loadSummariesBy("checklist", scope, view.days, now, store.timezone),
  ]);
  const context: RowContext = { locale, now, summaries };

  return {
    storeId: store.id,
    storeName: store.name,
    countryName:
      feed.selection.countries.find((row) => row.id === store.countryId)
        ?.name ?? null,
    timeZone: store.timezone,
    days: view.days,
    backHref: countryStatsHref({ countryId: store.countryId, days: view.days }),
    reportHref: roundsReportHref({
      countryId: store.countryId,
      storeId: store.id,
      ...(feed.selection.stationId === null
        ? {}
        : { stationId: feed.selection.stationId }),
      period: feed.selection.period,
    }),
    stats,
    checklists: live.rows.map((row) => toRow(row, context)),
    feed,
  };
}
