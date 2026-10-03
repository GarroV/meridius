// Строка колонки списка мастер-детали (D162) — одна на продукт (T353, #184).
//
// Колонку держат два раздела: чек-листы (`editor/ui/ChecklistRail.tsx`) и станции
// (`stations/ui/StationsRail.tsx`). Каждый вёл свою копию классов строки, и сверка со
// Swarm нашла их разными на глаз при одинаковом замысле. Здесь копия ровно одна.
//
// Выбранная строка нарисована ровно как текущий пункт левой панели (`.sidenav__current`
// ядра): мягкая акцентная заливка, полоса 2 px слева, акцентный текст и неон темы
// (`--glow-sm`, в светлой он прозрачен). Два «выбранных» на одном экране обязаны
// выглядеть одинаково — и в светлой, и в тёмной теме: до этого выбранная строка в тёмной
// теме меняла только фон, а текст оставался цветом чернил и почти не выделялся.

const RAIL_ROW_BASE_CLASS =
  "flex rounded-[var(--r-control)] px-[var(--space-5)] py-[var(--space-4)] no-underline transition-[background,color] duration-[var(--t-state)] hover:no-underline";

const RAIL_ROW_IDLE_CLASS =
  "text-ink hover:bg-[var(--surface-2)] hover:text-ink";

const RAIL_ROW_CURRENT_CLASS =
  "bg-[var(--accent-soft)] text-[var(--accent)] shadow-[inset_2px_0_0_var(--accent),var(--glow-sm)] hover:text-[var(--accent)]";

/** Раскладка содержимого строки: столбцом (имя над метой) или в ряд (флажок и текст). */
export type RailRowLayout = "column" | "row";

const LAYOUT_CLASS: Readonly<Record<RailRowLayout, string>> = {
  column: "flex-col gap-[var(--space-1)]",
  row: "items-start gap-[var(--space-4)]",
};

/** Классы строки колонки: вид выбранной и обычной — общий, раскладка — по содержимому. */
export function railRowClass(
  isCurrent: boolean,
  layout: RailRowLayout,
): string {
  return `${RAIL_ROW_BASE_CLASS} ${LAYOUT_CLASS[layout]} ${
    isCurrent ? RAIL_ROW_CURRENT_CLASS : RAIL_ROW_IDLE_CLASS
  }`;
}

/** Имя в строке: цвет наследует от строки, чтобы выбранное имя было акцентным. */
export const RAIL_ROW_NAME_CLASS =
  "text-[length:var(--fs-body)] leading-[var(--lh-body)] font-medium [overflow-wrap:anywhere]";

/** Мета под именем: тише имени в обычной строке и в выбранной. */
export const RAIL_ROW_META_CLASS =
  "flex flex-wrap items-center gap-x-[var(--space-3)] gap-y-[var(--space-1)] text-[length:var(--fs-meta)] leading-[var(--lh-meta)] text-[var(--ink-3)]";
