// Верхняя полоса и область содержимого экрана кабинета — без меню вокруг.
//
// Отдельно от `AdminShell`, потому что с D162 у двух разделов меню и колонка списка
// живут в разметке сегмента (`src/app/admin/checklists/layout.tsx`, `…/stations/…`):
// они не перерисовываются при выборе другого элемента, а меняется только правая
// рабочая зона. Экрану такой зоны нужен тот же заголовок, что и остальным экранам
// кабинета, но без второго меню. `AdminShell` собирает из этих же частей полный экран —
// копия заголовка на продукт одна.
import type { ReactElement, ReactNode } from "react";

import {
  ADMIN_CONTENT_CLASS,
  ADMIN_HEADER_CLASS,
  ADMIN_TITLE_CLASS,
} from "./admin-frame";

export interface AdminPageProps {
  /** Тестовый идентификатор корня. У полного экрана его несёт каркас, а не страница. */
  readonly testId?: string | undefined;
  readonly breadcrumb: ReactNode;
  readonly title: string;
  readonly topbarAction: ReactNode;
  readonly children: ReactNode;
  /** Узкая колонка (880 px) — карточка заполнения; списки идут во всю ширину. */
  readonly narrow?: boolean;
}

export function AdminPage({
  testId,
  breadcrumb,
  title,
  topbarAction,
  children,
  narrow = false,
}: AdminPageProps): ReactElement {
  return (
    <div data-testid={testId} className="flex min-w-0 flex-col">
      <header className={ADMIN_HEADER_CLASS}>
        <div className="flex min-w-0 flex-col gap-[var(--space-1)]">
          <div
            className="text-[length:var(--fs-meta)] text-[var(--ink-3)]"
            data-testid="admin-crumbs"
          >
            {breadcrumb}
          </div>
          <h1 className={ADMIN_TITLE_CLASS}>{title}</h1>
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
    </div>
  );
}
