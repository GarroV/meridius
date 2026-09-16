import type { CSSProperties } from "react";

/**
 * Стрелка выпадающего списка из эталона (`.select` в docs/furca/design/app.css):
 * два градиента вместо системного треугольника, иначе списки в админке выглядят
 * по-разному в Chrome, Safari и Firefox.
 *
 * Живёт в объекте стиля, а не в утилитах Tailwind: значение с запятыми внутри
 * произвольного класса читается хуже, чем обычный CSS.
 */
const ARROW_IMAGE =
  "linear-gradient(45deg, transparent 50%, var(--ink-3) 50%), linear-gradient(135deg, var(--ink-3) 50%, transparent 50%)";

export const SELECT_ARROW: CSSProperties = {
  appearance: "none",
  backgroundImage: ARROW_IMAGE,
  backgroundPosition: "calc(100% - 14px) 13px, calc(100% - 9px) 13px",
  backgroundSize: "5px 5px, 5px 5px",
  backgroundRepeat: "no-repeat",
};

/** Тот же список, но ростом с малую кнопку: стрелка поднимается вместе с ним. */
export const SELECT_ARROW_SMALL: CSSProperties = {
  ...SELECT_ARROW,
  backgroundPosition: "calc(100% - 14px) 11px, calc(100% - 9px) 11px",
};
