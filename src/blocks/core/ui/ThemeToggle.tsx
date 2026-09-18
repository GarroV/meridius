"use client";

import type { ReactElement } from "react";

import { THEME_CHOICES, type ThemeChoice } from "../theme";
import { useThemeChoice } from "./ThemeProvider";

/**
 * Переключатель темы (D106). Три положения, а не два: «Авто» — это не третья тема, а
 * возврат к системной настройке, и без него выбор был бы дорогой в один конец.
 *
 * Вид взят у дорожки переключателя из дизайн-системы (`--seg-track`): выбранное
 * положение поднимается поверхностью и тенью, остальные остаются на дорожке.
 *
 * Слова приходят готовыми от меню (`AdminNav`), а не из клиентского словаря (T254).
 * Клиентский словарь — это ближайший `NextIntlClientProvider`, и вложенный провайдер
 * ЗАМЕНЯЕТ его разделы, а не дополняет: редактор оборачивает свой экран вместе с меню в
 * провайдер с одним разделом `editor`, и переключатель там рисовал сырые ключи
 * `admin.theme.*`, а сервер печатал `MISSING_MESSAGE: admin`. Меню же переводит свои
 * подписи на сервере, где словарь целиком, — туда же ушли и слова переключателя.
 */
const LABEL_CLASS =
  "px-[var(--space-7)] pb-[var(--space-3)] text-[length:var(--fs-micro)] leading-[var(--lh-micro)] font-semibold tracking-[var(--tracking-micro)] text-[var(--ink-3)] uppercase max-md:hidden";
const TRACK_CLASS =
  "mx-[var(--space-7)] flex gap-[var(--space-1)] rounded-[var(--r-control)] bg-[var(--seg-track)] p-[var(--space-1)] max-md:mx-[var(--space-5)]";
const OPTION_BASE_CLASS =
  "flex min-h-[var(--control-h-sm)] flex-1 cursor-pointer items-center justify-center rounded-[var(--r-mark)] border-0 px-[var(--space-4)] text-[length:var(--fs-meta)] whitespace-nowrap focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";
const OPTION_CLASS = `${OPTION_BASE_CLASS} bg-transparent text-[var(--ink-2)] hover:text-[var(--ink)]`;
const OPTION_SELECTED_CLASS = `${OPTION_BASE_CLASS} bg-surface text-ink font-medium shadow-[var(--sh-xs)]`;

/** Подписи переключателя: заголовок и по слову на каждое положение. */
export type ThemeToggleLabels = Readonly<Record<"label" | ThemeChoice, string>>;

export function ThemeToggle({
  labels,
}: {
  readonly labels: ThemeToggleLabels;
}): ReactElement {
  const { choice, choose } = useThemeChoice();

  return (
    <div data-testid="theme-toggle">
      <div className={LABEL_CLASS}>{labels.label}</div>
      {/*
        `role="group"`, а не `radiogroup`: стрелками между положениями здесь не ходят,
        каждое положение — обычная кнопка, и чтец называет её нажатой через
        `aria-pressed`. Обещать клавиатурное поведение, которого нет, хуже, чем не
        обещать его вовсе.
      */}
      <div role="group" aria-label={labels.label} className={TRACK_CLASS}>
        {THEME_CHOICES.map((option) => (
          <button
            key={option}
            type="button"
            data-testid={`theme-${option}`}
            aria-pressed={option === choice}
            className={option === choice ? OPTION_SELECTED_CLASS : OPTION_CLASS}
            onClick={() => {
              choose(option);
            }}
          >
            {labels[option]}
          </button>
        ))}
      </div>
    </div>
  );
}
