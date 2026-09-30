import type { ReactElement } from "react";

import { LOCALE_NAMES, LOCALES, type Locale } from "../locale";
import { chooseLocale } from "./locale-action";
import { SEG_CLASS, segOptionClass } from "./seg-option";

/**
 * Переключатель языка кабинета (#161).
 *
 * Обычная форма с кнопкой на язык, а не клиентский компонент с состоянием. Причина та
 * же, по которой меню рядом не стало выезжающей шторкой: кабинет отрисовывается на
 * сервере, язык решается там же, и переключателю нечего держать в состоянии — он
 * сообщает выбор и получает перерисованную страницу. Заодно он работает без JavaScript.
 *
 * Вид взят у переключателя темы, чтобы два переключателя в одной строке подвала меню не
 * выглядели как две разные вещи: пилюля `.seg`, выбранное — белой плашкой (D164).
 *
 * Язык экрана заполнения этим не трогается — его задаёт пиццерия (D122). Переключатель
 * стоит только в кабинете и меняет язык только кабинета.
 */
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
      <div role="group" aria-label={label} className={SEG_CLASS}>
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
            className={`${segOptionClass(code === current)} font-mono text-[11px] uppercase`}
          >
            {code}
          </button>
        ))}
      </div>
    </form>
  );
}
