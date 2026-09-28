// Каркас экранов кабинета — один на весь продукт (T074).
//
// Эталон у всех экранов админки один (`docs/furca/design/screens/*.html`): меню 208 px
// слева, верхняя полоса с крошкой, заголовком и действием справа. До T074 каркас был
// четырьмя копиями по блокам — границы модулей не дают им импортировать друг у друга,
// и каждый завёл свой. Здесь, в `core`, копия одна: `core` доступен каждому блоку.
//
// Каркас не решает, какой раздел активен и что стоит в шапке, — это говорит экран
// пропами. Экран, которому нужна своя верхняя полоса (редактор: кнопки публикации
// живут внутри клиентской формы и обязаны видеть её состояние), берёт только `AdminNav`.
import type { ReactElement, ReactNode } from "react";

import { ADMIN_CONTENT_CLASS, ADMIN_FRAME_CLASS } from "./admin-frame";
import { AdminNav, type AdminNavActive } from "./AdminNav";
import { ADMIN_CONTENT_ID, SkipLink } from "./SkipLink";

const H1_CLASS =
  "text-[length:var(--fs-display)] leading-[var(--lh-display)] font-semibold";

export interface AdminShellProps {
  /** Тестовый идентификатор корня: у каждого экрана свой. */
  readonly testId: string;
  /** Раздел меню, в котором находится человек. */
  readonly active?: AdminNavActive | undefined;
  readonly breadcrumb: ReactNode;
  readonly title: string;
  readonly topbarAction: ReactNode;
  readonly children: ReactNode;
  /** Узкая колонка (880 px) — карточка заполнения; списки идут во всю ширину. */
  readonly narrow?: boolean;
}

export function AdminShell({
  testId,
  active,
  breadcrumb,
  title,
  topbarAction,
  children,
  narrow = false,
}: AdminShellProps): ReactElement {
  return (
    <div data-testid={testId} className={ADMIN_FRAME_CLASS}>
      <SkipLink />
      <AdminNav active={active} />

      {/*
        `<main>` — ориентир, по которому программа чтения с экрана переходит к
        содержимому. До этой правки его не было НИ НА ОДНОМ экране кабинета, и каркас
        читался сплошным потоком. `tabIndex={-1}` нужен ссылке-пропуску: без него
        переход по якорю прокручивает страницу, но фокус остаётся на меню, и следующий
        Tab возвращает человека туда же, откуда он только что ушёл.
      */}
      <main
        id={ADMIN_CONTENT_ID}
        tabIndex={-1}
        data-testid="admin-main"
        className="flex min-w-0 flex-col focus:outline-none"
      >
        {/*
          Ниже складки верхняя полоса переносит действие на следующую строку, а не сжимает
          заголовок до нечитаемого: кнопка раздела шире половины экрана на 375 px.
        */}
        <header className="bg-surface flex items-center gap-[var(--space-7)] border-b border-[var(--line-strong)] px-[var(--space-9)] py-[var(--space-7)] max-md:flex-wrap max-md:gap-[var(--space-5)] max-md:px-[var(--space-7)]">
          <div className="flex min-w-0 flex-col gap-[var(--space-1)]">
            <div className="text-[length:var(--fs-meta)] text-[var(--ink-3)]">
              {breadcrumb}
            </div>
            <h1 className={H1_CLASS}>{title}</h1>
          </div>
          <div className="ml-auto flex items-center gap-[var(--space-4)]">
            {topbarAction}
          </div>
        </header>

        <div
          className={`${ADMIN_CONTENT_CLASS}${narrow ? " max-w-[880px]" : ""}`}
        >
          {children}
        </div>
      </main>
    </div>
  );
}
