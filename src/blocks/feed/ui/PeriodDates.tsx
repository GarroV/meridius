"use client";

import type { ChangeEvent, MouseEvent, ReactElement } from "react";

import { FROM_PARAM, TO_PARAM } from "../view";

/**
 * Две даты периода: видимый текст по языку интерфейса («Nov 1, 2026») и прозрачное
 * нативное поле поверх него. Нативный `input[type=date]` пишет дату в локали браузера
 * («01. 11. 2026.» в английском кабинете), и один и тот же день выглядел на соседних
 * экранах по-разному (#243). Календарь остаётся браузерным, но человек читает дату
 * так, как её пишет вся остальная страница.
 *
 * Применяется сразу, без кнопки «Показать»: выбрал дату — форма ушла. Без JavaScript
 * остаётся обычная GET-форма с кнопкой в `<noscript>` (рядом, в `PeriodPicker`).
 */

const FORM_CLASS = "flex flex-nowrap items-center gap-[var(--space-3)]";
const CHIP_CLASS =
  "bg-surface text-ink relative inline-flex h-[var(--tap-min)] min-w-0 cursor-pointer items-center justify-center rounded-[var(--r-control)] border border-[var(--line-control)] px-[var(--space-5)] text-[length:var(--fs-body)] whitespace-nowrap [font-variant-numeric:tabular-nums] focus-within:border-[var(--accent)] focus-within:shadow-[0_0_0_3px_var(--focus-soft)] hover:border-[var(--line-control-2)] hover:bg-[var(--surface-2)] sm:h-[var(--control-h)]";
const INPUT_CLASS =
  "absolute inset-0 h-full w-full cursor-pointer opacity-0 focus:outline-none";
const LABEL_CLASS = "sr-only";
const DASH_CLASS = "text-[var(--ink-3)]";

export interface PeriodDatesProps {
  readonly formId: string;
  readonly action: string;
  readonly hidden: Readonly<Record<string, string>>;
  readonly from: string;
  readonly to: string;
  readonly fromText: string;
  readonly toText: string;
  readonly fromLabel: string;
  readonly toLabel: string;
}

function submitForm(event: ChangeEvent<HTMLInputElement>): void {
  // Недописанная дата (поле `required` пустое) форму не отправит — это и нужно.
  event.currentTarget.form?.requestSubmit();
}

function openCalendar(event: MouseEvent<HTMLInputElement>): void {
  // Прозрачное поле перекрывает весь текст: календарь открывает любое нажатие, а не
  // только крошечный значок, которого под прозрачностью не видно.
  try {
    event.currentTarget.showPicker();
  } catch {
    // Браузер без `showPicker` или поле не принимает показ — остаётся родное поведение.
  }
}

export function PeriodDates({
  formId,
  action,
  hidden,
  from,
  to,
  fromText,
  toText,
  fromLabel,
  toLabel,
}: PeriodDatesProps): ReactElement {
  return (
    <form
      id={formId}
      method="get"
      action={action}
      className={FORM_CLASS}
      data-testid="period-form"
    >
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <label className={CHIP_CLASS}>
        <span className={LABEL_CLASS}>{fromLabel}</span>
        <span aria-hidden="true">{fromText}</span>
        <input
          key={`from-${from}`}
          id="period-from"
          type="date"
          name={FROM_PARAM}
          defaultValue={from}
          required
          className={INPUT_CLASS}
          data-testid="period-from"
          onChange={submitForm}
          onClick={openCalendar}
        />
      </label>
      <span className={DASH_CLASS} aria-hidden="true">
        —
      </span>
      <label className={CHIP_CLASS}>
        <span className={LABEL_CLASS}>{toLabel}</span>
        <span aria-hidden="true">{toText}</span>
        <input
          key={`to-${to}`}
          id="period-to"
          type="date"
          name={TO_PARAM}
          defaultValue={to}
          required
          className={INPUT_CLASS}
          data-testid="period-to"
          onChange={submitForm}
          onClick={openCalendar}
        />
      </label>
    </form>
  );
}
