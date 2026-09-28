"use client";

import type { ReactElement } from "react";

import { THEME_CHOICES, type ThemeChoice } from "../theme";
import { Icon, type IconName } from "./Icon";
import { useThemeChoice } from "./ThemeProvider";

/**
 * Переключатель темы (D106). Три положения, а не два: «Авто» — это не третья тема, а
 * возврат к системной настройке, и без него выбор был бы дорогой в один конец.
 *
 * Вид — как в левой панели Swarm (D164): три иконки, выбранная — мягкой заливкой.
 *
 * Слова приходят готовыми от меню (`AdminNav`), а не из клиентского словаря (T254).
 * Клиентский словарь — это ближайший `NextIntlClientProvider`, и вложенный провайдер
 * ЗАМЕНЯЕТ его разделы, а не дополняет: редактор оборачивает свой экран вместе с меню в
 * провайдер с одним разделом `editor`, и переключатель там рисовал сырые ключи
 * `admin.theme.*`, а сервер печатал `MISSING_MESSAGE: admin`. Меню же переводит свои
 * подписи на сервере, где словарь целиком, — туда же ушли и слова переключателя.
 */
// Вид — переключатель темы левой панели Swarm (D164): подпись и три иконки, выбранная
// — мягкой заливкой (`sidenav__theme` в ядре).
const ICONS: Readonly<Record<ThemeChoice, IconName>> = {
  system: "monitor",
  light: "sun",
  dark: "moon",
};

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
      {/*
        `role="group"`, а не `radiogroup`: стрелками между положениями здесь не ходят,
        каждое положение — обычная кнопка, и чтец называет её нажатой через
        `aria-pressed`. Обещать клавиатурное поведение, которого нет, хуже, чем не
        обещать его вовсе.
      */}
      <div role="group" aria-label={labels.label} className="sidenav__theme">
        <span className="sidenav__theme-label">{labels.label}</span>
        {THEME_CHOICES.map((option) => (
          <button
            key={option}
            type="button"
            data-testid={`theme-${option}`}
            aria-pressed={option === choice}
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
    </div>
  );
}
