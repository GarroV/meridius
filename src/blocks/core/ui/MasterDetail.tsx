"use client";

// Каркас раздела «список слева — рабочая зона справа» (D162, D163).
//
// Владелец: «слева столбец чеклистов, а справа уже рабочая зона чеклиста. чтобы не было
// скачков через страницу, это раздражает». Каркас ставится в разметку СЕГМЕНТА
// (`src/app/admin/<раздел>/layout.tsx`): Next не перерисовывает разметку при переходе
// между её страницами, поэтому меню и колонка списка остаются теми же узлами DOM —
// с той же прокруткой и тем же вводом в поиске, — а меняется только `children` справа.
//
// Какой элемент открыт, каркас узнаёт по сегменту адреса под собой
// (`useSelectedLayoutSegment`): разметке сегмента параметров дочерних страниц Next не
// отдаёт. От этого зависят две вещи.
// - Ниже складки двум колонкам места нет: без выбранного элемента виден список, с
//   выбранным — рабочая зона и ссылка назад к списку. Эталон мастер-детали Decimus
//   (`.mx-rail`) прячет колонку так же.
// - Сегменты `wide` рисуются без колонки и со своим пунктом меню: шаблон открывается
//   тем же редактором по адресу чек-листа (T309), но в список чек-листов не входит, и
//   колонка чек-листов рядом с ним звала бы не туда.
//
// Вводный блок раздела (D152, T316) выше складки стоит в пустой рабочей зоне — его
// ставит страница раздела. Ниже складки этой зоны без выбранного элемента не видно вовсе,
// и человек с телефона не узнал бы, зачем раздел: там блок стоит над колонкой списка.
// Каркас получает его готовой разметкой (`intro`): он клиентский, а блок — серверный.
import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";
import type { ReactElement, ReactNode } from "react";

import { Icon } from "./Icon";
import { ADMIN_CONTENT_ID, SkipLink } from "./SkipLink";

/**
 * Три колонки: меню (ширину задаёт ядро, `.sidenav`), список, рабочая зона. Ширина
 * списка — 18rem, как у колонки мастер-детали Decimus: токена ширины колонки в ядре нет,
 * а одинаковая колонка в двух продуктах линейки — прямое требование D164.
 */
const FRAME_CLASS =
  "grid min-h-screen items-start grid-cols-[auto_18rem_minmax(0,1fr)] max-md:grid-cols-[minmax(0,1fr)] max-md:grid-rows-[auto_1fr]";
const WIDE_FRAME_CLASS =
  "grid min-h-screen items-start grid-cols-[auto_minmax(0,1fr)] max-md:grid-cols-[minmax(0,1fr)] max-md:grid-rows-[auto_1fr]";
// Колонка липнет к верху и прокручивается своей прокруткой: длинный список сети не
// утаскивает за собой рабочую зону, и выбранная строка остаётся там, где её нажали.
// Ниже складки над колонкой стоит полоса меню (D092), и колонка — просто часть страницы.
const RAIL_CLASS =
  "bg-surface flex min-w-0 flex-col border-[var(--line)] md:sticky md:top-0 md:h-screen md:overflow-y-auto md:border-r";
const BACK_CLASS =
  "bg-surface flex items-center gap-[var(--space-3)] border-b border-[var(--line)] px-[var(--space-7)] py-[var(--space-5)] text-[length:var(--fs-dense)] font-medium text-[var(--ink-2)] no-underline hover:text-ink md:hidden";

export interface MasterDetailProps {
  readonly testId: string;
  /** Меню кабинета с подсвеченным разделом — готовой разметкой с сервера. */
  readonly nav: ReactNode;
  /** Колонка списка. */
  readonly rail: ReactNode;
  /** Название колонки для чтеца: ориентир между меню и содержимым. */
  readonly railLabel: string;
  /** Куда ведёт «назад к списку» ниже складки и как это подписано. */
  readonly backHref: string;
  readonly backLabel: string;
  /** Вводный блок раздела над колонкой — только ниже складки и только без выбора. */
  readonly intro?: ReactNode;
  /** Сегменты, открытые без колонки, и меню для них. */
  readonly wide?:
    | { readonly segments: readonly string[]; readonly nav: ReactNode }
    | undefined;
  readonly children: ReactNode;
}

export function MasterDetail({
  testId,
  nav,
  rail,
  railLabel,
  backHref,
  backLabel,
  intro,
  wide,
  children,
}: MasterDetailProps): ReactElement {
  const segment = useSelectedLayoutSegment();
  const hasDetail = segment !== null;
  const isWide =
    segment !== null && (wide?.segments.includes(segment) ?? false);

  return (
    <div
      data-testid={testId}
      data-detail={hasDetail ? "open" : "none"}
      className={isWide ? WIDE_FRAME_CLASS : FRAME_CLASS}
    >
      <SkipLink />
      {isWide ? wide?.nav : nav}

      {isWide ? null : (
        <aside
          aria-label={railLabel}
          data-testid="master-rail"
          className={`${RAIL_CLASS}${hasDetail ? " max-md:hidden" : ""}`}
        >
          {intro !== undefined && !hasDetail ? (
            <div
              className="px-[var(--space-6)] pt-[var(--space-6)] md:hidden"
              data-testid="master-intro"
            >
              {intro}
            </div>
          ) : null}
          {rail}
        </aside>
      )}

      {/*
        `<main>` — рабочая зона, и ссылка-пропуск ведёт сюда, мимо меню и списка: к
        содержимому, ради которого человек пришёл. `tabIndex={-1}` — чтобы фокус ушёл
        вслед за прокруткой (см. `AdminShell`).
      */}
      <main
        id={ADMIN_CONTENT_ID}
        tabIndex={-1}
        data-testid="admin-main"
        className={`flex min-w-0 flex-col focus:outline-none${hasDetail || isWide ? "" : " max-md:hidden"}`}
      >
        {hasDetail && !isWide ? (
          <Link
            href={backHref}
            className={BACK_CLASS}
            data-testid="master-back"
          >
            <Icon name="cleft" className="size-4 flex-none" />
            {backLabel}
          </Link>
        ) : null}
        {children}
      </main>
    </div>
  );
}
