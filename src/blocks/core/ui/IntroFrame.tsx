"use client";

// Рамка вводного блока раздела с памятью: человек закрыл блок — он остаётся закрытым.
//
// Блок отвечает на «что это за раздел» тому, кто видит раздел впервые; методисту, который
// открывает его каждый день, он съедает верх каждого экрана (разбор интерфейса
// 12.11.2026). Поэтому блок тихий (без заливки и рамки), закрывается и помнит это в
// браузере. Закрытый блок остаётся строкой «О разделе» — его можно вернуть.
//
// Память — `localStorage`, а не адрес и не база: это удобство одного человека на одном
// устройстве, а не данные продукта. Если хранилище недоступно (приватное окно, запрет
// сайта), блок просто остаётся открытым — ни ошибки, ни пропавшего содержимого. До
// гидратации блок открыт (так его видит и сервер), а запомненное закрытие применяется
// сразу после.
import { useSyncExternalStore } from "react";
import type { ReactElement, ReactNode } from "react";

import { Icon } from "./Icon";

const STORAGE_PREFIX = "meridius:intro-closed:";
const CHANGE_EVENT = "meridius:intro-change";

const ROW_CLASS =
  "flex gap-[var(--space-5)] text-[length:var(--fs-dense)] leading-[var(--lh-dense)]";
const BUTTON_CLASS =
  "inline-flex min-h-[var(--tap-min)] cursor-pointer items-center gap-[var(--space-3)] rounded-[var(--r-control)] border-0 bg-transparent px-[var(--space-3)] text-[length:var(--fs-dense)] font-medium text-[var(--ink-2)] hover:text-ink md:min-h-[var(--control-h)]";

function readClosed(key: string): boolean {
  try {
    return window.localStorage.getItem(STORAGE_PREFIX + key) === "1";
  } catch {
    return false;
  }
}

function writeClosed(key: string, closed: boolean): void {
  try {
    if (closed) window.localStorage.setItem(STORAGE_PREFIX + key, "1");
    else window.localStorage.removeItem(STORAGE_PREFIX + key);
  } catch {
    // Хранилища нет — блок живёт до перезагрузки, больше ничего не нужно.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export interface IntroFrameProps {
  readonly section: string;
  readonly label: string;
  readonly hideLabel: string;
  readonly showLabel: string;
  readonly children: ReactNode;
}

export function IntroFrame({
  section,
  label,
  hideLabel,
  showLabel,
  children,
}: IntroFrameProps): ReactElement {
  const closed = useSyncExternalStore(
    subscribe,
    () => readClosed(section),
    () => false,
  );

  if (closed) {
    return (
      <div data-testid="section-intro-closed" data-section={section}>
        <button
          type="button"
          className={BUTTON_CLASS}
          aria-expanded="false"
          onClick={() => {
            writeClosed(section, false);
          }}
        >
          <Icon name="info" className="size-4 flex-none" />
          {showLabel}
        </button>
      </div>
    );
  }

  return (
    <section
      aria-label={label}
      data-testid="section-intro"
      data-section={section}
      className={ROW_CLASS}
    >
      <Icon
        name="info"
        className="mt-[var(--space-1)] size-4 flex-none text-[var(--ink-3)]"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-[var(--space-2)]">
        {children}
      </div>
      <button
        type="button"
        className={`${BUTTON_CLASS} -mt-[var(--space-3)] flex-none`}
        aria-label={hideLabel}
        title={hideLabel}
        onClick={() => {
          writeClosed(section, true);
        }}
      >
        <Icon name="x" className="size-4 flex-none" />
      </button>
    </section>
  );
}
