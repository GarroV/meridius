/**
 * Положение пилюли-переключателя в подвале меню: канонические `.seg__item` /
 * `.seg__current` (D164), только плотнее — эталонный отступ рассчитан на слова, а здесь
 * иконки и двухбуквенные коды, и два переключателя обязаны встать в одну строку.
 *
 * Выбранное положение остаётся кнопкой с `aria-pressed`, а не `span[aria-current]` из
 * эталона: для чтеца это переключатель с состоянием, а не текущая страница.
 */
const COMPACT_CLASS =
  "h-6 min-w-6 justify-center px-[var(--space-3)] [&_svg]:size-[14px]";

// Уже 1100 px панель сжимается до полосы иконок в 56 px (ядро, `.sidenav`): туда пилюля
// в строку не влезает и встаёт столбцом — как прежде вставал переключатель темы.
export const SEG_CLASS = "seg max-[1099px]:flex-col";

export function segOptionClass(isSelected: boolean): string {
  return `${isSelected ? "seg__current" : "seg__item"} ${COMPACT_CLASS}`;
}
