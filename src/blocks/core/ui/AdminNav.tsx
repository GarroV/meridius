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
import type { StaticImageData } from "next/image";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";

import {
  ADMIN_HOME,
  ADMIN_HQ_ONLY_SECTIONS,
  ADMIN_NAV_TOOLS,
  ADMIN_NAV_WORK,
  ADMIN_PHONE_MORE,
  ADMIN_PHONE_TABS,
  ADMIN_SECTIONS,
  type AdminSectionKey,
} from "../admin-sections";
import brandMarkFile from "../brand/mark-small.svg";
import { asLocale } from "../locale";
import { HqOnly, NavViewer } from "./admin-viewer";
import { Icon, type IconName } from "./Icon";
import { LocaleToggle } from "./LocaleToggle";
import { MobileSearch } from "./MobileSearch";
import { MoreSheet } from "./MoreSheet";
import { NavSearch } from "./NavSearch";
import { ThemeToggle } from "./ThemeToggle";

// Вид панели — эталон линейки, левая панель Swarm Brain (D164): марка с подписью,
// поиск с ⌘K, пункты с иконкой, текущий — мягкая заливка и полоса слева; внизу тема,
// язык и кто вошёл. Сами классы (`sidenav*`) — компонент ядра дизайн-системы, здесь
// только разметка. Ширины тоже оттуда: 216 px, а уже 1100 px — 56 px иконок, подписи
// уходят в `title`. Ниже складки (768 px) левой панели нет — как у DECIMUS и Swarm
// (T352): сверху полоса марки (`.mbar`), снизу панель разделов под большой палец
// (`.tabbar`). Вид обеих — `globals.css`, слой `components`.
//
// Пункты делятся надвое (D183, как в Swarm): рабочие — строками рейки, вспомогательные —
// пиктограммами внизу, над темой и языком, подпись — при наведении и в доступном имени.
// На телефоне — четыре таба (Главная, Станции, Статистика, «Ещё»), остальное в листе
// «Ещё» вместе с темой и языком: в полосе марки шириной 375 px рядом с поиском они не
// помещаются (марка, поиск, тема и язык — 388 px).

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

