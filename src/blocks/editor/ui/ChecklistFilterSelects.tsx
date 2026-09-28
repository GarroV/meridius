"use client";

import type { ReactElement } from "react";

import { useLive } from "@/blocks/core/ui/use-live";

import { COUNTRY_PARAM, STATION_PARAM, STORE_PARAM } from "../filter";
import type { ChecklistFilterSelection, FilterOption } from "../filter-options";
import { SELECT_ARROW_SMALL } from "./select-style";

/**
 * Три списка фильтра (T075): страна, пиццерия, станция. С D162 они стоят в колонке
 * чек-листов, одной стопкой под поиском, и применяются в момент выбора — кнопки
 * «Показать» нет и на эталоне. Применение — вызов `onPick`: колонка сужает список у
 * себя и пишет выбор в адрес, не уводя со страницы (см. `ChecklistRail`). Без
 * JavaScript списки остаются полями обычной GET-формы колонки, и её отправляет кнопка
 * из `<noscript>`.
 *
 * Каждый список говорит `data-live="true"`, когда применение выбора действительно
 * включилось. До этого момента список в разметке, с правильными вариантами, принимает
 * выбор — и не делает ничего: обработчика ещё нет, событие `change` уходит в пустоту,
 * и перехода, которого ждёт следующий шаг, не будет никогда. Снаружи эти два состояния
 * неразличимы (T121, тот же класс, что T106 в ленте). Почему признак ставится эффектом
 * и почему он живёт в `@/blocks/core/ui/use-live` — там же в пояснении.
 */

const FIELD_CLASS = "flex flex-col gap-[var(--space-2)]";
const LABEL_CLASS =
  "text-[length:var(--fs-micro)] leading-[var(--lh-micro)] font-semibold tracking-[var(--tracking-micro)] text-[var(--ink-3)] uppercase";
// Высота малой кнопки: в колонке 18rem три полных поля съедали бы треть экрана до
// первой строки списка.
const SELECT_CLASS =
  "bg-surface text-ink h-[var(--control-h-sm)] w-full min-w-0 rounded-[var(--r-control)] border border-[var(--line-control)] pr-[var(--space-8)] pl-[var(--space-4)] text-[length:var(--fs-dense)] focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--focus-soft)] focus:outline-none";

interface ChecklistFilterLabels {
  readonly country: string;
  readonly store: string;
  readonly station: string;
  readonly all: string;
}

interface ChecklistFilterSelectsProps {
  readonly selection: ChecklistFilterSelection;
  readonly labels: ChecklistFilterLabels;
  /** Выбор в списке `name`; пустая строка — «Все». */
  readonly onPick: (name: string, value: string) => void;
}

interface FilterFieldProps {
  readonly name: string;
  readonly label: string;
  readonly value: string;
  readonly allLabel: string;
  readonly options: readonly FilterOption[];
  readonly live: boolean;
  readonly onPick: (name: string, value: string) => void;
}

function FilterField({
  name,
  label,
  value,
  allLabel,
  options,
  live,
  onPick,
}: FilterFieldProps): ReactElement {
  const fieldId = `checklist-filter-${name}`;

  return (
    <div className={FIELD_CLASS}>
      <label className={LABEL_CLASS} htmlFor={fieldId}>
        {label}
      </label>
      <select
        id={fieldId}
        name={name}
        value={value}
        onChange={(event) => {
          onPick(name, event.currentTarget.value);
        }}
        data-testid={fieldId}
        data-live={live ? "true" : undefined}
        className={SELECT_CLASS}
        style={SELECT_ARROW_SMALL}
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
  onPick,
}: ChecklistFilterSelectsProps): ReactElement {
  const live = useLive();
  const fields: [string, string, string | null, readonly FilterOption[]][] = [
    [
      COUNTRY_PARAM,
      labels.country,
      selection.filter.countryId,
      selection.countries,
    ],
    [STORE_PARAM, labels.store, selection.filter.storeId, selection.stores],
    [
      STATION_PARAM,
      labels.station,
      selection.filter.stationId,
      selection.stations,
    ],
  ];

  return (
    <>
      {fields.map(([name, label, value, options]) => (
        <FilterField
          key={name}
          live={live}
          name={name}
          label={label}
          value={value ?? ""}
          allLabel={labels.all}
          options={options}
          onPick={onPick}
        />
      ))}
    </>
  );
}
