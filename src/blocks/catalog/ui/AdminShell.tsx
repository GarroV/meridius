import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactElement, ReactNode } from "react";

import { ADMIN_SECTIONS } from "@/blocks/core/admin-sections";

/**
 * Каркас админки по эталону (`docs/forge/design/screens/*.html`): левое меню
 * шириной 208px и верхняя полоса с крошкой и заголовком раздела. Каркас общий для
 * будущих экранов справочника, поэтому сам не решает, какой раздел активен, —
 * это решает вызывающий экран через пропы.
 *
 * Разделы, которых ещё нет в продукте, рисуются `<span aria-disabled>`, а не
 * `<Link>`: ссылка вела бы на несуществующий маршрут (404), а так пункт просто не
 * откликается ни на клик, ни на фокус в смысле навигации. Что именно готово —
 * решает `core/admin-sections`, а не этот файл: свой список здесь однажды отстал от
 * продукта, и из справочника нельзя было уйти ни в один раздел, включая готовые (#11).
 */

const NAV_LABEL_CLASS =
  "px-[var(--space-7)] pb-[var(--space-3)] text-[length:var(--fs-micro)] leading-[var(--lh-micro)] font-semibold tracking-[var(--tracking-micro)] text-[var(--ink-3)] uppercase";
const NAV_ITEM_CLASS =
  "flex items-center gap-[var(--space-5)] border-l-2 border-transparent px-[var(--space-7)] py-[var(--space-4)] text-[var(--ink-2)] no-underline hover:bg-[var(--surface-3)] hover:text-[var(--ink)]";
const NAV_ITEM_SOON_CLASS =
  "flex items-center gap-[var(--space-5)] border-l-2 border-transparent px-[var(--space-7)] py-[var(--space-4)] text-[var(--ink-3)]";
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
  const t = await getTranslations("catalog");
  const soonTitle = t("nav.soon");

  return (
    <div
      data-testid={testId}
      className="grid min-h-screen grid-cols-[208px_1fr]"
    >
      <nav className="bg-surface flex flex-col gap-[var(--space-8)] border-r border-[var(--line-strong)] py-[var(--space-7)]">
        <div className="px-[var(--space-7)] text-[length:var(--fs-title)] leading-[var(--lh-title)] font-semibold tracking-[-0.01em]">
          {t("nav.brand")}{" "}
          <span className="font-normal text-[var(--ink-3)]">
            {t("nav.brandMuted")}
          </span>
        </div>

        <div className="flex flex-col">
          <div className={NAV_LABEL_CLASS}>{t("nav.workGroup")}</div>
          <Link
            className={NAV_ITEM_CLASS}
            href={ADMIN_SECTIONS.checklists.path}
          >
            {t("nav.templates")}
          </Link>
          <span
            className={NAV_ITEM_SOON_CLASS}
            aria-disabled="true"
            title={soonTitle}
          >
            {t("nav.library")}
          </span>
          <Link className={NAV_ITEM_CLASS} href={ADMIN_SECTIONS.feed.path}>
            {t("nav.feed")}
          </Link>
        </div>

        <div className="flex flex-col">
          <div className={NAV_LABEL_CLASS}>{t("nav.catalogGroup")}</div>
          <Link
            className={NAV_ITEM_ACTIVE_CLASS}
            href={ADMIN_SECTIONS.catalog.path}
            aria-current="page"
            data-testid="nav-catalog"
          >
            {t("nav.catalog")}
          </Link>
          <Link className={NAV_ITEM_CLASS} href={ADMIN_SECTIONS.qr.path}>
            {t("nav.qr")}
          </Link>
        </div>

        <div className="mt-auto px-[var(--space-7)] text-[length:var(--fs-meta)] text-[var(--ink-3)]">
          {t("nav.signedIn")}
          <br />
          {t("nav.role")}
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
