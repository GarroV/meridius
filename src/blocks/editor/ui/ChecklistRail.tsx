"use client";

// Колонка чек-листов слева от рабочей зоны (D162): поиск, фильтры страны, пиццерии и
// станции (T075) и сам список, сгруппированный по пиццерии.
//
// Живёт в разметке сегмента `/admin/checklists` (`src/app/admin/checklists/layout.tsx`),
// поэтому при выборе другого чек-листа она не перерисовывается: остаются и прокрутка, и
// набранный поиск. Строка — обычный текст цвета `--ink`, нажимается вся; наведение —
// фон `--surface-2`, выбранная — `--accent-soft` с полосой слева, как текущий пункт
// левой панели и строки Swarm (D164). Синих ссылок в списке нет: список читается как
// перечень, а не как абзац со ссылками («не подчеркнутые гиперсылки», D162).
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useSelectedLayoutSegment } from "next/navigation";
import type { ReactElement } from "react";

import { formActionPath } from "@/blocks/core/base-path";
import { Icon } from "@/blocks/core/ui/Icon";
import {
  RAIL_ROW_META_CLASS,
  RAIL_ROW_NAME_CLASS,
  railRowClass,
} from "@/blocks/core/ui/rail-row";
import { useStickyQuery } from "@/blocks/core/ui/use-sticky-query";

import { COUNTRY_PARAM, STATION_PARAM, STORE_PARAM } from "../filter";
import {
  resolveChecklistFilter,
  type ChecklistFilterCatalog,
} from "../filter-options";
import type { ChecklistRow } from "../listing";
import { pickEditorText } from "../localized-text";
import {
  narrowChecklists,
  QUERY_PARAM,
  RAIL_KEYS,
  railQueryFrom,
  railValues,
} from "../rail-filter";
import { checklistPath, NEW_CHECKLIST_PATH } from "../routes";
import { ChecklistFilterSelects } from "./ChecklistFilterSelects";

const HEAD_CLASS =
  "bg-surface sticky top-0 z-[1] flex flex-col gap-[var(--space-5)] border-b border-[var(--line)] px-[var(--space-6)] pt-[var(--space-7)] pb-[var(--space-6)]";
const TITLE_CLASS =
  "text-[length:var(--fs-title)] leading-[var(--lh-title)] font-semibold text-ink";
const COUNT_CLASS =
  "font-[family-name:var(--font-num)] text-[length:var(--fs-meta)] text-[var(--ink-3)] [font-variant-numeric:tabular-nums]";
// Поле поиска — тот же вид, что поиск левой панели (`.sidenav__field` ядра): одна
// форма поля на экране, а не две похожие.
const SEARCH_CLASS = "sidenav__field";
const LIST_CLASS =
  "flex flex-col gap-[var(--space-1)] px-[var(--space-4)] py-[var(--space-4)]";
const GROUP_CLASS =
  "px-[var(--space-5)] pt-[var(--space-6)] pb-[var(--space-2)] text-[length:var(--fs-micro)] leading-[var(--lh-micro)] font-semibold tracking-[var(--tracking-micro)] text-[var(--ink-3)] uppercase first:pt-[var(--space-2)]";
// Строка — общая строка колонки ядра (`core/ui/rail-row.ts`, T353): та же, что у
// станций, выбранная — как текущий пункт левой панели. Здесь только кольцо фокуса:
// строка чек-листа сама ссылка.
const ROW_FOCUS_CLASS =
  "focus-visible:shadow-[inset_0_0_0_2px_var(--accent)] focus-visible:outline-none";
const TAG_BASE =
  "inline-flex h-[18px] items-center rounded-[var(--r-mark)] border px-[var(--space-3)] text-[length:var(--fs-micro)] font-semibold tracking-[var(--tracking-micro)] whitespace-nowrap uppercase";
const TAG_OK = `${TAG_BASE} border-[var(--ok-line)] bg-[var(--ok-soft)] text-[var(--ok)]`;
const TAG_DRAFT = `${TAG_BASE} border-[var(--line-strong)] bg-[var(--surface-3)] text-[var(--st-draft)]`;
const EMPTY_CLASS =
  "flex flex-col items-start gap-[var(--space-4)] px-[var(--space-5)] py-[var(--space-8)] text-[length:var(--fs-dense)] leading-[var(--lh-dense)] text-[var(--ink-2)]";