/** Вспомогательный пункт внизу рейки: пиктограмма, подпись — при наведении и для читалки. */
function ToolItem({
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
  return (
    <Link
      className="sidenav__tool"
      href={href}
      title={label}
      aria-label={label}
      data-testid={testId}
      {...(isActive ? { "aria-current": "page" as const } : {})}
    >
      <Icon name={icon} />
    </Link>
  );
}

function TabItem({
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
  return (
    <Link
      className="tabbar__item"
      href={href}
      data-testid={testId}
      {...(isActive ? { "aria-current": "page" as const } : {})}
    >
      <Icon name={icon} />
      <span>{label}</span>
    </Link>
  );
}

// Next объявляет `*.svg` как `any` (на случай SVGR); у нас это обычный статический файл.
const brandMark = brandMarkFile as StaticImageData;

/**
 * Знак продукта — «Глитч-мрамор», малый уровень (D185). Один и тот же в панели и в
 * полосе. Файл — копия раскатки из forma (`dodo/brand/`), здесь не правится.
 *
 * Картинкой, а не встроенным SVG: знак держит свои `id` (литера, полосы обрезки), и две
 * встроенные копии на странице — панель и полоса — делили бы одни и те же `id`. Адрес
 * даёт статический импорт: Next сам приставляет базовый путь площадки (D045), а файл
 * едет в `.next/static`, который образ копирует, — в отличие от `public/`.
 * `alt` пустой: имя марки рядом произносит ссылка.
 */
function BrandLogo({
  className,
}: {
  readonly className: string;
}): ReactElement {
  return (
    <img
      className={className}
      src={brandMark.src}
      width={brandMark.width}
      height={brandMark.height}
      alt=""
      data-testid="brand-mark"
    />
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
  const brand = t("nav.brand");
  const brandName = `${brand} ${t("nav.brandMuted")}`;
  const themeLabels = {
    label: t("theme.label"),
    system: t("theme.system"),
    light: t("theme.light"),
    dark: t("theme.dark"),
  };
  const item = (key: AdminSectionKey) => ({
    key,
    href: ADMIN_SECTIONS[key].path,
    icon: SECTION_ICONS[key],
    label: t(`sections.${key}`),
  });
  const home = {
    key: "home",
    href: ADMIN_HOME.path,
    icon: "home",
    label: t("nav.home"),
  } as const;
  const work = [home, ...ADMIN_NAV_WORK.map(item)];
  const tools = ADMIN_NAV_TOOLS.map(item);
  const tabs = [home, ...ADMIN_PHONE_TABS.map(item)];
  const more = ADMIN_PHONE_MORE.map(item);
  const isMoreActive = more.some(({ key }) => key === active);
  // Раздел УК партнёру не показывается: адрес ему отвечает 404 (T344).
  const visibleTo = (
    key: AdminNavActive,
    element: ReactElement,
  ): ReactElement =>
    key !== "home" && ADMIN_HQ_ONLY_SECTIONS.includes(key) ? (
      <HqOnly key={key}>{element}</HqOnly>
    ) : (
      element
    );
  const prefs = (testIdPrefix = ""): ReactElement => (
    // Тема (T236, D106) и язык (#161) — две капсулы ядра одной строкой, без подписей.
    <div className="sidenav__prefs">
      <ThemeToggle labels={themeLabels} testIdPrefix={testIdPrefix} />
      <LocaleToggle
        current={asLocale(locale)}
        label={t("locale.label")}
        testIdPrefix={testIdPrefix}
      />
    </div>
  );

  return (
    <>
      {/* Полоса телефона (ниже складки): марка и поиск пиктограммой, как шапка Swarm. */}
      <header className="mbar" data-testid="admin-mbar">
        <Link
          href={ADMIN_HOME.path}
          className="mbar__brand"
          data-testid="mbar-brand"
          aria-label={brandName}
        >
          <BrandLogo className="mbar__logo" />
          <span>{brand}</span>
        </Link>
        <span className="mbar__spacer" />
        <MobileSearch
          action={ADMIN_SECTIONS.checklists.path}
          label={t("nav.search")}
        />
      </header>
      <nav
        className="sidenav md:sticky md:top-0 md:h-screen"
        aria-label={brand}
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
          aria-label={brandName}
        >
          <BrandLogo className="sidenav__logo" />
          <span className="sidenav__name">
            <b>{brand}</b>
            <small>{t("nav.brandMuted")}</small>
          </span>
        </Link>

        <NavSearch
          action={ADMIN_SECTIONS.checklists.path}
          label={t("nav.search")}
        />

        <div className="sidenav__list">
          {work.map(({ key, href, icon, label }) => (
            <NavItem
              key={key}
              href={href}
              icon={icon}
              label={label}
              isActive={key === active}
              testId={`nav-${key}`}
            />
          ))}
        </div>

        <div className="sidenav__foot">
          {/*
          Тема и язык — управление, а не справка, поэтому стоят на каждом экране
          кабинета. Слова переводит меню, а не сами переключатели (T254).
        */}
          {prefs()}
          {/*
          Вспомогательные разделы (D183) — строкой пиктограмм, как «Настройки» и «Админ»
          у Swarm. Подпись — в `title` (при наведении) и в `aria-label`: без неё ссылка
          из одной картинки для читалки безымянна.
        */}
          <div className="sidenav__tools" data-testid="nav-tools">
            {tools.map(({ key, href, icon, label }) =>
              visibleTo(
                key,
                <ToolItem
                  key={key}
                  href={href}
                  icon={icon}
                  label={label}
                  isActive={key === active}
                  testId={`nav-${key}`}
                />,
              ),
            )}
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

      {/* Нижняя панель телефона: четыре таба, остальное — в листе «Ещё» (D183). */}
      <nav className="tabbar" aria-label={brand} data-testid="admin-tabbar">
        {tabs.map(({ key, href, icon, label }) => (
          <TabItem
            key={key}
            href={href}
            icon={icon}
            label={label}
            isActive={key === active}
            testId={`tab-${key}`}
          />
        ))}
        <MoreSheet
          label={t("nav.more")}
          title={t("nav.moreTitle")}
          closeLabel={t("nav.close")}
          isActive={isMoreActive}
        >
          <div className="sheet__list">
            {more.map(({ key, href, icon, label }) =>
              visibleTo(
                key,
                <Link
                  key={key}
                  href={href}
                  className="sheet__item"
                  data-testid={`more-${key}`}
                  {...(key === active
                    ? { "aria-current": "page" as const }
                    : {})}
                >
                  <Icon name={icon} />
                  <span>{label}</span>
                </Link>,
              ),
            )}
          </div>
          <div className="sheet__prefs">{prefs("more-")}</div>
        </MoreSheet>
      </nav>
    </>
  );
}
