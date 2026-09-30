"use client";

import type { ReactElement } from "react";

import { useLive } from "@/blocks/core/ui/use-live";

import type { StatsSelection } from "../stats-model";
import { DAYS_PARAM, STATS_PERIOD_DAYS } from "../stats-view";
import { COUNTRY_PARAM, STORE_PARAM } from "../view";
import { FilterField } from "./FeedFilterSelects";

/**
 * Три списка статистики: страна, пиццерия, период. Поля те же, что у ленты
 * (`FeedFilterSelects`): выбор применяется сразу, без JavaScript форма остаётся
 * обычной GET-формой. Станции нет сознательно — D150 просит страну и пиццерию.
 */
interface StatsFilterLabels {
  readonly country: string;
  readonly store: string;
  readonly period: string;
  readonly all: string;
  readonly days: Readonly<Record<string, string>>;
}

export function StatsFilterSelects({
  selection,
  labels,
}: {
  readonly selection: StatsSelection;
  readonly labels: StatsFilterLabels;
}): ReactElement {
  const live = useLive();

  return (
    <>
      <FilterField
        live={live}
        name={COUNTRY_PARAM}
        label={labels.country}
        value={selection.countryId ?? ""}
        allLabel={labels.all}
        options={selection.countries}
      />
      <FilterField
        live={live}
        name={STORE_PARAM}
        label={labels.store}
        value={selection.storeId ?? ""}
        allLabel={labels.all}
        options={selection.stores}
      />
      <FilterField
        live={live}
        name={DAYS_PARAM}
        label={labels.period}
        value={String(selection.days)}
        options={STATS_PERIOD_DAYS.map((days) => ({
          id: String(days),
          name: labels.days[String(days)] ?? String(days),
        }))}
      />
    </>
  );
}
