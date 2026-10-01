// Старые адреса ленты (до D179): `/admin/feed?store=…&station=…&period=…`. Лента переехала
// на экран пиццерии, а ссылки на неё живут в закладках, в чатах и в карточках
// заполнений, открытых раньше. Такой адрес доводится до экрана пиццерии с той же
// станцией и периодом, а не сбрасывается на плитки страны.
import { scopeOf, type Viewer } from "@/blocks/auth/scope";

import { loadFeedCatalog } from "../options";
import { storeStatsHref } from "../stats-view";
import type { FeedView } from "../view";

/**
 * Куда вести старый адрес ленты; `null` — вести некуда, это адрес самого раздела.
 * Станция без пиццерии ищется в справочнике ВИДИМОЙ части сети: чужая станция не
 * находится, и партнёр остаётся в разделе, ничего о ней не узнав (D145).
 */
export async function legacyFeedTarget(
  view: FeedView,
  viewer: Viewer,
): Promise<string | null> {
  const filters = {
    stationId: view.stationId,
    period: view.period,
  };
  if (view.storeId !== undefined) return storeStatsHref(view.storeId, filters);
  if (view.stationId === undefined) return null;

  const catalog = await loadFeedCatalog(scopeOf(viewer));
  const station = catalog.stations.find((row) => row.id === view.stationId);
  return station === undefined
    ? null
    : storeStatsHref(station.storeId, filters);
}
