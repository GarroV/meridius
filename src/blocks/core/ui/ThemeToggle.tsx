"use client";

import { type KeyboardEvent, type ReactElement, useRef } from "react";

import { THEME_CHOICES, type ThemeChoice } from "../theme";
import { Icon, type IconName } from "./Icon";
import { useThemeChoice } from "./ThemeProvider";

/**
 * Переключатель темы (D106). Три положения, а не два: «Авто» — это не третья тема, а
 * возврат к системной настройке, и без него выбор был бы дорогой в один конец.
 *
 * Вид — капсула темы ядра (`.sidenav__theme[role="radiogroup"]`, forma), та же, что у
 * DECIMUS (T352, #159): три иконки, выбранная залита мягким акцентом, как текущий пункт
 * меню. Видимой подписи нет — слово «Тема» остаётся чтецу в `aria-label` группы.
 *
 * Это группа радиокнопок и по поведению, а не только по роли: выбор ровно один,
 * в группу ведёт один шаг табуляции (на выбранное положение), а стрелки двигают выбор
 * по кругу. Обещать стрелки ролью и не дать их хуже, чем не обещать.
 *
 * Слова приходят готовыми от меню (`AdminNav`), а не из клиентского словаря (T254).
 * Клиентский словарь — это ближайший `NextIntlClientProvider`, и вложенный провайдер
 * ЗАМЕНЯЕТ его разделы, а не дополняет: редактор оборачивает свой экран вместе с меню в
 * провайдер с одним разделом `editor`, и переключатель там рисовал сырые ключи
 * `admin.theme.*`, а сервер печатал `MISSING_MESSAGE: admin`. Меню же переводит свои
 * подписи на сервере, где словарь целиком, — туда же ушли и слова переключателя.
 */
const ICONS: Readonly<Record<ThemeChoice, IconName>> = {
  system: "monitor",
  light: "sun",
  dark: "moon",
};

/** Стрелки группы радиокнопок: вперёд — вправо и вниз, назад — влево и вверх. */
const ARROW_STEP: Readonly<Record<string, number>> = {
  ArrowRight: 1,
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowUp: -1,
};

/** Подписи переключателя: заголовок и по слову на каждое положение. */
export type ThemeToggleLabels = Readonly<Record<"label" | ThemeChoice, string>>;

export function ThemeToggle({
  labels,
  testIdPrefix = "",
}: {
  readonly labels: ThemeToggleLabels;
  /** Приставка тестовых идентификаторов: переключатель стоит и в панели, и в полосе телефона. */
  readonly testIdPrefix?: string;
}): ReactElement {
  const { choice, choose } = useThemeChoice();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const step = ARROW_STEP[event.key];
    if (step === undefined) return;
    event.preventDefault();
    const count = THEME_CHOICES.length;
    const next = (THEME_CHOICES.indexOf(choice) + step + count) % count;
    const option = THEME_CHOICES[next];
    if (option === undefined) return;
    choose(option);
    buttons.current[next]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label={labels.label}
      className="sidenav__theme"
      data-testid={`${testIdPrefix}theme-toggle`}
      onKeyDown={onKeyDown}
    >
      {THEME_CHOICES.map((option, index) => (
        <button
          key={option}
          ref={(node) => {
            buttons.current[index] = node;
          }}
          type="button"
          role="radio"
          data-testid={`${testIdPrefix}theme-${option}`}
          aria-checked={option === choice}
          tabIndex={option === choice ? 0 : -1}
          aria-label={labels[option]}
          title={labels[option]}
          onClick={() => {
            choose(option);
          }}
        >
          <Icon name={ICONS[option]} />
        </button>
      ))}
    </div>
  );
}
