// Данные главной кабинета (D169). Своих запросов здесь нет: заполнения, метрики и
// тревоги — у ленты, станции и их дырки — у раздела «Станции», планшеты — у
// «Устройств», черновики — у списка чек-листов. Главная только сводит их в одну
// область фильтра, поэтому её цифры не могут разойтись с разделами, куда она ведёт.
import type { Locale } from "@/blocks/core/locale";
import { listStationTablets } from "@/blocks/device/station-tablets";
import { listChecklists } from "@/blocks/editor/listing";
import type { FeedModel, FeedSelection } from "@/blocks/feed/model";
import { buildFeedModel } from "@/blocks/feed/ui/build-model";
import type { FeedView } from "@/blocks/feed/view";
import { listNetworkStations } from "@/blocks/stations/overview";

import {
  countGapsOf,
  countWorking,
  inScope,
  mergeStations,
  summarizeStores,
  type HomeScope,
  type HomeStation,
  type StoreSummary,
} from "./summary";

export interface HomeModel {
  readonly feed: FeedModel;
  /** Станции выбранной области. */
  readonly stations: readonly HomeStation[];
  /** Сводка по пиццериям — когда пиццерия не выбрана. */
  readonly stores: readonly StoreSummary[];
  /** Выбрана пиццерия или станция: таблица станций вместо сводки по пиццериям. */
  readonly isStoreLevel: boolean;
  readonly working: { readonly working: number; readonly total: number };
  readonly gaps: { readonly noChecklist: number; readonly silent: number };
  /** Чек-листов области с неопубликованной правкой. */
  readonly drafts: number;
}

function scopeOf(selection: FeedSelection): HomeScope {
  return {
    ...(selection.countryId === null ? {} : { countryId: selection.countryId }),
    ...(selection.storeId === null ? {} : { storeId: selection.storeId }),
    ...(selection.stationId === null ? {} : { stationId: selection.stationId }),
  };
}

export async function loadHome(
  view: FeedView,
  locale: Locale,
  now: Date = new Date(),
): Promise<HomeModel> {
  // Лента первой и отдельно: только она знает, какая область на самом деле выбрана —
  // чужая или устаревшая пиццерия в адресе там сбрасывается, и главная обязана
  // считать станции в той же области, что и заполнения.
  const feed = await buildFeedModel(view, locale, now);
  const { selection } = feed;

  const [network, tablets, checklists] = await Promise.all([
    listNetworkStations(now),
    listStationTablets(),
    listChecklists({
      countryId: selection.countryId,
      storeId: selection.storeId,
      stationId: selection.stationId,
    }),
  ]);

  const stations = inScope(mergeStations(network, tablets), scopeOf(selection));

  return {
    feed,
    stations,
    stores: summarizeStores(stations),
    isStoreLevel: selection.storeId !== null || selection.stationId !== null,
    working: countWorking(stations),
    gaps: countGapsOf(stations),
    drafts: checklists.filter((row) => row.hasUnpublishedChanges).length,
  };
}
