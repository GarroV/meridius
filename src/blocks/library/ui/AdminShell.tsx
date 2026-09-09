import { getTranslations } from "next-intl/server";
import type { ReactElement, ReactNode } from "react";

import { ADMIN_SECTIONS } from "@/blocks/core/admin-sections";

/**
 * Каркас админки для экрана библиотеки блоков (эталон `docs/furca/design/screens/library.html`):
 * левое меню 208px + верхняя полоса. Это пятая копия каркаса (после `catalog`, `editor`,
 * `feed`, `qr`) — у каждого блока свой активный пункт меню, поэтому общий импорт каркаса
 * из чужого блока тащил бы чужую разметку экрана через ui-слой ради двух десятков строк.
 *
 * Словарь здесь, однако, не свой: подписи разделов у всех навигаций одинаковы, а собственных
 * копий словаря (`qr.nav.*`, `catalog.nav.*`, `feed.nav.*`, `editor.nav.*`) в проекте уже
 * четыре, и они расходятся. Пятую копию заводить не стали — берём `editor.nav`. Это допустимо:
 * `library` разрешено зависеть от `editor` (`.dependency-cruiser.cjs`), и блок уже пользуется
 * этой зависимостью для разбора и адресов (`parsing.ts`, `ui/build-model.ts`).
 *
 * Что готово и куда ведёт — не решается здесь: адреса и готовность лежат в
 * `core/admin-sections`. Список в этом файле однажды отстал от продукта, и
 * «Заполнения» показывались надписью «Раздел ещё не готов», хотя раздел работал (#11).
 * Неготовых разделов в кабинете больше нет — библиотека была последним; понадобится
 * снова — вернётся вместе с новым разделом, а не будет висеть мёртвым кодом.
 */

const NAV_LABEL_CLASS =
  "px-[var(--space-7)] pb-[var(--space-3)] text-[length:var(--fs-micro)] leading-[var(--lh-micro)] font-semibold tracking-[var(--tracking-micro)] text-[var(--ink-3)] uppercase";
const NAV_ITEM_CLASS =
  "flex items-center gap-[var(--space-5)] border-l-2 border-transparent px-[var(--space-7)] py-[var(--space-4)] text-[var(--ink-2)] no-underline hover:bg-[var(--surface-3)] hover:text-ink";
const NAV_ITEM_ACTIVE_CLASS =
  "flex items-center gap-[var(--space-5)] border-l-2 border-[var(--accent)] bg-[var(--accent-soft)] px-[var(--space-7)] py-[var(--space-4)] font-medium text-accent no-underline";
const H1_CLASS =
  "text-[length:var(--fs-display)] leading-[var(--lh-display)] font-semibold";

export interface AdminShellProps {
  /** Тестовый идентификатор корня: у каждого экрана свой. */
  readonly testId: string;
  readonly breadcrumb: string;
  readonly title: string;
  readonly topbarAction: ReactNode;
  readonly children: ReactNode;
}

export async function AdminShell({
  testId,
  breadcrumb,
  title,
  topbarAction,
  children,
}: AdminShellProps): Promise<ReactElement> {
  const t = await getTranslations("editor.nav");

  return (
    <div
      data-testid={testId}
      className="grid min-h-screen grid-cols-[208px_1fr]"
    >
      <nav className="bg-surface flex flex-col gap-[var(--space-8)] border-r border-[var(--line-strong)] py-[var(--space-7)]">
        <div className="px-[var(--space-7)] text-[length:var(--fs-title)] leading-[var(--lh-title)] font-semibold tracking-[-0.01em]">
          {t("brand")}{" "}
          <span className="font-normal text-[var(--ink-3)]">
            {t("brandMuted")}
          </span>
        </div>

        <div className="flex flex-col">
          <div className={NAV_LABEL_CLASS}>{t("work")}</div>
          <a className={NAV_ITEM_CLASS} href={ADMIN_SECTIONS.checklists.path}>
            {t("checklists")}
          </a>
          <a
            className={NAV_ITEM_ACTIVE_CLASS}
            href={ADMIN_SECTIONS.library.path}
          >
            {t("library")}
          </a>
          <a className={NAV_ITEM_CLASS} href={ADMIN_SECTIONS.feed.path}>
            {t("feed")}
          </a>
        </div>

        <div className="flex flex-col">
          <div className={NAV_LABEL_CLASS}>{t("reference")}</div>
          <a className={NAV_ITEM_CLASS} href={ADMIN_SECTIONS.catalog.path}>
            {t("catalog")}
          </a>
          <a className={NAV_ITEM_CLASS} href={ADMIN_SECTIONS.qr.path}>
            {t("qr")}
          </a>
        </div>

        <div className="mt-auto px-[var(--space-7)] text-[length:var(--fs-meta)] text-[var(--ink-3)]">
          {t("signedIn")}
          <br />
          {t("role")}
        </div>
      </nav>

      <div className="flex min-w-0 flex-col">
        <header className="bg-surface flex items-center gap-[var(--space-7)] border-b border-[var(--line-strong)] px-[var(--space-9)] py-[var(--space-7)]">
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

        <div className="flex flex-col gap-[var(--space-8)] p-[var(--space-9)]">
          {children}
        </div>
      </div>
    </div>
  );
}
