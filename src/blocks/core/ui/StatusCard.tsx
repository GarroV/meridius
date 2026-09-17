// Карточка состояния: «страницы нет», «не открылось», «пусто» — экраны, у которых
// содержимого нет и показать надо причину.
//
// Живёт в `core`, потому что такие экраны не принадлежат ни одному блоку: адрес, которого
// нет, и отказ базы случаются под любым разделом. Модуль эталона у состояния один на весь
// продукт — `docs/furca/design/screens/states.html` (карточка, заголовок, пояснение,
// действие), поэтому и разметка здесь одна.
//
// Компонент намеренно без "use client" и без единого серверного вызова: его берут и
// серверные экраны (`not-found.tsx`), и клиентские (`error.tsx` — Next требует, чтобы
// граница ошибки была клиентской). Появись здесь обращение к `next-intl/server` или к
// данным — клиентская сторона перестала бы собираться, поэтому тексты приходят пропами.
import type { ReactElement, ReactNode } from "react";

const CARD_CLASS =
  "bg-surface rounded-[var(--r-block)] border border-[var(--line-strong)] shadow-[var(--sh-xs)]";
const BODY_CLASS =
  "flex flex-col items-center gap-[var(--space-5)] px-[var(--space-8)] py-[var(--space-10)] text-center text-[var(--ink-2)]";
const TITLE_CLASS =
  "text-ink m-0 text-[length:var(--fs-title)] leading-[var(--lh-title)] font-semibold";
const TEXT_CLASS = "m-0 max-w-[520px]";
const NOTE_CLASS =
  "font-num m-0 text-[length:var(--fs-meta)] text-[var(--ink-3)]";

/** Кнопка и ссылка действия выглядят одинаково: на этих экранах действие всегда одно. */
export const STATUS_ACTION_CLASS =
  "bg-surface text-ink inline-flex h-[var(--control-h)] cursor-pointer items-center justify-center gap-[var(--space-4)] rounded-[var(--r-control)] border border-[var(--line-control)] px-[var(--space-6)] text-[length:var(--fs-body)] font-medium no-underline hover:border-[var(--line-control-2)] hover:bg-[var(--surface-2)]";

export interface StatusCardProps {
  readonly testId: string;
  readonly title: string;
  readonly text: string;
  /** Единственное действие экрана: вернуться или повторить. */
  readonly action?: ReactNode;
  /** Мелкая строка под действием — например, код ошибки для поддержки. */
  readonly note?: ReactNode;
}

export function StatusCard({
  testId,
  title,
  text,
  action,
  note,
}: StatusCardProps): ReactElement {
  return (
    <div className={CARD_CLASS} data-testid={testId}>
      <div className={BODY_CLASS}>
        <p className={TITLE_CLASS}>{title}</p>
        <p className={TEXT_CLASS}>{text}</p>
        {action}
        {note === undefined ? null : <p className={NOTE_CLASS}>{note}</p>}
      </div>
    </div>
  );
}

/**
 * Карточка состояния посреди пустого экрана — для страниц вне каркаса кабинета:
 * публичного отказа и границы ошибки, которая рисуется вместо любого экрана продукта.
 */
export function StatusScreen({
  children,
}: {
  readonly children: ReactNode;
}): ReactElement {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center p-[var(--space-8)]">
      {children}
    </main>
  );
}
