import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import type { ReactElement } from "react";

import { AdminShell } from "@/blocks/core/ui/AdminShell";
import type { LocalizedText } from "@/blocks/data";

import { submitDuplicate } from "../actions";
import { isFilterActive, type ChecklistFilter } from "../filter";
import {
  buildFilterCatalog,
  filterCrumb,
  resolveChecklistFilter,
} from "../filter-options";
import { listChecklists, listStations, type ChecklistRow } from "../listing";
import {
  CHECKLISTS_PATH,
  checklistDeletePath,
  checklistPath,
  NEW_CHECKLIST_PATH,
} from "../routes";
import { ChecklistFilters } from "./ChecklistFilters";

/**
 * Экран «Чек-листы» (эталон `docs/forge/design/screens/templates.html`): выбор страны,
 * пиццерии и станции над таблицей чек-листов, сгруппированных по пиццерии. Данные и
 * порядок строк уже разложены `listChecklists()` (страна → пиццерия → станция) — экран
 * их не пересчитывает и не переставляет, только рисует и вставляет разделители групп.
 */

type Translate = Awaited<ReturnType<typeof getTranslations>>;

const CARD_CLASS =
  "bg-surface rounded-[var(--r-block)] border border-[var(--line-strong)] shadow-[var(--sh-xs)]";
const TABLE_CLASS =
  "w-full border-collapse text-[length:var(--fs-dense)] leading-[var(--lh-dense)]";
const TH_CLASS =
  "border-b border-[var(--line-strong)] bg-[var(--surface-3)] px-[var(--cell-pad-x)] py-[var(--space-4)] text-left text-[length:var(--fs-micro)] font-semibold tracking-[var(--tracking-micro)] text-[var(--ink-2)] uppercase whitespace-nowrap";
const TD_CLASS =
  "border-b border-[var(--line)] px-[var(--cell-pad-x)] py-[var(--space-5)] align-middle";
const NUM_TD_CLASS = `${TD_CLASS} text-right font-[family-name:var(--font-num)] [font-variant-numeric:tabular-nums]`;
const TR_CLASS = "hover:bg-[var(--surface-2)]";
const GROUP_ROW_CLASS =
  "bg-[var(--surface-2)] px-[var(--cell-pad-x)] py-[var(--space-4)] text-[length:var(--fs-micro)] font-semibold tracking-[var(--tracking-micro)] text-[var(--ink-3)] uppercase";
const BTN_PRIMARY_CLASS =
  "bg-accent inline-flex h-[var(--control-h)] items-center justify-center gap-[var(--space-4)] rounded-[var(--r-control)] border border-[var(--accent)] px-[var(--space-6)] text-[length:var(--fs-body)] font-medium text-[var(--ink-inverse)] no-underline hover:border-[var(--accent-hover)] hover:bg-[var(--accent-hover)]";
const BTN_GHOST_SM_CLASS =
  "inline-flex h-[var(--control-h-sm)] items-center justify-center gap-[var(--space-4)] rounded-[var(--r-control)] border border-transparent bg-transparent px-[var(--space-5)] text-[length:var(--fs-dense)] font-medium text-[var(--ink-2)] no-underline hover:bg-[var(--surface-3)] hover:text-ink";
const BTN_GHOST_DANGER_SM_CLASS =
  "inline-flex h-[var(--control-h-sm)] items-center justify-center gap-[var(--space-4)] rounded-[var(--r-control)] border border-transparent bg-transparent px-[var(--space-5)] text-[length:var(--fs-dense)] font-medium text-err no-underline hover:bg-[var(--err-soft)]";
const TAG_BASE =
  "inline-flex h-[20px] items-center rounded-[var(--r-mark)] border px-[var(--space-4)] text-[length:var(--fs-micro)] font-semibold tracking-[var(--tracking-micro)] whitespace-nowrap uppercase";
const TAG_OK = `${TAG_BASE} border-[var(--ok-line)] bg-[var(--ok-soft)] text-[var(--ok)]`;
const TAG_DRAFT = `${TAG_BASE} border-[var(--line-strong)] bg-[var(--surface-3)] text-[var(--st-draft)]`;

