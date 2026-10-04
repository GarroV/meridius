// Старые адреса ленты (до D179): `/admin/feed?store=…&station=…&period=…`. Лента переехала
// на экран пиццерии, а ссылки на неё живут в закладках, в чатах и в карточках
// заполнений, открытых раньше. Такой адрес доводится до экрана пиццерии с той же
// станцией и периодом, а не сбрасывается на плитки страны.
import { scopeOf, type Viewer } from "@/blocks/auth/scope";

import { loadFeedCatalog } from "../options";
import { feedHref, type FeedView } from "../view";

/**
 * Куда вести старый адрес ленты; `null` — вести некуда, это адрес самого раздела.
 * Станция без пиццерии ищется в справочнике ВИДИМОЙ части сети: чужая станция не
 * находится, и партнёр остаётся в разделе, ничего о ней не узнав (D145).
 */
export async function legacyFeedTarget(
  view: FeedView,
  viewer: Viewer,
): Promise<string | null> {
  // Станция и период переезжают как пришли (страну адрес пиццерии не несёт): старый
  // `period=` экран пиццерии сам переведёт в даты, когда узнает пояс пиццерии.
  if (view.storeId !== undefined) return feedHref(view);
  if (view.stationId === undefined) return null;

  const catalog = await loadFeedCatalog(scopeOf(viewer));
  const station = catalog.stations.find((row) => row.id === view.stationId);
  return station === undefined
    ? null
    : feedHref({ ...view, storeId: station.storeId });
}
