import type { ReactElement, ReactNode } from "react";

import { Icon } from "@/blocks/core/ui/Icon";

/**
 * Меню «…» шапки редактора: вторичные действия (сделать шаблоном, дублировать, удалить)
 * лежат в нём, а не в ряду рядом с «Опубликовать». Видимых решений в шапке — четыре:
 * предпросмотр, черновик, публикация и это меню (разбор интерфейса 12.11.2026: шесть
 * действий, три из них без подписи).
 *
 * Без своего скрипта: `<details>` открывается и закрывается сам, Esc и клик мимо — забота
 * браузера. Каждый пункт — с подписью словами, а не иконкой без объяснения. Подписи
 * приходят готовыми: компонент серверный, словарь он не читает.
 */

const SUMMARY_CLASS =
  "bg-surface text-ink flex h-[var(--control-h)] w-[var(--control-h)] cursor-pointer list-none items-center justify-center rounded-[var(--r-control)] border border-[var(--line-control)] hover:border-[var(--line-control-2)] hover:bg-[var(--surface-2)] max-md:h-[var(--tap-min)] max-md:w-[var(--tap-min)] [&::-webkit-details-marker]:hidden";
/** Пункт меню: иконка и слово, во всю ширину панели, цель касания не меньше 44 px на телефоне. */
export const MENU_ITEM_CLASS =
  "text-ink flex min-h-[var(--control-h)] w-full cursor-pointer items-center gap-[var(--space-4)] rounded-[var(--r-control)] border-0 bg-transparent px-[var(--space-5)] text-left text-[length:var(--fs-body)] font-medium no-underline hover:bg-[var(--surface-2)] hover:text-ink max-md:min-h-[var(--tap-min)]";
const PANEL_CLASS =
  "bg-surface absolute right-0 z-20 mt-[var(--space-3)] flex w-[18rem] max-w-[calc(100vw-2rem)] flex-col gap-[var(--space-2)] rounded-[var(--r-block)] border border-[var(--line-strong)] p-[var(--space-3)] shadow-[var(--sh-modal)]";

export function HeaderMenu({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <details className="relative" data-testid="editor-more-menu">
      <summary
        className={SUMMARY_CLASS}
        aria-label={label}
        title={label}
        data-testid="editor-more"
      >
        <Icon name="dots" />
      </summary>
      <div className={PANEL_CLASS}>{children}</div>
    </details>
  );
}
