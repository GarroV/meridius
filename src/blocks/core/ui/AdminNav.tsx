// Боковое меню кабинета — одно на весь продукт.
//
// До T074 меню было четырьмя копиями (editor, feed, qr, catalog): границы модулей
// (`.dependency-cruiser.cjs`) запрещают этим блокам импортировать друг у друга, и каждый
// завёл своё. Копии разъехались трижды подряд — списком разделов (#11), подписями одного
// и того же пункта (`templates` против `checklists`) и признаком активного пункта. Здесь,
// в `core`, доступном каждому блоку, копия ровно одна.
//
// Куда ведёт пункт и готов ли раздел — не решается здесь: это `core/admin-sections`.
// Раздел, которого в продукте ещё нет, рисуется `<span aria-disabled>`, а не ссылкой:
// ссылка вела бы в 404.
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import {
  ADMIN_NAV_GROUPS,
  ADMIN_SECTIONS,
  type AdminSectionKey,
} from "../admin-sections";

const LABEL_CLASS =
  "px-[var(--space-7)] pb-[var(--space-3)] text-[length:var(--fs-micro)] leading-[var(--lh-micro)] font-semibold tracking-[var(--tracking-micro)] text-[var(--ink-3)] uppercase";
const ITEM_BASE_CLASS =
  "flex items-center gap-[var(--space-5)] border-l-2 px-[var(--space-7)] py-[var(--space-4)]";
const ITEM_CLASS = `${ITEM_BASE_CLASS} border-transparent text-[var(--ink-2)] no-underline hover:bg-[var(--surface-3)] hover:text-[var(--ink)]`;
const ITEM_SOON_CLASS = `${ITEM_BASE_CLASS} border-transparent text-[var(--ink-3)]`;
const ITEM_ACTIVE_CLASS = `${ITEM_BASE_CLASS} text-accent border-[var(--accent)] bg-[var(--accent-soft)] font-medium no-underline`;

export interface AdminNavProps {
  /** Раздел, на экране которого находится человек: его пункт подсвечен. */
  readonly active?: AdminSectionKey | undefined;
}

/**
 * Меню кабинета. Экран говорит только, где находится человек, — всё остальное меню
 * знает само.
 */
export function AdminNav({ active }: AdminNavProps): ReactElement {
  // Словарь `admin`, а не свой на меню: название раздела — один текст на продукт.
  // Первый экран кабинета уже звал разделы через `admin.sections.*`, и четыре копии
  // меню держали пятую, шестую и седьмую копию тех же слов.
  const t = useTranslations("admin");
  const soon = t("nav.soon");

  return (
    <nav className="bg-surface flex flex-col gap-[var(--space-8)] border-r border-[var(--line-strong)] py-[var(--space-7)]">
      <div className="px-[var(--space-7)] text-[length:var(--fs-title)] leading-[var(--lh-title)] font-semibold tracking-[-0.01em]">
        {t("nav.brand")}{" "}
        <span className="font-normal text-[var(--ink-3)]">
          {t("nav.brandMuted")}
        </span>
      </div>

      {ADMIN_NAV_GROUPS.map((group) => (
        <div key={group.key} className="flex flex-col">
          <div className={LABEL_CLASS}>{t(`nav.groups.${group.key}`)}</div>
          {group.items.map((key) =>
            ADMIN_SECTIONS[key].ready ? (
              // Переход внутри кабинета — только `Link`: обычному `<a href>` Next не
              // приставляет базовый путь площадки, и такая ссылка уводит на корень
              // адреса, где на общей площадке живёт чужой продукт (T088, D046).
              <Link
                key={key}
                className={key === active ? ITEM_ACTIVE_CLASS : ITEM_CLASS}
                href={ADMIN_SECTIONS[key].path}
                data-testid={`nav-${key}`}
                {...(key === active ? { "aria-current": "page" as const } : {})}
              >
                {t(`sections.${key}`)}
              </Link>
            ) : (
              <span
                key={key}
                className={ITEM_SOON_CLASS}
                aria-disabled="true"
                title={soon}
              >
                {t(`sections.${key}`)}
              </span>
            ),
          )}
        </div>
      ))}

      <div className="mt-auto px-[var(--space-7)] text-[length:var(--fs-meta)] text-[var(--ink-3)]">
        {t("nav.signedIn")}
        <br />
        {t("nav.role")}
      </div>
    </nav>
  );
}
