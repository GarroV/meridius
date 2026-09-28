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
 * выглядели как две разные вещи: подпись слева, выбранное — мягкой заливкой (D164).
 *
 * Язык экрана заполнения этим не трогается — его задаёт пиццерия (D122). Переключатель
 * стоит только в кабинете и меняет язык только кабинета.
 */
// Компактно, как переключатель темы над ним: код языка моноширинным, текущий — мягкой
// заливкой. Полное название языка — в подсказке и для чтеца.
const OPTION_BASE_CLASS =
  "grid h-7 min-w-7 cursor-pointer place-items-center rounded-[7px] border-0 px-[var(--space-3)] font-mono text-[11px] font-medium uppercase";
const OPTION_CLASS = `${OPTION_BASE_CLASS} bg-transparent text-[var(--ink-3)] hover:bg-surface hover:text-ink`;
const OPTION_SELECTED_CLASS = `${OPTION_BASE_CLASS} bg-[var(--accent-soft)] text-accent`;

export function LocaleToggle({
  current,
  label,
}: {
  readonly current: Locale;
  readonly label: string;
}): ReactElement {
  return (
    <form action={chooseLocale} data-testid="locale-toggle">
      {/*
        `role="group"`, а не `radiogroup`: стрелками между положениями здесь не ходят,
        каждое положение — обычная кнопка отправки, и чтец называет её нажатой через
        `aria-pressed`.
      */}
      <div role="group" aria-label={label} className="sidenav__theme">
        <span className="sidenav__theme-label">{label}</span>
        {LOCALES.map((code) => (
          <button
            key={code}
            type="submit"
            name="locale"
            value={code}
            lang={code}
            data-testid={`locale-${code}`}
            aria-pressed={code === current}
            aria-label={LOCALE_NAMES[code]}
            title={LOCALE_NAMES[code]}
            className={code === current ? OPTION_SELECTED_CLASS : OPTION_CLASS}
          >
            {code}
          </button>
        ))}
      </div>
    </form>
  );
}
