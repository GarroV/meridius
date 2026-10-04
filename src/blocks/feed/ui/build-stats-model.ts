// Сборка модели статистики: адрес → область видимости → справочник → числа.
//
// Выбор страны и пиццерии согласуется тем же кодом, что у ленты (`resolveSelection`):
// чужая или несуществующая пиццерия в адресе отбрасывается одинаково на обоих экранах,
// и ссылка с ленты открывает статистику ровно по той же части сети.
import type { Locale } from "@/blocks/core/locale";
import { scopeOf as scopeOfViewer, type Viewer } from "@/blocks/auth/scope";

import { loadFeedCatalog } from "../options";
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
  // Станции у статистики нет; период — тот же один на экран, разобранный в поясе экрана.
  const feedSelection = resolveSelection(
    {
      ...(view.period === undefined ? {} : { period: view.period }),
      ...(view.countryId === undefined ? {} : { countryId: view.countryId }),
      ...(view.storeId === undefined ? {} : { storeId: view.storeId }),
    },
    catalog,
    now,
  );
  const selection: StatsSelection = {
    countryId: feedSelection.countryId,
    storeId: feedSelection.storeId,
    period: feedSelection.period,
    countries: feedSelection.countries,
    stores: feedSelection.stores,
  };

  const scope: FeedScope = {
    visible,
    ...(selection.countryId === null ? {} : { countryId: selection.countryId }),
    ...(selection.storeId === null ? {} : { storeId: selection.storeId }),
  };
  // Пояс экрана — тот же, по которому главная режет «последние 7 дней» (#216).
  const timeZone = screenTimeZone(feedSelection);
  const stats = await loadStats(scope, selection.period, now, timeZone);

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