const NO_STORE_GROUP_KEY = "\u0000no-store";
const COLUMN_COUNT = 7;

/** Название на языке интерфейса; если его нет — первое, что есть (черновик мог начаться на другом языке). */
function pickText(text: LocalizedText, locale: string): string {
  return text[locale] ?? Object.values(text)[0] ?? "";
}

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

/** Ключ группы «страна · пиццерия»; без станции — общий ключ, группа уходит в конец (порядок строк уже такой). */
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

function VersionTags({
  row,
  t,
}: {
  readonly row: ChecklistRow;
  readonly t: Translate;
}): ReactElement {
  return (
    <span className="inline-flex items-center gap-[var(--space-2)]">
      {row.publishedNumber !== null ? (
        <span className={TAG_OK}>{`v${String(row.publishedNumber)}`}</span>
      ) : null}
      {row.hasDraft ? (
        <span className={TAG_DRAFT}>{t("list.draftTag")}</span>
      ) : null}
    </span>
  );
}

function ChecklistTableRow({
  row,
  t,
  locale,
}: {
  readonly row: ChecklistRow;
  readonly t: Translate;
  readonly locale: string;
}): ReactElement {
  return (
    <tr data-testid="checklist-row" className={TR_CLASS}>
      <td className={TD_CLASS}>
        <Link
          href={checklistPath(row.id)}
          className="text-accent no-underline hover:underline"
        >
          {pickText(row.title, locale)}
        </Link>
      </td>
      <td className={TD_CLASS}>
        {row.stationName ?? (
          <span className="text-[var(--ink-3)]">{t("list.noStation")}</span>
        )}
      </td>
      <td className={TD_CLASS}>{formatWindow(row, t)}</td>
      <td className={TD_CLASS}>
        <VersionTags row={row} t={t} />
      </td>
      <td className={NUM_TD_CLASS}>{row.itemCount}</td>
      <td className={NUM_TD_CLASS}>{row.submissions7d}</td>
      <td className={`${TD_CLASS} text-right whitespace-nowrap`}>
        <div className="inline-flex items-center gap-[var(--space-4)]">
          <Link href={checklistPath(row.id)} className={BTN_GHOST_SM_CLASS}>
            {t("list.edit")}
          </Link>
          <form action={submitDuplicate}>
            <input type="hidden" name="checklistId" value={row.id} />
            <button
              type="submit"
              data-testid="duplicate-checklist"
              className={BTN_GHOST_SM_CLASS}
            >
              {t("list.duplicate")}
            </button>
          </form>
          {/* Ссылка на подтверждение, а не сразу действие: последствие зависит от истории
              заполнений, и назвать его надо до нажатия, а не после. */}
          <Link
            href={checklistDeletePath(row.id)}
            data-testid="delete-checklist"
            className={BTN_GHOST_DANGER_SM_CLASS}
          >
            {t("list.delete")}
          </Link>
        </div>
      </td>
    </tr>
  );
}

/** Тело таблицы: строки чек-листов вперемешку с разделителями групп, но без перестановки. */
function TableBody({
  rows,
  t,
  locale,
}: {
  readonly rows: readonly ChecklistRow[];
  readonly t: Translate;
  readonly locale: string;
}): ReactElement {
  const elements: ReactElement[] = [];
  let lastKey: string | null = null;

  for (const row of rows) {
    const key = groupKey(row);
    if (key !== lastKey) {
      elements.push(
        <tr key={`group-${key}`}>
          <td colSpan={COLUMN_COUNT} className={GROUP_ROW_CLASS}>
            {groupLabel(row, t)}
          </td>
        </tr>,
      );
      lastKey = key;
    }
    elements.push(
      <ChecklistTableRow key={row.id} row={row} t={t} locale={locale} />,
    );
  }

  return <>{elements}</>;
}

const EMPTY_BODY_CLASS =
  "flex flex-col items-center gap-[var(--space-5)] px-[var(--space-8)] py-[var(--space-10)] text-center text-[var(--ink-2)]";
const EMPTY_TITLE_CLASS =
  "m-0 text-[length:var(--fs-title)] font-semibold text-ink";

