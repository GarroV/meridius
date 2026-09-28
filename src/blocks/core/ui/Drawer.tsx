"use client";

// Выдвижная панель справа — работа с элементом списка, не уводя со страницы (D162).
//
// Эталон — «Изменить задачу» Swarm Brain (D164): 560 px во всю высоту, список под ней
// остаётся виден под лёгкой подложкой, шапка с заголовком и действиями-иконками,
// прокручивается только тело. Вид — компонент ядра (`.drawer*` в dodo-ds.css).
//
// Открыта панель или нет — решает АДРЕС, а не состояние компонента: экран рисует
// панель, когда в адресе есть её параметр (`?panel=…`, `?device=…`). Отсюда три вещи
// бесплатно: ссылкой на открытую панель можно поделиться, «назад» в браузере её
// закрывает, а сервер рисует её сразу с данными. Закрыть — значит перейти на
// `closeHref`: подложка и крестик — обычные ссылки, Esc делает то же самое.
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useId,
  useRef,
  type ReactElement,
  type ReactNode,
} from "react";

import { Icon } from "./Icon";

export interface DrawerProps {
  readonly title: ReactNode;
  /** Адрес того же экрана без панели. */
  readonly closeHref: string;
  /** Подпись крестика и подложки для чтеца. */
  readonly closeLabel: string;
  /** Действия в шапке рядом с крестиком: иконки `.icon-btn`. */
  readonly actions?: ReactNode;
  readonly footer?: ReactNode;
  readonly children: ReactNode;
  readonly testId?: string;
}

export function Drawer({
  title,
  closeHref,
  closeLabel,
  actions,
  footer,
  children,
  testId = "drawer",
}: DrawerProps): ReactElement {
  const router = useRouter();
  const panel = useRef<HTMLElement>(null);
  const titleId = useId();

  useEffect(() => {
    // Фокус — на панель, чтобы следующая табуляция шла по её полям, а чтец объявил
    // заголовок. Прежний фокус остаётся в списке: закрытие перерисует экран.
    panel.current?.focus();
    function onKey(event: KeyboardEvent): void {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      // Esc внутри открытого своего окна (выпадающий список, диалог подтверждения)
      // закрывает сначала его: такие окна гасят событие сами.
      router.push(closeHref, { scroll: false });
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [closeHref, router]);

  return (
    <div className="drawer-layer">
      <Link
        href={closeHref}
        scroll={false}
        className="drawer-scrim"
        aria-label={closeLabel}
        tabIndex={-1}
      />
      <aside
        ref={panel}
        className="drawer"
        role="dialog"
        aria-modal="false"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-testid={testId}
      >
        <header className="drawer__head">
          <h2 id={titleId} className="drawer__title">
            {title}
          </h2>
          <div className="drawer__actions">
            {actions}
            <Link
              href={closeHref}
              scroll={false}
              className="icon-btn"
              aria-label={closeLabel}
              title={closeLabel}
              data-testid={`${testId}-close`}
            >
              <Icon name="x" />
            </Link>
          </div>
        </header>
        <div className="drawer__body">{children}</div>
        {footer === undefined ? null : (
          <footer className="drawer__foot">{footer}</footer>
        )}
      </aside>
    </div>
  );
}

/** Строка свойства: иконка и подпись слева, значение справа (`.prow` ядра). */
export function PropertyRow({
  icon,
  label,
  value,
  empty = "—",
}: {
  readonly icon: Parameters<typeof Icon>[0]["name"];
  readonly label: string;
  readonly value: ReactNode;
  readonly empty?: string;
}): ReactElement {
  const isEmpty = value === null || value === undefined || value === "";
  return (
    <div className="prow">
      <span className="prow__label">
        <Icon name={icon} />
        {label}
      </span>
      <span
        className={isEmpty ? "prow__value prow__value--empty" : "prow__value"}
      >
        {isEmpty ? empty : value}
      </span>
    </div>
  );
}
