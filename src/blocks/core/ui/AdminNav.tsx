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
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";

import {
  ADMIN_HOME,
  ADMIN_HQ_ONLY_SECTIONS,
  ADMIN_NAV_ITEMS,
  ADMIN_SECTIONS,
  type AdminSectionKey,
} from "../admin-sections";
import { asLocale } from "../locale";
import { HqOnly, NavViewer } from "./admin-viewer";
import { Icon, type IconName } from "./Icon";
import { LocaleToggle } from "./LocaleToggle";
import { NavSearch } from "./NavSearch";
import { ThemeToggle } from "./ThemeToggle";

// Вид панели — эталон линейки, левая панель Swarm Brain (D164): марка с подписью,
// поиск с ⌘K, пункты с иконкой, текущий — мягкая заливка и полоса слева; внизу тема,
// язык и кто вошёл. Сами классы (`sidenav*`) — компонент ядра дизайн-системы, здесь
// только разметка. Ширины тоже оттуда: 216 px, а уже 1100 px — 56 px иконок, подписи
// уходят в `title`. Ниже складки (768 px) панель — верхняя полоса в одну строку со
// своей прокруткой (D092, T344): колонка иконок отнимала у телефона 56 px из 375.
// Вид полосы — `globals.css`, слой `components`.

// Тема и язык — две пилюли в одну строку, без подписей: иконки и коды языков понятны
// сами, а слова остаются чтецу. На полосе иконок (уже 1100 px) — столбцом.
const PREFS_ROW_CLASS =
  "mb-[var(--space-2)] flex items-center justify-between gap-[var(--space-3)] px-[var(--space-2)] md:max-[1099px]:flex-col md:max-[1099px]:px-0";

/** Иконка пункта — из набора линейки. Один факт на продукт, рядом с меню. */
const SECTION_ICONS: Readonly<Record<AdminSectionKey, IconName>> = {
  checklists: "task",
  stations: "board",
  templates: "doc",
  library: "book",
  feed: "graph",
  catalog: "globe",
  qr: "tag",
  devices: "monitor",
  partners: "team",
};

/** Где находится человек: раздел кабинета или его главная. */
export type AdminNavActive = AdminSectionKey | "home";

export interface AdminNavProps {
  /** Раздел, на экране которого находится человек: его пункт подсвечен. */
  readonly active?: AdminNavActive | undefined;
}

function NavItem({
  href,
  icon,
  label,
  isActive,
  testId,
}: {
  readonly href: string;
  readonly icon: IconName;
  readonly label: string;
  readonly isActive: boolean;
  readonly testId: string;
}): ReactElement {
  // Переход внутри кабинета — только `Link`: обычному `<a href>` Next не приставляет
  // базовый путь площадки, и такая ссылка уводит на корень адреса, где на общей
  // площадке живёт чужой продукт (T088, D046). Текущий пункт тоже ссылка: с карточки
  // станции или из редактора он возвращает к списку раздела.
  return (
    <Link
      className={isActive ? "sidenav__current" : "sidenav__item"}
      href={href}
      title={label}
      data-testid={testId}
      {...(isActive ? { "aria-current": "page" as const } : {})}
    >
      <Icon name={icon} />
      <span className="sidenav__label">{label}</span>
    </Link>
  );
}

/**
 * Меню кабинета. Экран говорит только, где находится человек, — всё остальное меню
 * знает само.
 */
export function AdminNav({ active }: AdminNavProps): ReactElement {
  // Словарь `admin`, а не свой на меню: название раздела — один текст на продукт.
  const t = useTranslations("admin");
  const locale = useLocale();

  return (
    <nav
      className="sidenav md:sticky md:top-0 md:h-screen"
      aria-label={t("nav.brand")}
    >
      {/*
        Марка — ссылка на главную кабинета (T124). Адрес берётся из `admin-sections`, а
        не пишется строкой, — тот же дубль вычищали трижды (T116, T118, T119).
      */}
      <Link
        href={ADMIN_HOME.path}
        className="sidenav__brand"
        data-testid="nav-brand"
        // Ниже 1100 px меню свёрнуто в иконки и подпись `.sidenav__name` скрыта
        // `display: none` — без явного имени ссылка остаётся безымянной (#195).
        // Имя повторяет видимую подпись слово в слово (WCAG 2.5.3, label in name).
        aria-label={`${t("nav.brand")} ${t("nav.brandMuted")}`}
      >
        <span className="sidenav__logo grid place-items-center bg-accent text-[var(--ink-inverse)]">
          <Icon name="check" strokeWidth={2.2} className="size-4" />
        </span>
        <span className="sidenav__name">
          <b>{t("nav.brand")}</b>
          <small>{t("nav.brandMuted")}</small>
        </span>
      </Link>

      <NavSearch
        action={ADMIN_SECTIONS.checklists.path}
        label={t("nav.search")}
      />

      <div className="sidenav__list">
        <NavItem
          href={ADMIN_HOME.path}
          icon="home"
          label={t("nav.home")}
          isActive={active === "home"}
          testId="nav-home"
        />
        {ADMIN_NAV_ITEMS.map((key) => {
          const item = (
            <NavItem
              key={key}
              href={ADMIN_SECTIONS[key].path}
              icon={SECTION_ICONS[key]}
              label={t(`sections.${key}`)}
              isActive={key === active}
              testId={`nav-${key}`}
            />
          );
          // Раздел УК партнёру не показывается: адрес ему отвечает 404 (T344).
          return ADMIN_HQ_ONLY_SECTIONS.includes(key) ? (
            <HqOnly key={key}>{item}</HqOnly>
          ) : (
            item
          );
        })}
      </div>

      <div className="sidenav__foot">
        {/*
          Тема (T236, D106) и язык (#161) — управление, а не справка, поэтому стоят на
          каждом экране кабинета. Слова переводит меню, а не сами переключатели (T254):
          см. `ThemeToggle.tsx`.
        */}
        <div className={PREFS_ROW_CLASS}>
          <ThemeToggle
            labels={{
              label: t("theme.label"),
              system: t("theme.system"),
              light: t("theme.light"),
              dark: t("theme.dark"),
            }}
          />
          <LocaleToggle current={asLocale(locale)} label={t("locale.label")} />
        </div>
      </div>

      {/*
        Кто вошёл: роль — УК или партнёр (T344). Её знает разметка кабинета, меню
        получает готовой (`admin-viewer.tsx`).
      */}
      <NavViewer
        labels={{
          signedIn: t("nav.signedIn"),
          roles: { hq: t("nav.roles.hq"), partner: t("nav.roles.partner") },
        }}
      />
    </nav>
  );
}