function EmptyState({ t }: { readonly t: Translate }): ReactElement {
  return (
    <div className={CARD_CLASS}>
      <div className={EMPTY_BODY_CLASS}>
        <p className={EMPTY_TITLE_CLASS}>{t("list.empty")}</p>
        <p className="m-0">{t("list.emptyHint")}</p>
        <Link href={NEW_CHECKLIST_PATH} className={BTN_PRIMARY_CLASS}>
          {t("list.new")}
        </Link>
      </div>
    </div>
  );
}

/**
 * Под фильтр ничего не подошло. Отдельное состояние, а не «чек-листов пока нет»:
 * второе звало бы заводить новый чек-лист там, где методист просто выбрал не ту
 * станцию, — и он завёл бы дубль уже существующего.
 */
function FilteredEmptyState({ t }: { readonly t: Translate }): ReactElement {
  return (
    <div className={CARD_CLASS} data-testid="checklists-filtered-empty">
      <div className={EMPTY_BODY_CLASS}>
        <p className={EMPTY_TITLE_CLASS}>{t("list.filterEmpty")}</p>
        <p className="m-0">{t("list.filterEmptyHint")}</p>
        <Link
          href={CHECKLISTS_PATH}
          data-testid="checklists-filter-reset"
          className={BTN_GHOST_SM_CLASS}
        >
          {t("list.filterReset")}
        </Link>
      </div>
    </div>
  );
}

/** Таблица чек-листов, а если их нет — то, почему нет: список пуст или пуст под фильтром. */
function ListBody({
  rows,
  hasFilter,
  t,
  locale,
}: {
  readonly rows: readonly ChecklistRow[];
  readonly hasFilter: boolean;
  readonly t: Translate;
  readonly locale: string;
}): ReactElement {
  if (rows.length === 0) {
    return hasFilter ? <FilteredEmptyState t={t} /> : <EmptyState t={t} />;
  }

  return (
    <div className={CARD_CLASS}>
      <div className="overflow-x-auto">
        <table className={TABLE_CLASS}>
          <thead>
            <tr>
              <th className={TH_CLASS}>{t("list.columnTitle")}</th>
              <th className={TH_CLASS}>{t("list.columnStation")}</th>
              <th className={TH_CLASS}>{t("list.columnWindow")}</th>
              <th className={TH_CLASS}>{t("list.columnVersion")}</th>
              <th className={TH_CLASS}>{t("list.columnItems")}</th>
              <th className={TH_CLASS}>{t("list.columnSubmissions")}</th>
              <th className={TH_CLASS} />
            </tr>
          </thead>
          <tbody>
            <TableBody rows={rows} t={t} locale={locale} />
          </tbody>
        </table>
      </div>
    </div>
  );
}

export async function ChecklistsScreen({
  filter,
}: {
  readonly filter: ChecklistFilter;
}): Promise<ReactElement> {
  const t = await getTranslations("editor");
  const locale = await getLocale();

  // Справочник читается до списка, а не рядом с ним: выбор из адреса сначала проверяется
  // справочником (несуществующая пиццерия из старой ссылки выпадает), и только
  // проверенный уходит в запрос. Параллельное чтение сузило бы список по выбору,
  // которого экран потом не покажет.
  const selection = resolveChecklistFilter(
    filter,
    buildFilterCatalog(await listStations()),
  );
  const rows = await listChecklists(selection.filter);
  const hasFilter = isFilterActive(selection.filter);

  return (
    <AdminShell
      testId="checklists-screen"
      active="checklists"
      breadcrumb={filterCrumb(selection, t("list.crumbs"))}
      title={t("list.title")}
      topbarAction={
        <Link
          href={NEW_CHECKLIST_PATH}
          data-testid="new-checklist"
          className={BTN_PRIMARY_CLASS}
        >
          {t("list.new")}
        </Link>
      }
    >
      {/* Фильтровать нечем, пока в сети нет ни одной станции: три списка с одним
          пунктом «Все» — это шум на пустом продукте, а не вход в редактор. */}
      {selection.stations.length > 0 ? (
        <ChecklistFilters selection={selection} />
      ) : null}
      <ListBody rows={rows} hasFilter={hasFilter} t={t} locale={locale} />
    </AdminShell>
  );
}
