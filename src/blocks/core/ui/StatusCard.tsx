// Карточка состояния КАБИНЕТА: «такого раздела нет», «страница не открылась» — экраны,
// у которых содержимого нет и показать надо причину. Всегда стоит внутри каркаса
// (`AdminShell`), поэтому и выглядит как всё остальное в кабинете: карточка с рамкой и
// тенью на сером канвасе, заголовок var(--fs-title).
//
// Сотрудническая поверхность берёт НЕ ЭТО, а полноэкранное состояние
// `core/ui/StateScreen.tsx`: телефон на кухне — другой характер экрана, белый фон от
// края и крупный заголовок. До T213 карточка стояла и там, и человек, отсканировавший
// оборванную наклейку, получал кусок кабинета.
//
// Модуль эталона у состояний один на весь продукт —
// `docs/furca/design/screens/states.html`, раздел «Админка — состояния».
//
// Компонент намеренно без "use client" и без единого серверного вызова: его берут и
// серверные экраны (`admin/not-found.tsx`), и клиентские (`admin/error.tsx` — Next
// требует, чтобы граница ошибки была клиентской). Появись здесь обращение к
// `next-intl/server` или к данным — клиентская сторона перестала бы собираться, поэтому
// тексты приходят пропами.
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

/**
 * Кнопка и ссылка действия выглядят одинаково: на этих экранах действие всегда одно.
 * Оно акцентное (`.btn.btn--primary` эталона: заливка var(--accent), текст
 * var(--ink-inverse)) — ровно как у эталонного пустого состояния «Чек-листов пока
 * нет». До T213 кнопка была вторичной, и единственный выход из тупика ничем не
 * отличался от карточки, в которой стоял.
 */
export const STATUS_ACTION_CLASS =
  "bg-accent inline-flex h-[var(--control-h)] cursor-pointer items-center justify-center gap-[var(--space-4)] rounded-[var(--r-control)] border border-[var(--accent)] px-[var(--space-6)] text-[length:var(--fs-body)] font-medium text-[var(--ink-inverse)] no-underline hover:border-[var(--accent-hover)] hover:bg-[var(--accent-hover)]";

/**
 * Плашка отказа внутри карточки — `.notice.notice--err` эталона (блок «Ошибка
 * сохранения» в states.html): фон var(--err-soft), рамка var(--err-line), цвет
 * var(--err). Отказ окрашен затем, чтобы не читаться как «здесь пока пусто»,
 * нарисованное тем же нейтральным серым (T214).
 */
const NOTICE_ERR_CLASS =
  "w-full rounded-[var(--r-block)] border border-[var(--err-line)] bg-[var(--err-soft)] px-[var(--space-7)] py-[var(--space-6)] text-left text-[length:var(--fs-dense)] text-[var(--err)]";

export interface StatusCardProps {
  readonly testId: string;
  readonly title: string;
  /** Абзац объяснения под заголовком. Может отсутствовать, когда объяснение — в плашке. */
  readonly text?: string;
  /** Плашка цвета ошибки: чем именно отказ отличается от пустого состояния. */
  readonly notice?: ReactNode;
  /** Единственное действие экрана: вернуться или повторить. */
  readonly action?: ReactNode;
  /** Мелкая строка под действием — например, код ошибки для поддержки. */
  readonly note?: ReactNode;
}

export function StatusCard({
  testId,
  title,
  text,
  notice,
  action,
  note,
}: StatusCardProps): ReactElement {
  return (
    <div className={CARD_CLASS} data-testid={testId}>
      <div className={BODY_CLASS}>
        <p className={TITLE_CLASS}>{title}</p>
        {text === undefined ? null : <p className={TEXT_CLASS}>{text}</p>}
        {notice === undefined ? null : (
          <div className={NOTICE_ERR_CLASS}>{notice}</div>
        )}
        {action}
        {note === undefined ? null : <p className={NOTE_CLASS}>{note}</p>}
      </div>
    </div>
  );
}
