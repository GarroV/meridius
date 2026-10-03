// Сборка экрана страны (D179): адрес → область видимости → страны → плитки пиццерий.
//
// Своих расчётов здесь нет: статус на сегодня — `today-status.ts` по проходам из
// `today-windows.ts`, тревоги — `alarms.ts`, цифры за период — `stats-breakdown.ts`,
// сводка страны — та же `buildStatsModel`, что у экрана пиццерии. Плитка только сводит
// их по пиццерии, поэтому не может разойтись с экраном, куда ведёт.
import type { Locale } from "@/blocks/core/locale";
import { scopeOf as scopeOfViewer, type Viewer } from "@/blocks/auth/scope";

import { listAlarms, type Alarm } from "../alarms";
import type {
  CountryRow,
  CountryStatsModel,
  StoreTile,
} from "../country-model";
import type { FilterOption } from "../model";
import { loadFeedCatalog, type FeedCatalog } from "../options";
import { DEFAULT_PERIOD } from "../period";
import type { FeedScope } from "../scope";
import { resolveSelection, screenTimeZone } from "../selection";
import { loadSummariesBy, summaryOf } from "../stats-breakdown";
import { storeStatsHref, type StatsPeriodDays } from "../stats-view";
import { countToday, todayStatusOf } from "../today-status";
import { listLiveChecklists, type LiveChecklist } from "../today-windows";
import { buildStatsModel } from "./build-stats-model";

export interface CountryView {
  readonly countryId?: string | undefined;
  readonly days: StatsPeriodDays;
}

function countryRows(
  countries: readonly FilterOption[],
  catalog: FeedCatalog,
): CountryRow[] {
  return countries.map((country) => ({
    id: country.id,
    name: country.name,
    storeCount: catalog.stores.filter((store) => store.countryId === country.id)
      .length,
  }));
}

interface TileSources {
  readonly live: readonly LiveChecklist[];
  readonly alarms: readonly Alarm[];
  readonly summaries: Awaited<ReturnType<typeof loadSummariesBy>>;
  readonly days: StatsPeriodDays;
  readonly now: Date;
}

function tileOf(store: FilterOption, sources: TileSources): StoreTile {
  const summary = summaryOf(sources.summaries, store.id);
  return {
    storeId: store.id,
    name: store.name,
    href: storeStatsHref(store.id, { days: sources.days }),
    today: countToday(
      sources.live
        .filter((row) => row.storeId === store.id)
        .map((row) => todayStatusOf(row.day, sources.now)),
    ),
    alarmCount: sources.alarms.filter((alarm) => alarm.storeId === store.id)
      .length,
    submissionCount: summary.submissionCount,
    criticalFailedCount: summary.criticalFailedCount,
  };
}

/**
 * Модель экрана страны. `now` приходит параметром: статус на сегодня и границы периода
 * иначе не проверить, не подменяя часы.
 */
export async function buildCountryModel(
  view: CountryView,
  locale: Locale,
  viewer: Viewer,
  now: Date = new Date(),
): Promise<CountryStatsModel> {
  const visible = scopeOfViewer(viewer);
  const catalog = await loadFeedCatalog(visible);
  const asked = resolveSelection(
    {
      period: DEFAULT_PERIOD,
      ...(view.countryId === undefined ? {} : { countryId: view.countryId }),
    },
    catalog,
  );
  // Чужая или несуществующая страна в адресе отбрасывается — как в ленте (D145), и
  // тогда открывается первая из своих.
  const countryId = asked.countryId ?? asked.countries[0]?.id ?? null;
  const countries = countryRows(asked.countries, catalog);
  const base = {
    countries,
    countryId,
    countryName: countries.find((row) => row.id === countryId)?.name ?? null,
    isExplicit: asked.countryId !== null,
    days: view.days,
  };
  if (countryId === null) {
    return {
      ...base,
      summary: null,
      stores: [],
      capped: false,
      unknownTimezoneStores: 0,
    };
  }

  const scope: FeedScope = { visible, countryId };
  const countrySelection = resolveSelection(
    { period: DEFAULT_PERIOD, countryId },
    catalog,
  );
  // Пояс тот же, по которому считает сводка страны (`buildStatsModel`): плитки обязаны
  // складываться в её число.
  const timeZone = screenTimeZone(countrySelection);
  const [summary, live, alarms, summaries] = await Promise.all([
    buildStatsModel({ countryId, days: view.days }, locale, viewer, now),
    listLiveChecklists(scope, now),
    listAlarms(scope, now),
    loadSummariesBy("store", scope, view.days, now, timeZone),
  ]);
  const sources: TileSources = {
    live: live.rows,
    alarms: alarms.alarms,
    summaries,
    days: view.days,
    now,
  };
  const stores = countrySelection.stores;

  return {
    ...base,
    summary,
    stores: stores.map((store) => tileOf(store, sources)),
    capped: live.capped || alarms.capped,
    unknownTimezoneStores: alarms.unknownTimezoneStores,
  };
}
