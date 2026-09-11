"use client";

import type { ReactElement } from "react";

import { COUNTRY_PARAM, STATION_PARAM, STORE_PARAM } from "../filter";
import type { ChecklistFilterSelection, FilterOption } from "../filter-options";
import { SELECT_ARROW } from "./select-style";

/**
 * Три списка фильтра (эталон `docs/furca/design/screens/templates.html`, строки 48–57):
 * страна, пиццерия, станция. Применяются в момент выбора — на эталоне нет кнопки
 * «Показать», поэтому список сам отправляет форму. Форма при этом остаётся обычной
 * GET-формой: с выключенным JavaScript список сам не применится, и тогда нужна
 * кнопка из `<noscript>` (её рисует `ChecklistFilters`).
 *
 * Тексты приходят пропами, а не через `useTranslations`: провайдера next-intl на
 * клиенте в проекте нет — так же устроены фильтры ленты
 * (`src/blocks/feed/ui/FeedFilterSelects.tsx`). Импортировать оттуда нельзя: границы
 * модулей запрещают `editor` зависеть от `feed` (`.dependency-cruiser.cjs`), поэтому
 * классы скопированы, а не переиспользованы. Стрелка списка — не дублируется: она
 * уже есть в editor (`./select-style`).
 */

const FIELD_BASE_CLASS = "flex flex-col gap-[var(--space-3)]";
const LABEL_CLASS =
  "text-[length:var(--fs-micro)] leading-[var(--lh-micro)] font-semibold tracking-[var(--tracking-micro)] text-[var(--ink-3)] uppercase";
const SELECT_CLASS =
  "bg-surface text-ink h-[var(--control-h)] w-full rounded-[var(--r-control)] border border-[var(--line-control)] pr-[var(--space-8)] pl-[var(--space-5)] text-[length:var(--fs-lead)] focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--focus-soft)] focus:outline-none";

interface ChecklistFilterLabels {
  readonly country: string;
  readonly store: string;
  readonly station: string;
  readonly all: string;
}

interface ChecklistFilterSelectsProps {
  readonly selection: ChecklistFilterSelection;
  readonly labels: ChecklistFilterLabels;
}

function applyOnChange(event: { currentTarget: HTMLSelectElement }): void {
  event.currentTarget.form?.requestSubmit();
}

interface FilterFieldProps {
  readonly name: string;
  readonly label: string;
  readonly value: string;
  readonly allLabel: string;
  readonly widthClass: string;
  readonly options: readonly FilterOption[];
}

function FilterField({
  name,
  label,
  value,
  allLabel,
  widthClass,
  options,
}: FilterFieldProps): ReactElement {
  const fieldId = `checklist-filter-${name}`;

  return (
    <div className={`${FIELD_BASE_CLASS} ${widthClass}`}>
      <label className={LABEL_CLASS} htmlFor={fieldId}>
        {label}
      </label>
      <select
        id={fieldId}
        name={name}
        defaultValue={value}
        onChange={applyOnChange}
        data-testid={fieldId}
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

export function ChecklistFilterSelects({
  selection,
  labels,
}: ChecklistFilterSelectsProps): ReactElement {
  return (
    <>
      <FilterField
        name={COUNTRY_PARAM}
        label={labels.country}
        value={selection.filter.countryId ?? ""}
        allLabel={labels.all}
        widthClass="min-w-[180px]"
        options={selection.countries}
      />
      <FilterField
        name={STORE_PARAM}
        label={labels.store}
        value={selection.filter.storeId ?? ""}
        allLabel={labels.all}
        widthClass="min-w-[220px]"
        options={selection.stores}
      />
      <FilterField
        name={STATION_PARAM}
        label={labels.station}
        value={selection.filter.stationId ?? ""}
        allLabel={labels.all}
        // Верхний предел, которого нет у соседей: пока пиццерия не выбрана, станции в
        // списке названы путём («Алматы, Абая 44 · Кухня»), и браузер тянет ширину поля
        // по самой длинной строке — оно становилось шире «Пиццерии», а на эталоне оно
        // самое узкое. Читаемости это не стоит ничего: в закрытом поле стоит либо «Все»,
        // либо название уже без пути (выбранная станция подставляет свою пиццерию),
        // а полные названия видны в раскрытом списке.
        widthClass="min-w-[160px] max-w-[240px]"
        options={selection.stations}
      />
    </>
  );
}
