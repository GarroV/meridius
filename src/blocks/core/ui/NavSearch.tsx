"use client";

// Поиск в левой панели — как у Swarm (D164): ⌘K / Ctrl+K ставит фокус, Esc очищает.
//
// Сама форма — обычный GET в список чек-листов (`?q=`), поэтому без JavaScript она
// работает так же; клиентская здесь только горячая клавиша. Адрес собирает `Form` из
// next/form: обычному `<form action>` Next не приставляет базовый путь площадки, и
// поиск уводил бы в корень адреса, где живёт чужой продукт (T088, D046).
import Form from "next/form";
import { useEffect, useRef, type ReactElement } from "react";

import { Icon } from "./Icon";

export function NavSearch({
  action,
  label,
  defaultValue,
}: {
  readonly action: string;
  readonly label: string;
  readonly defaultValue?: string | undefined;
}): ReactElement {
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      const input = field.current;
      if (input === null) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        input.focus();
        input.select();
      } else if (event.key === "Escape" && document.activeElement === input) {
        input.value = "";
        input.blur();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <Form action={action} className="sidenav__search" role="search">
      <label className="sidenav__field" title={label}>
        <Icon name="search" />
        <input
          ref={field}
          type="search"
          name="q"
          placeholder={label}
          aria-label={label}
          defaultValue={defaultValue}
          data-testid="nav-search"
        />
        <span className="kbd" aria-hidden="true">
          ⌘K
        </span>
      </label>
    </Form>
  );
}