const EMPTY_TITLE_CLASS = "m-0 font-semibold text-ink";
const RESET_CLASS =
  "inline-flex h-[var(--control-h-sm)] cursor-pointer items-center rounded-[var(--r-control)] border border-[var(--line-control)] bg-surface px-[var(--space-5)] text-[length:var(--fs-dense)] font-medium text-ink hover:bg-[var(--surface-2)]";
const APPLY_CLASS = RESET_CLASS;

const NO_STORE_GROUP_KEY = "\u0000no-store";

export interface ChecklistRailProps {
  /** Весь список сети в порядке базы: страна → пиццерия → станция. */
  readonly rows: readonly ChecklistRow[];
  readonly catalog: ChecklistFilterCatalog;
}

type Translate = ReturnType<typeof useTranslations<"editor">>;

function trimSeconds(time: string): string {
  return time.slice(0, 5);
}

/** «06:00–11:00» через `windowCustom`, а не собственным дефисом: направление тире — забота словаря. */
function formatWindow(row: ChecklistRow, t: Translate): string {
  if (row.windowStart === "00:00:00" && row.windowEnd === "24:00:00") {
    return t("form.windowAny");
  }
  return t("form.windowCustom", {
    start: trimSeconds(row.windowStart),
    end: trimSeconds(row.windowEnd),
  });
}

function groupKey(row: ChecklistRow): string {
  if (row.countryName === null || row.storeName === null) {
    return NO_STORE_GROUP_KEY;
  }
  return `${row.countryName}\u0000${row.storeName}`;
}

function groupLabel(row: ChecklistRow, t: Translate): string {
  if (row.countryName === null || row.storeName === null) {
    return t("list.noStore");
  }
  return `${row.countryName} · ${row.storeName}`;
}

function RailRow({
  row,
  href,
  isCurrent,
  locale,
  t,
}: {
  readonly row: ChecklistRow;
  readonly href: string;
  readonly isCurrent: boolean;
  readonly locale: string;
  readonly t: Translate;
}): ReactElement {
  return (
    <Link
      href={href}
      data-testid="checklist-row"
      className={`${railRowClass(isCurrent, "column")} ${ROW_FOCUS_CLASS}`}
      {...(isCurrent ? { "aria-current": "page" as const } : {})}
    >
      <span className={RAIL_ROW_NAME_CLASS}>
        {pickEditorText(row.title, locale)}
      </span>
      <span className={RAIL_ROW_META_CLASS}>
        <span>{row.stationName ?? t("list.noStation")}</span>
        <span aria-hidden="true">·</span>
        <span>{formatWindow(row, t)}</span>
        <span aria-hidden="true">·</span>
        <span>{t("rail.items", { count: row.itemCount })}</span>
        {row.publishedNumber !== null ? (
          <span className={TAG_OK}>{`v${String(row.publishedNumber)}`}</span>
        ) : null}
        {row.hasUnpublishedChanges ? (
          <span className={TAG_DRAFT}>{t("list.draftTag")}</span>
        ) : null}
      </span>
    </Link>
  );
}

/** Строки вперемешку с подписями групп, без перестановки: порядок задала база. */
function RailRows({
  rows,
  current,
  suffix,
  locale,
  t,
}: {
  readonly rows: readonly ChecklistRow[];
  readonly current: string | null;
  readonly suffix: string;
  readonly locale: string;
  readonly t: Translate;
}): ReactElement {
  const elements: ReactElement[] = [];
  let lastKey: string | null = null;

  for (const row of rows) {
    const key = groupKey(row);
    if (key !== lastKey) {
      elements.push(
        <div key={`group-${key}`} className={GROUP_CLASS}>
          {groupLabel(row, t)}
        </div>,
      );
      lastKey = key;
    }
    elements.push(
      <RailRow
        key={row.id}
        row={row}
        href={`${checklistPath(row.id)}${suffix}`}
        isCurrent={row.id === current}
        locale={locale}
        t={t}
      />,
    );
  }

  return <>{elements}</>;
}

