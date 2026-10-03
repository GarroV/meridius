// Данные главной кабинета (D174). Своих запросов здесь нет: последние заполнения и
// тревоги — у ленты, цифры за период — агрегатом базы по правилу «Статистики»
// (`loadPeriodMetrics`), станции и их дырки — у раздела «Станции», планшеты — у
// блока `device`, черновики — у списка чек-листов. Главная только сводит их в одну
// область фильтра, поэтому её цифры не могут разойтись с разделами, куда она ведёт.
import { scopeOf, type Viewer } from "@/blocks/auth/scope";
import type { Locale } from "@/blocks/core/locale";
import { listStationTablets } from "@/blocks/device/station-tablets";
import { listChecklists } from "@/blocks/editor/listing";
import { checklistPath } from "@/blocks/editor/routes";
import type {
  FeedMetrics,
  FeedModel,
  FeedSelection,
} from "@/blocks/feed/model";
import { periodDayCount } from "@/blocks/feed/period";
import { loadPeriodMetrics } from "@/blocks/feed/period-metrics";
import { buildFeedModel } from "@/blocks/feed/ui/build-model";
import { pickText } from "@/blocks/feed/text";
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

/** Сколько чек-листов показать строками; остальные — ссылкой в раздел. */
const CHECKLISTS_SHOWN = 8;

/** Чек-лист строкой «Моих чек-листов» (D148). */
export interface HomeChecklist {
  readonly id: string;
  readonly href: string;
  readonly title: string;
  /** «Страна · пиццерия · станция»; null — чек-лист ни на какой станции не висит. */
  readonly place: string | null;
  readonly publishedNumber: number | null;
  readonly hasUnpublishedChanges: boolean;
}

export interface HomeModel {
  readonly feed: FeedModel;
  /**
   * Цифры за период — по всем заполнениям области, а не по строкам ленты: лента
   * обрезана на 200, и счёт по ней молча занижал бы главную.
   */
  readonly metrics: FeedMetrics;
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
  /** Первые чек-листы вошедшего в области; всего их `checklistTotal`. */
  readonly checklists: readonly HomeChecklist[];
  readonly checklistTotal: number;
  /** Область сужена фильтром страны, пиццерии или станции. */
  readonly isFiltered: boolean;
}

function joinPlace(parts: readonly (string | null)[]): string | null {
  const present = parts.filter((part): part is string => part !== null);
  return present.length === 0 ? null : present.join(" · ");
}

function selectionScope(selection: FeedSelection): HomeScope {
  return {
    ...(selection.countryId === null ? {} : { countryId: selection.countryId }),
    ...(selection.storeId === null ? {} : { storeId: selection.storeId }),
    ...(selection.stationId === null ? {} : { stationId: selection.stationId }),
  };
}

export async function loadHome(
  view: FeedView,
  locale: Locale,
  viewer: Viewer,
  now: Date = new Date(),
): Promise<HomeModel> {
  // Лента первой и отдельно: только она знает, какая область на самом деле выбрана —
  // чужая или устаревшая пиццерия в адресе там сбрасывается, и главная обязана
  // считать станции в той же области, что и заполнения.
  const feed = await buildFeedModel(view, locale, viewer, now);
  const { selection } = feed;

  // Область видимости вошедшего (D145) — та же, что у разделов: партнёр видит станции и
  // чек-листы своих стран, УК — всю сеть.
  const visible = scopeOf(viewer);
  const scope = selectionScope(selection);
  const [metrics, network, tablets, checklists] = await Promise.all([
    loadPeriodMetrics(
      { visible, ...scope },
      periodDayCount(selection.period),
      now,
      feed.timeZone,
    ),
    listNetworkStations(visible, now),
    listStationTablets(visible),
    listChecklists(
      {
        countryId: selection.countryId,
        storeId: selection.storeId,
        stationId: selection.stationId,
      },
      viewer,
    ),
  ]);

  const stations = inScope(mergeStations(network, tablets), scope);

  return {
    feed,
    metrics,
    stations,
    stores: summarizeStores(stations),
    isStoreLevel: selection.storeId !== null || selection.stationId !== null,
    working: countWorking(stations),
    gaps: countGapsOf(stations),
    drafts: checklists.filter((row) => row.hasUnpublishedChanges).length,
    checklists: checklists.slice(0, CHECKLISTS_SHOWN).map((row) => ({
      id: row.id,
      href: checklistPath(row.id),
      title: pickText(row.title, locale),
      place: joinPlace([row.countryName, row.storeName, row.stationName]),
      publishedNumber: row.publishedNumber,
      hasUnpublishedChanges: row.hasUnpublishedChanges,
    })),
    checklistTotal: checklists.length,
    isFiltered:
      selection.countryId !== null ||
      selection.storeId !== null ||
      selection.stationId !== null,
  };
}
