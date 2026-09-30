// Вид карточек и таблиц главной — тот же, что у ленты (`feed/ui/FeedTable.tsx`): главная
// ведёт в «Заполнения», и таблица, которая выглядит иначе, читалась бы другим продуктом.
export const CARD_CLASS =
  "bg-surface rounded-[var(--r-block)] border border-[var(--line-strong)] shadow-[var(--sh-xs)]";
export const HEAD_CLASS =
  "flex items-center gap-[var(--space-6)] rounded-t-[var(--r-block)] border-b border-[var(--line)] bg-[var(--surface-3)] px-[var(--space-7)] py-[var(--space-6)]";
export const TITLE_CLASS =
  "text-[length:var(--fs-title)] leading-[var(--lh-title)] font-semibold";
export const COUNT_CLASS =
  "ml-auto text-[length:var(--fs-meta)] text-[var(--ink-3)]";
export const TABLE_CLASS =
  "w-full border-collapse text-[length:var(--fs-dense)] leading-[var(--lh-dense)]";
export const TH_CLASS =
  "border-b border-[var(--line-strong)] bg-[var(--surface-3)] px-[var(--cell-pad-x)] py-[var(--space-4)] text-left text-[length:var(--fs-micro)] leading-[var(--lh-micro)] font-semibold tracking-[var(--tracking-micro)] text-[var(--ink-2)] uppercase whitespace-nowrap";
export const TD_CLASS =
  "border-b border-[var(--line)] px-[var(--cell-pad-x)] py-[var(--space-5)] align-middle";
export const TD_NUM_CLASS = `${TD_CLASS} font-[family-name:var(--font-num)] text-[length:var(--fs-num)] [font-variant-numeric:tabular-nums] whitespace-nowrap`;
export const TR_CLASS = "hover:bg-[var(--surface-2)]";
export const META_CLASS = "text-[length:var(--fs-meta)] text-[var(--ink-3)]";
export const LINK_CLASS = "text-ink font-medium no-underline hover:underline";
