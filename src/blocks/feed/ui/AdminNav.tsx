import { useTranslations } from "next-intl";

import { ADMIN_SECTIONS } from "@/blocks/core/admin-sections";

/**
 * Левое меню админки по эталону (`docs/forge/design/screens/feed.html`): 208 px,
 * две группы разделов, внизу — кто вошёл.
 *
 * Адреса соседних разделов и их готовность приходят из `core/admin-sections`: границы модулей
 * запрещают ленте зависеть от редактора, справочника и QR (.dependency-cruiser.cjs), а `core`
 * доступен каждому блоку. Раньше каждое меню держало свой список строками, и списки разъехались
 * молча (#11).
 *
 * Все пять разделов кабинета готовы — библиотека блоков была последним неготовым.
 * Механики «раздел ещё не готов» здесь больше нет: понадобится снова — вернётся вместе
 * с новым разделом, а не будет висеть мёртвым кодом.
 */

const LABEL_CLASS =
  "px-[var(--space-7)] pb-[var(--space-3)] text-[length:var(--fs-micro)] leading-[var(--lh-micro)] font-semibold tracking-[var(--tracking-micro)] text-[var(--ink-3)] uppercase";
const ITEM_CLASS =
  "flex items-center gap-[var(--space-5)] border-l-2 border-transparent px-[var(--space-7)] py-[var(--space-4)] text-[var(--ink-2)] no-underline hover:bg-[var(--surface-3)] hover:text-[var(--ink)]";
const ITEM_ACTIVE_CLASS =
  "text-accent flex items-center gap-[var(--space-5)] border-l-2 border-[var(--accent)] bg-[var(--accent-soft)] px-[var(--space-7)] py-[var(--space-4)] font-medium no-underline";

export function AdminNav() {
  const t = useTranslations("feed.nav");

  return (
    <nav className="bg-surface flex flex-col gap-[var(--space-8)] border-r border-[var(--line-strong)] py-[var(--space-7)]">
      <div className="px-[var(--space-7)] text-[length:var(--fs-title)] leading-[var(--lh-title)] font-semibold tracking-[-0.01em]">
        {t("brand")}{" "}
        <span className="font-normal text-[var(--ink-3)]">
          {t("brandMuted")}
        </span>
      </div>

      <div className="flex flex-col">
        <div className={LABEL_CLASS}>{t("work")}</div>
        <a className={ITEM_CLASS} href={ADMIN_SECTIONS.checklists.path}>
          {t("checklists")}
        </a>
        <a className={ITEM_CLASS} href={ADMIN_SECTIONS.library.path}>
          {t("library")}
        </a>
        <a
          className={ITEM_ACTIVE_CLASS}
          href={ADMIN_SECTIONS.feed.path}
          aria-current="page"
          data-testid="nav-feed"
        >
          {t("feed")}
        </a>
      </div>

      <div className="flex flex-col">
        <div className={LABEL_CLASS}>{t("reference")}</div>
        <a className={ITEM_CLASS} href={ADMIN_SECTIONS.catalog.path}>
          {t("catalog")}
        </a>
        <a className={ITEM_CLASS} href={ADMIN_SECTIONS.qr.path}>
          {t("qr")}
        </a>
      </div>

      <div className="mt-auto px-[var(--space-7)] text-[length:var(--fs-meta)] text-[var(--ink-3)]">
        {t("signedIn")}
        <br />
        {t("role")}
      </div>
    </nav>
  );
}
