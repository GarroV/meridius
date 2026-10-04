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
import type { DayRange, PeriodAsk } from "../period";
import type { FeedScope } from "../scope";
import { resolveSelection, screenTimeZone } from "../selection";
import { loadSummariesBy, summaryOf } from "../stats-breakdown";
import { storeStatsHref } from "../stats-view";
import { countToday, todayStatusOf } from "../today-status";
import { listLiveChecklists, type LiveChecklist } from "../today-windows";
import { buildStatsModel } from "./build-stats-model";

export interface CountryView {
  readonly countryId?: string | undefined;
  readonly period?: PeriodAsk | undefined;
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
  readonly period: DayRange;
  readonly now: Date;
}

function tileOf(store: FilterOption, sources: TileSources): StoreTile {
  const summary = summaryOf(sources.summaries, store.id);
  return {
    storeId: store.id,
    name: store.name,
    href: storeStatsHref(store.id, { period: sources.period }),
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
    view.countryId === undefined ? {} : { countryId: view.countryId },
    catalog,
    now,
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
  };
  if (countryId === null) {
    return {
      ...base,
      period: asked.period,
      periodNav: asked.periodNav,
      summary: null,
      stores: [],
      capped: false,
      unknownTimezoneStores: 0,
    };
  }

  const scope: FeedScope = { visible, countryId };
  // Период разбирается в поясе страны, а не в поясе всей видимой сети: «текущий месяц»
  // и стрелки — по тем суткам, что показывают плитки.
  const countrySelection = resolveSelection(
    {
      countryId,
      ...(view.period === undefined ? {} : { period: view.period }),
    },
    catalog,
    now,
  );
  const { period, periodNav } = countrySelection;
  // Пояс тот же, по которому считает сводка страны (`buildStatsModel`): плитки обязаны
  // складываться в её число.
  const timeZone = screenTimeZone(countrySelection);
  const [summary, live, alarms, summaries] = await Promise.all([
    buildStatsModel(
      { countryId, period: { kind: "range", range: period } },
      locale,
      viewer,
      now,
    ),
    listLiveChecklists(scope, now),
    listAlarms(scope, now),
    loadSummariesBy("store", scope, period, now, timeZone),
  ]);
  const sources: TileSources = {
    live: live.rows,
    alarms: alarms.alarms,
    summaries,
    period,
    now,
  };
  const stores = countrySelection.stores;

  return {
    ...base,
    period,
    periodNav,
    summary,
    stores: stores.map((store) => tileOf(store, sources)),
    capped: live.capped || alarms.capped,
    unknownTimezoneStores: alarms.unknownTimezoneStores,
  };
}
