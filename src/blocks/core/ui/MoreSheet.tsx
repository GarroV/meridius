"use client";

// Таб «Ещё» на телефоне и его лист (D183, как в Swarm — `2026-08-22-mobile-nav`).
//
// Внизу экрана четыре таба: Главная, Станции, Статистика и «Ещё». Всё остальное —
// чек-листы, вспомогательные разделы, тема и язык — лежит в листе, который «Ещё»
// поднимает снизу. Лист — родной `<dialog>`: фокус уходит внутрь и не убегает за него,
// Esc и тап по подложке закрывают, читалка объявляет окно по имени.
//
// Пункты листа рисует меню (`AdminNav`) — здесь только открыть и закрыть. Лист
// закрывается и сам после перехода: меню на разделах мастер-детали живёт в разметке
// сегмента и при переходе не перерисовывается, а открытый лист поверх нового экрана
// выглядел бы как неудавшийся переход.
import { usePathname } from "next/navigation";
import {
  useEffect,
  useId,
  useRef,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from "react";

import { Icon } from "./Icon";

export function MoreSheet({
  label,
  title,
  closeLabel,
  isActive,
  children,
}: {
  /** Подпись таба: «Ещё». */
  readonly label: string;
  /** Заголовок листа — его имя для читалки. */
  readonly title: string;
  readonly closeLabel: string;
  /** Человек сейчас в разделе из листа: таб подсвечен, как подсвечен бы был сам пункт. */
  readonly isActive: boolean;
  readonly children: ReactNode;
}): ReactElement {
  const sheet = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const pathname = usePathname();

  useEffect(() => {
    sheet.current?.close();
  }, [pathname]);

  function open(): void {
    sheet.current?.showModal();
  }

  function close(): void {
    sheet.current?.close();
  }

  // Тап мимо листа приходит в сам `<dialog>` (подложка — его часть), тап по пункту —
  // в ссылку внутри. Переход по пункту закрывает лист и без этого, но не сразу: сначала
  // грузится экран, и лист секунду висел бы поверх.
  function onClick(event: MouseEvent<HTMLDialogElement>): void {
    const target = event.target as HTMLElement;
    if (target === event.currentTarget || target.closest("a") !== null) close();
  }

  return (
    <>
      <button
        type="button"
        className="tabbar__item"
        data-testid="tab-more"
        data-active={isActive ? "" : undefined}
        aria-haspopup="dialog"
        onClick={open}
      >
        <Icon name="dots" />
        <span>{label}</span>
      </button>
      <dialog
        ref={sheet}
        className="sheet"
        aria-labelledby={titleId}
        data-testid="more-sheet"
        onClick={onClick}
      >
        <div className="sheet__body">
          <header className="sheet__head">
            <h2 id={titleId} className="sheet__title">
              {title}
            </h2>
            <button
              type="button"
              className="icon-btn sheet__close"
              aria-label={closeLabel}
              title={closeLabel}
              data-testid="more-close"
              onClick={close}
            >
              <Icon name="x" />
            </button>
          </header>
          {children}
        </div>
      </dialog>
    </>
  );
}
