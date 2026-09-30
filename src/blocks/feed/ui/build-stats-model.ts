// Сборка модели статистики: адрес → область видимости → справочник → числа.
//
// Выбор страны и пиццерии согласуется тем же кодом, что у ленты (`resolveSelection`):
// чужая или несуществующая пиццерия в адресе отбрасывается одинаково на обоих экранах,
// и ссылка с ленты открывает статистику ровно по той же части сети.
import type { Locale } from "@/blocks/core/locale";
import { scopeOf as scopeOfViewer, type Viewer } from "@/blocks/auth/scope";

import { loadFeedCatalog } from "../options";
import { DEFAULT_PERIOD } from "../period";
import type { FeedScope } from "../scope";
import { resolveSelection, screenTimeZone, storeTimeZone } from "../selection";
import { loadStats } from "../stats";
import type { StatsModel, StatsSelection } from "../stats-model";
import type { StatsView } from "../stats-view";
import { pickText } from "../text";

const HOUR_MS = 3_600_000;

/**
 * Модель экрана. `now` приходит параметром: границы периода и порог молчания иначе не
 * проверить, не подменяя системные часы.
 */
export async function buildStatsModel(
  view: StatsView,
  locale: Locale,
  viewer: Viewer,
  now: Date = new Date(),
): Promise<StatsModel> {
  const visible = scopeOfViewer(viewer);
  const catalog = await loadFeedCatalog(visible);
  // Период ленты здесь не читается: у статистики свой, а станции у неё нет вовсе.
  const feedSelection = resolveSelection(
    {
      period: DEFAULT_PERIOD,
      ...(view.countryId === undefined ? {} : { countryId: view.countryId }),
      ...(view.storeId === undefined ? {} : { storeId: view.storeId }),
    },
    catalog,
  );
  const selection: StatsSelection = {
    countryId: feedSelection.countryId,
    storeId: feedSelection.storeId,
    days: view.days,
    countries: feedSelection.countries,
    stores: feedSelection.stores,
  };

  const scope: FeedScope = {
    visible,
    ...(selection.countryId === null ? {} : { countryId: selection.countryId }),
    ...(selection.storeId === null ? {} : { storeId: selection.storeId }),
  };
  const stats = await loadStats(scope, view.days, now);
  const timeZone = screenTimeZone(feedSelection);

  return {
    selection,
    from: stats.from,
    to: stats.to,
    timeZone,
    submissionCount: stats.submissionCount,
    criticalFailedCount: stats.criticalFailedCount,
    criticalFailedShare: stats.criticalFailedShare,
    alarmCount: stats.alarmCount,
    topFailedItems: stats.topFailedItems.map((item) => ({
      itemId: item.itemId,
      title: pickText(item.title, locale),
      failures: item.failures,
      storeCount: item.storeCount,
    })),
    silentStationCount: stats.silentStationCount,
    silentStations: stats.silentStations.map((station) => ({
      stationId: station.stationId,
      stationName: station.stationName,
      storeName: station.storeName,
      timeZone: storeTimeZone(catalog.stores, station.storeId, timeZone),
      silentHours: Math.floor(
        (now.getTime() - station.silentSince.getTime()) / HOUR_MS,
      ),
      lastSignalAt: station.lastSignalAt,
    })),
    isEmpty:
      stats.submissionCount === 0 &&
      stats.alarmCount === 0 &&
      stats.silentStationCount === 0 &&
      stats.topFailedItems.length === 0,
  };
}
