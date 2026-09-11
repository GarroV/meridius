"use client";

import type { ReactElement } from "react";

import type { FeedSelection } from "../model";
import { FEED_PERIODS } from "../period";
import {
  COUNTRY_PARAM,
  PERIOD_PARAM,
  STATION_PARAM,
  STORE_PARAM,
} from "../view";

/**
 * Четыре списка фильтра. Клиентские они по одной причине: на эталоне нет кнопки
 * «Показать» — список применяется в момент выбора. Форма при этом остаётся обычной
 * GET-формой, поэтому с выключенным JavaScript экран не ломается: там показывается
 * кнопка отправки из `<noscript>` (её рисует `FeedFilters`).
 *
 * Тексты приходят пропами, а не через `useTranslations`: провайдера next-intl на
 * клиенте в проекте нет (так же устроена форма входа `src/blocks/auth/ui/LoginForm.tsx`).
 */

const FIELD_CLASS = "flex min-w-[150px] flex-col gap-[var(--space-3)]";
const LABEL_CLASS =
  "text-[length:var(--fs-micro)] leading-[var(--lh-micro)] font-semibold tracking-[var(--tracking-micro)] text-[var(--ink-3)] uppercase";
const SELECT_CLASS =
  "bg-surface text-ink h-[var(--control-h)] w-full rounded-[var(--r-control)] border border-[var(--line-control)] pr-[var(--space-8)] pl-[var(--space-5)] text-[length:var(--fs-lead)] focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--focus-soft)] focus:outline-none";

/** Стрелка списка из эталона (`.select` в docs/forge/design/app.css). */
const SELECT_ARROW = {
  appearance: "none",
  backgroundImage:
    "linear-gradient(45deg, transparent 50%, var(--ink-3) 50%), linear-gradient(135deg, var(--ink-3) 50%, transparent 50%)",
  backgroundPosition: "calc(100% - 14px) 13px, calc(100% - 9px) 13px",
  backgroundSize: "5px 5px, 5px 5px",
  backgroundRepeat: "no-repeat",
} as const;

interface FilterLabels {
  readonly country: string;
  readonly store: string;
  readonly station: string;
  readonly period: string;
  readonly all: string;
  readonly periodToday: string;
  readonly periodWeek: string;
  readonly periodMonth: string;
}

interface FeedFilterSelectsProps {
  readonly selection: FeedSelection;
  readonly labels: FilterLabels;
}

function applyOnChange(event: { currentTarget: HTMLSelectElement }): void {
  event.currentTarget.form?.requestSubmit();
}

interface FilterFieldProps {
  readonly name: string;
  readonly label: string;
  readonly value: string;
  readonly allLabel: string;
  readonly options: readonly { readonly id: string; readonly name: string }[];
}

function FilterField({
  name,
  label,
  value,
  allLabel,
  options,
}: FilterFieldProps): ReactElement {
  return (
    <div className={FIELD_CLASS}>
      <label className={LABEL_CLASS} htmlFor={`feed-filter-${name}`}>
        {label}
      </label>
      <select
        // Ключ по выбранному значению перемонтирует список, когда его меняет сервер.
        // Список неуправляемый (defaultValue), а «Сбросить» — клиентский переход без
        // перезагрузки: без ключа поле показывало бы снятый фильтр как выбранный (T088).
        key={value}
        id={`feed-filter-${name}`}
        name={name}
        defaultValue={value}
        onChange={applyOnChange}
        className={SELECT_CLASS}
        style={SELECT_ARROW}
      >
        <option value="">{allLabel}</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
    </div>
  );
}

export function FeedFilterSelects({
  selection,
  labels,
}: FeedFilterSelectsProps): ReactElement {
  const periodLabels: Record<string, string> = {
    today: labels.periodToday,
    week: labels.periodWeek,
    month: labels.periodMonth,
  };

  return (
    <>
      <FilterField
        name={COUNTRY_PARAM}
        label={labels.country}
        value={selection.countryId ?? ""}
        allLabel={labels.all}
        options={selection.countries}
      />
      <FilterField
        name={STORE_PARAM}
        label={labels.store}
        value={selection.storeId ?? ""}
        allLabel={labels.all}
        options={selection.stores}
      />
      <FilterField
        name={STATION_PARAM}
        label={labels.station}
        value={selection.stationId ?? ""}
        allLabel={labels.all}
        options={selection.stations}
      />

      <div className={FIELD_CLASS}>
        <label className={LABEL_CLASS} htmlFor="feed-filter-period">
          {labels.period}
        </label>
        <select
          key={selection.period}
          id="feed-filter-period"
          name={PERIOD_PARAM}
          defaultValue={selection.period}
          onChange={applyOnChange}
          className={SELECT_CLASS}
          style={SELECT_ARROW}
        >
          {FEED_PERIODS.map((period) => (
            <option key={period} value={period}>
              {periodLabels[period]}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}
