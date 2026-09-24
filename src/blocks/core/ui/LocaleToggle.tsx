import type { ReactElement } from "react";

import { LOCALE_NAMES, LOCALES, type Locale } from "../locale";
import { chooseLocale } from "./locale-action";

/**
 * Переключатель языка кабинета (#161).
 *
 * Обычная форма с кнопкой на язык, а не клиентский компонент с состоянием. Причина та
 * же, по которой меню рядом не стало выезжающей шторкой: кабинет отрисовывается на
 * сервере, язык решается там же, и переключателю нечего держать в состоянии — он
 * сообщает выбор и получает перерисованную страницу. Заодно он работает без JavaScript.
 *
 * Вид взят у переключателя темы, чтобы два переключателя в одном подвале меню не
 * выглядели как две разные вещи: дорожка `--seg-track`, выбранное положение поднято
 * поверхностью и тенью.
 *
 * Язык экрана заполнения этим не трогается — его задаёт пиццерия (D122). Переключатель
 * стоит только в кабинете и меняет язык только кабинета.
 */
const LABEL_CLASS =
  "px-[var(--space-7)] pb-[var(--space-3)] text-[length:var(--fs-micro)] leading-[var(--lh-micro)] font-semibold tracking-[var(--tracking-micro)] text-[var(--ink-3)] uppercase max-md:hidden";
const TRACK_CLASS =
  "mx-[var(--space-7)] mb-[var(--space-4)] flex gap-[var(--space-1)] rounded-[var(--r-control)] bg-[var(--seg-track)] p-[var(--space-1)] max-md:mx-[var(--space-5)] max-md:mb-0";
const OPTION_BASE_CLASS =
  "flex min-h-[var(--control-h-sm)] flex-1 cursor-pointer items-center justify-center rounded-[var(--r-mark)] border-0 px-[var(--space-4)] text-[length:var(--fs-meta)] whitespace-nowrap focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";
const OPTION_CLASS = `${OPTION_BASE_CLASS} bg-transparent text-[var(--ink-2)] hover:text-[var(--ink)]`;
const OPTION_SELECTED_CLASS = `${OPTION_BASE_CLASS} bg-surface text-ink font-medium shadow-[var(--sh-xs)]`;

export function LocaleToggle({
  current,
  label,
}: {
  readonly current: Locale;
  readonly label: string;
}): ReactElement {
  return (
    <form action={chooseLocale} data-testid="locale-toggle">
      <div className={LABEL_CLASS}>{label}</div>
      {/*
        `role="group"`, а не `radiogroup`: стрелками между положениями здесь не ходят,
        каждое положение — обычная кнопка отправки, и чтец называет её нажатой через
        `aria-pressed`.
      */}
      <div role="group" aria-label={label} className={TRACK_CLASS}>
        {LOCALES.map((code) => (
          <button
            key={code}
            type="submit"
            name="locale"
            value={code}
            lang={code}
            data-testid={`locale-${code}`}
            aria-pressed={code === current}
            className={code === current ? OPTION_SELECTED_CLASS : OPTION_CLASS}
          >
            {LOCALE_NAMES[code]}
          </button>
        ))}
      </div>
    </form>
  );
}
