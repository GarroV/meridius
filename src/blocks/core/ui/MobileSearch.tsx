"use client";

// Поиск на телефоне — пиктограммой в полосе марки (D183, как в Swarm: «поиск — иконка в
// шапке»). Тап раскрывает под полосой то же поле, что в левой панели: обычный GET в
// список чек-листов (`?q=`), собранный `Form` из next/form — простому `<form action>`
// Next не приставляет базовый путь площадки (T088, D046). Esc и повторный тап сворачивают.
//
// Своя форма, а не `NavSearch`: тот вешает ⌘K на всё окно, и два экземпляра спорили бы,
// чьё поле получит фокус.
import Form from "next/form";
import { usePathname } from "next/navigation";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
} from "react";

import { Icon } from "./Icon";

export function MobileSearch({
  action,
  label,
}: {
  readonly action: string;
  readonly label: string;
}): ReactElement {
  const [isOpen, setOpen] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  const panelId = useId();
  const pathname = usePathname();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (isOpen) field.current?.focus();
  }, [isOpen]);

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Escape") setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        className="icon-btn mbar__icon"
        aria-label={label}
        title={label}
        aria-expanded={isOpen}
        aria-controls={panelId}
        data-testid="mbar-search"
        onClick={() => {
          setOpen((was) => !was);
        }}
      >
        <Icon name="search" />
      </button>
      <Form
        action={action}
        id={panelId}
        role="search"
        className="mbar__search"
        hidden={!isOpen}
      >
        <label className="mbar__field">
          <Icon name="search" />
          <input
            ref={field}
            type="search"
            name="q"
            placeholder={label}
            aria-label={label}
            enterKeyHint="search"
            data-testid="mbar-search-field"
            onKeyDown={onKeyDown}
          />
        </label>
      </Form>
    </>
  );
}
