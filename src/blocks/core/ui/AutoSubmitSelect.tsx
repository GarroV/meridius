"use client";

import type { ChangeEvent, ReactElement, ReactNode } from "react";

/**
 * Список, который применяется сразу: выбрал — форма ушла, кнопки «Показать» нет.
 * Форма остаётся обычной GET-формой, так что выбор живёт в адресе; без JavaScript
 * вызывающий экран кладёт рядом `<noscript>` с кнопкой.
 */

const SELECT_CLASS =
  "bg-surface text-ink min-h-[var(--tap-min)] rounded-[var(--r-control)] border border-[var(--line-control)] px-[var(--space-5)]";

export interface AutoSubmitSelectProps {
  readonly name: string;
  readonly defaultValue: string | undefined;
  readonly children: ReactNode;
}

function submitForm(event: ChangeEvent<HTMLSelectElement>): void {
  event.currentTarget.form?.requestSubmit();
}

export function AutoSubmitSelect({
  name,
  defaultValue,
  children,
}: AutoSubmitSelectProps): ReactElement {
  return (
    <select
      name={name}
      defaultValue={defaultValue}
      className={SELECT_CLASS}
      onChange={submitForm}
    >
      {children}
    </select>
  );
}
