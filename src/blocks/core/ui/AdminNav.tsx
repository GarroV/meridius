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
  ADMIN_NAV_GROUPS,
  ADMIN_SECTIONS,
  type AdminSectionKey,
} from "../admin-sections";
import { asLocale } from "../locale";
import { LocaleToggle } from "./LocaleToggle";
import { ThemeToggle } from "./ThemeToggle";

// Ниже складки (`--page-fold`, 768 px) меню из боковой колонки становится верхней
// полосой в одну строку с собственной горизонтальной прокруткой — тот же приём, что у
// вкладок. Почему не выезжающая шторка по кнопке: шторка — это состояние, то есть
// клиентский компонент и его гидратация в КАЖДОМ экране кабинета, а без JavaScript — ещё
// и меню, которое не открывается. Полоса работает без скриптов и без состояния вообще.
const NAV_CLASS =
  "bg-surface flex flex-col gap-[var(--space-8)] border-r border-[var(--line-strong)] py-[var(--space-7)] max-md:flex-row max-md:items-center max-md:gap-[var(--space-6)] max-md:overflow-x-auto max-md:border-r-0 max-md:border-b max-md:py-[var(--space-4)]";
const GROUP_CLASS = "flex flex-col max-md:flex-row max-md:items-center";
// Подпись группы («РАБОТА», «СПРАВОЧНИК») в полосе не показывается: в одну строку
// она читалась бы как ещё один пункт меню, а место занимает как два.
const LABEL_CLASS =
  "px-[var(--space-7)] pb-[var(--space-3)] text-[length:var(--fs-micro)] leading-[var(--lh-micro)] font-semibold tracking-[var(--tracking-micro)] text-[var(--ink-3)] uppercase max-md:hidden";
// Признак активного пункта переезжает с левой грани на нижнюю: в горизонтальной полосе
// левая грань читается как разделитель между пунктами, а не как подсветка.
const ITEM_BASE_CLASS =
  "flex items-center gap-[var(--space-5)] border-l-2 px-[var(--space-7)] py-[var(--space-4)] max-md:border-b-2 max-md:border-l-0 max-md:px-[var(--space-5)] max-md:whitespace-nowrap";
const ITEM_CLASS = `${ITEM_BASE_CLASS} border-transparent text-[var(--ink-2)] no-underline hover:bg-[var(--surface-3)] hover:text-[var(--ink)]`;
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
  const locale = useLocale();

  return (
    <nav className={NAV_CLASS}>
      {/*
        Бренд — ссылка на главную кабинета (T124). До этого из раздела в главную нельзя
        было вернуться ничем, кроме кнопки браузера: меню перечисляет разделы, а главная
        разделом не является и в меню не попадает. Адрес берётся из `admin-sections`,
        а не пишется строкой, — тот же дубль вычищали трижды (T116, T118, T119).
        Вид в покое не меняется: у ссылки тот же цвет и нет подчёркивания, — отличие
        видно только наведением.
      */}
      <Link
        href={ADMIN_HOME.path}
        data-testid="nav-home"
        className="px-[var(--space-7)] text-[length:var(--fs-title)] leading-[var(--lh-title)] font-semibold tracking-[-0.01em] text-inherit no-underline hover:text-[var(--accent)] max-md:shrink-0 max-md:px-[var(--space-5)]"
      >
        {t("nav.brand")}{" "}
        {/* Приписка бренда ниже складки скрыта: в полосе она отнимает место у разделов. */}
        <span className="font-normal text-[var(--ink-3)] max-md:hidden">
          {t("nav.brandMuted")}
        </span>
      </Link>

      {ADMIN_NAV_GROUPS.map((group) => (
        <div key={group.key} className={GROUP_CLASS}>
          <div className={LABEL_CLASS}>{t(`nav.groups.${group.key}`)}</div>
          {group.items.map((key) => (
            // Переход внутри кабинета — только `Link`: обычному `<a href>` Next не
            // приставляет базовый путь площадки, и такая ссылка уводит на корень
            // адреса, где на общей площадке живёт чужой продукт (T088, D046).
            //
            // Ветки «раздел ещё не готов» здесь больше нет: библиотека блоков была
            // последним неготовым разделом и появилась вместе с блоком `library`.
            // Понадобится снова — вернётся вместе с новым разделом, а не будет висеть
            // условием, которое не может быть ложным.
            <Link
              key={key}
              className={key === active ? ITEM_ACTIVE_CLASS : ITEM_CLASS}
              href={ADMIN_SECTIONS[key].path}
              data-testid={`nav-${key}`}
              {...(key === active ? { "aria-current": "page" as const } : {})}
            >
              {t(`sections.${key}`)}
            </Link>
          ))}
        </div>
      ))}

      {/*
        Кто вошёл — справка, а не навигация, и в полосе на 375 px она съедает место у
        самих разделов. Ниже складки её нет — это плата, а не недосмотр, и она названа в журнале.
      */}
      <div className="mt-auto px-[var(--space-7)] text-[length:var(--fs-meta)] text-[var(--ink-3)] max-md:hidden">
        {t("nav.signedIn")}
        <br />
        {t("nav.role")}
      </div>

      {/*
        Переключатель темы (T236, D106) — единственное место продукта, где тема
        выбирается руками, поэтому он стоит на каждом экране кабинета сразу. Ниже
        складки он остаётся, в отличие от строки «кто вошёл»: та справка, а это
        управление, и ночная смена начинается как раз с телефона.
        Слова переводит меню, а не сам переключатель (T254): см. `ThemeToggle.tsx`.
      */}
      {/*
        Язык кабинета (#161). Стоит рядом с темой и по той же причине остаётся ниже
        складки: это управление, а не справка, и человек, открывший кабинет на чужом
        языке, ищет переключатель первым делом — в том числе с телефона.
      */}
      <LocaleToggle current={asLocale(locale)} label={t("locale.label")} />

      <ThemeToggle
        labels={{
          label: t("theme.label"),
          system: t("theme.system"),
          light: t("theme.light"),
          dark: t("theme.dark"),
        }}
      />
    </nav>
  );
}
