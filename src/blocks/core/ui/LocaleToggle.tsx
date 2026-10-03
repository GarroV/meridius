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
 * Вид — капсула языка ядра (`.sidenav__lang > .langpill`, forma), та же, что у DECIMUS
 * (T352, #159), и парная капсуле темы рядом: выбранный язык залит мягким акцентом.
 *
 * Язык экрана заполнения этим не трогается — его задаёт пиццерия (D122). Переключатель
 * стоит только в кабинете и меняет язык только кабинета.
 */
export function LocaleToggle({
  current,
  label,
  testIdPrefix = "",
}: {
  readonly current: Locale;
  readonly label: string;
  /** Приставка тестовых идентификаторов: переключатель стоит и в панели, и в полосе телефона. */
  readonly testIdPrefix?: string;
}): ReactElement {
  return (
    <div className="sidenav__lang">
      {/*
        `role="group"`, а не `radiogroup`: каждое положение — обычная кнопка отправки, и
        чтец называет её нажатой через `aria-pressed`.
      */}
      <form
        action={chooseLocale}
        className="langpill"
        role="group"
        aria-label={label}
        data-testid={`${testIdPrefix}locale-toggle`}
      >
        {LOCALES.map((code) => (
          <button
            key={code}
            type="submit"
            name="locale"
            value={code}
            lang={code}
            className="langpill__item"
            data-testid={`${testIdPrefix}locale-${code}`}
            aria-pressed={code === current}
            aria-label={LOCALE_NAMES[code]}
            title={LOCALE_NAMES[code]}
          >
            {code}
          </button>
        ))}
      </form>
    </div>
  );
}