export function ChecklistRail({
  rows,
  catalog,
}: ChecklistRailProps): ReactElement {
  const t = useTranslations("editor");
  const locale = useLocale();
  const pathname = usePathname();
  const current = useSelectedLayoutSegment();
  const { values, update, suffix } = useStickyQuery(RAIL_KEYS);
  const searchLabel = t("rail.search");

  const query = railQueryFrom(values);
  const selection = resolveChecklistFilter(query.filter, catalog);
  const shown = narrowChecklists(rows, selection.filter, query.q, locale);
  const isNarrowed = shown.length !== rows.length;

  function pick(name: string, value: string): void {
    // Выбор уровня выше снимает выбор ниже: пиццерия чужой страны и так отпала бы при
    // согласовании, а оставшаяся станция подставила бы свою пиццерию обратно, и снять
    // «Пиццерию» было бы нельзя, не сняв сначала станцию.
    const lower: Record<string, readonly string[]> = {
      [COUNTRY_PARAM]: [STORE_PARAM, STATION_PARAM],
      [STORE_PARAM]: [STATION_PARAM],
    };
    const cleared = new Set(lower[name] ?? []);
    const next = Object.fromEntries(
      Object.entries({ ...railValues(query), [name]: value }).filter(
        ([key]) => !cleared.has(key),
      ),
    );
    update(next);
  }

  return (
    <div className="flex min-h-0 flex-col" data-testid="checklist-rail">
      <div className={HEAD_CLASS}>
        <div className="flex items-center gap-[var(--space-4)]">
          <h2 className={TITLE_CLASS}>{t("list.title")}</h2>
          <span className={COUNT_CLASS} data-testid="checklist-rail-count">
            {isNarrowed
              ? t("rail.countNarrowed", {
                  shown: shown.length,
                  total: rows.length,
                })
              : String(rows.length)}
          </span>
          <Link
            href={NEW_CHECKLIST_PATH}
            data-testid="new-checklist"
            className="icon-btn ml-auto size-[var(--control-h-sm)]"
            aria-label={t("rail.new")}
            title={t("rail.new")}
          >
            <Icon name="plus" />
          </Link>
        </div>

        {/*
          Обычная GET-форма на текущий адрес: без JavaScript поиск и фильтры работают
          отправкой (кнопка в `<noscript>`). С JavaScript отправки нет вовсе — сужение
          применяется на лету и пишется в адрес без перехода (`useStickyQuery`).
        */}
        <form
          method="get"
          action={formActionPath(pathname)}
          role="search"
          data-testid="checklist-filters"
          className="flex flex-col gap-[var(--space-4)]"
          onSubmit={(event) => {
            event.preventDefault();
          }}
        >
          <label className={SEARCH_CLASS} title={searchLabel}>
            <Icon name="search" />
            <input
              type="search"
              name={QUERY_PARAM}
              value={values[QUERY_PARAM] ?? ""}
              placeholder={searchLabel}
              aria-label={searchLabel}
              data-testid="checklist-search"
              onChange={(event) => {
                update({
                  ...railValues(query),
                  [QUERY_PARAM]: event.currentTarget.value,
                });
              }}
            />
          </label>
          {/* Фильтровать нечем, пока в сети нет ни одной станции: три списка с одним
              пунктом «Все» — это шум на пустом продукте. */}
          {catalog.stations.length > 0 ? (
            <ChecklistFilterSelects
              selection={selection}
              onPick={pick}
              labels={{
                country: t("list.filterCountry"),
                store: t("list.filterStore"),
                station: t("list.filterStation"),
                all: t("list.filterAll"),
              }}
            />
          ) : null}
          <noscript>
            <button type="submit" className={APPLY_CLASS}>
              {t("list.filterApply")}
            </button>
          </noscript>
        </form>
      </div>

      <div className={LIST_CLASS}>
        {rows.length === 0 ? (
          <div className={EMPTY_CLASS} data-testid="checklists-empty">
            <p className={EMPTY_TITLE_CLASS}>{t("list.empty")}</p>
            <p className="m-0">{t("list.emptyHint")}</p>
          </div>
        ) : shown.length === 0 ? (
          // Под сужение ничего не подошло. Отдельное состояние, а не «чек-листов пока
          // нет»: второе звало бы заводить новый там, где методист просто выбрал не ту
          // станцию, — и он завёл бы дубль уже существующего.
          <div className={EMPTY_CLASS} data-testid="checklists-filtered-empty">
            <p className={EMPTY_TITLE_CLASS}>{t("list.filterEmpty")}</p>
            <p className="m-0">{t("list.filterEmptyHint")}</p>
            <button
              type="button"
              data-testid="checklists-filter-reset"
              className={RESET_CLASS}
              onClick={() => {
                update({});
              }}
            >
              {t("list.filterReset")}
            </button>
          </div>
        ) : (
          <RailRows
            rows={shown}
            current={current}
            suffix={suffix}
            locale={locale}
            t={t}
          />
        )}
      </div>
    </div>
  );
}
