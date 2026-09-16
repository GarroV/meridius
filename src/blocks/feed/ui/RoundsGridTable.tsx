import { getTranslations } from "next-intl/server";
import type { ReactElement } from "react";

import type {
  RoundsReportCell,
  RoundsReportModel,
  RoundsReportRow,
} from "../rounds-model";

/**
 * Сетка «пункты × часы обхода». Прямого эталона у экрана нет (он новый), но приёмы
 * карточки и таблицы повторяют `FeedTable.tsx`.
 *
 * Таблица растёт с числом часов в периоде и почти всегда шире экрана телефона. Скролл
 * поэтому заперт ВНУТРИ `rounds-scroller`, а не отдан странице: у `overflow-x-auto` в
 * обычном потоке ширина блока определяется контейнером (а не содержимым), и `<table>`
 * внутри может быть сколь угодно широк — прокручивается он сам, наружу это не течёт.
 * Единственное, от чего это зависит выше по дереву, — чтобы ни один предок не решил
 * посчитать свою ширину «по содержимому»: `AdminShell` уже несёт `min-w-0` на колонке
 * грида ровно за этим (иначе грид-колонка отказывается сжиматься уже там).
 *
 * Первая колонка (пункт) держится `sticky left-0`: при прокрутке по часам должно быть
 * видно, о каком пункте речь, иначе управляющий листает часы и теряет строку. Таблица
 * при этом собрана на `border-separate` + `border-spacing-0`, а не на общем для блока
 * `border-collapse`: `position: sticky` на `<td>`/`<th>` вместе с `border-collapse`
 * ломается в части браузеров (застывшая колонка перестаёт липнуть) — здесь она обязана
 * работать, поэтому одна хайрлайн-граница вместо схлопнутой.
 *
 * Цвет в клетках запрещён: тревожный цвет значит что-то ровно в одном месте всего
 * блока — в полосе тревог ленты (`AlarmStrip`). Пропуск здесь — число, а не краска.
 */

// `min-w-0` и `overflow-hidden` на самой карточке — не украшение: без них карточка
// берёт ширину по содержимому, то есть по таблице, и переполнение уходит выше по
// дереву, утаскивая вбок всю страницу. Замерено в браузере на 375 px: страница была
// шире окна на 24 px, и уезжали шапка с фильтрами, а не таблица.
const CARD_CLASS =
  "bg-surface min-w-0 overflow-hidden rounded-[var(--r-block)] border border-[var(--line-strong)] shadow-[var(--sh-xs)]";
const HEAD_CLASS =
  "flex items-center gap-[var(--space-6)] rounded-t-[var(--r-block)] border-b border-[var(--line)] bg-[var(--surface-3)] px-[var(--space-7)] py-[var(--space-6)]";
const TITLE_CLASS =
  "text-[length:var(--fs-title)] leading-[var(--lh-title)] font-semibold";
const TOTALS_CLASS = "ml-auto text-[length:var(--fs-meta)] text-[var(--ink-3)]";
// Единственное место, где стоит `overflow-x-auto`, — скролл заперт здесь и не доходит
// до `<body>` (см. пояснение в шапке файла).
const SCROLLER_CLASS = "max-w-full overflow-x-auto";
const TABLE_CLASS =
  "w-max border-separate border-spacing-0 text-[length:var(--fs-dense)] leading-[var(--lh-dense)]";
const TH_BASE =
  "border-b border-[var(--line-strong)] bg-[var(--surface-3)] px-[var(--cell-pad-x)] py-[var(--space-4)] text-[length:var(--fs-micro)] leading-[var(--lh-micro)] font-semibold tracking-[var(--tracking-micro)] text-[var(--ink-2)] uppercase whitespace-nowrap";
const TH_ITEM_CLASS = `${TH_BASE} sticky left-0 z-10 border-r border-[var(--line-strong)] text-left`;
const TH_HOUR_CLASS = `${TH_BASE} text-center`;
const TD_BASE =
  "border-b border-[var(--line)] px-[var(--cell-pad-x)] py-[var(--space-5)] align-middle";
const TD_ITEM_CLASS = `${TD_BASE} bg-surface sticky left-0 z-10 border-r border-[var(--line-strong)]`;
const TD_META_CLASS = "text-[length:var(--fs-meta)] text-[var(--ink-3)]";
const TD_CELL_CLASS = `${TD_BASE} text-center font-[family-name:var(--font-num)] text-[length:var(--fs-num)] [font-variant-numeric:tabular-nums] whitespace-nowrap`;
const LEGEND_CLASS =
  "flex flex-wrap gap-[var(--space-6)] px-[var(--space-7)] py-[var(--space-5)] text-[length:var(--fs-meta)] text-[var(--ink-3)]";

type Translate = Awaited<ReturnType<typeof getTranslations>>;

/** Что напечатано в клетке: пропуск — числом, а не значком тревоги. */
function cellText(cell: RoundsReportCell): string {
  switch (cell.kind) {
    case "none":
      return "—";
    case "done":
      return "✓";
    case "missed":
      return String(cell.missed);
    case "pending":
      return "…";
  }
}

/** `aria-label` проговаривает смысл символа словами — иначе скринридер прочтёт «два». */
function cellLabel(cell: RoundsReportCell, t: Translate): string {
  switch (cell.kind) {
    case "none":
      return t("report.cellNone");
    case "done":
      return t("report.cellDone", { done: cell.done });
    case "missed":
      return t("report.cellMissed", {
        missed: cell.missed,
        total: cell.done + cell.missed,
      });
    case "pending":
      return t("report.cellPending");
  }
}

function RoundsRow({
  row,
  columns,
  t,
}: {
  readonly row: RoundsReportRow;
  readonly columns: readonly string[];
  readonly t: Translate;
}): ReactElement {
  return (
    <tr data-testid="rounds-row">
      <td className={TD_ITEM_CLASS}>
        {row.title}
        <div className={TD_META_CLASS}>
          {[row.storeName, row.stationName, row.checklistTitle].join(" · ")}
        </div>
      </td>
      {/* Идём по `columns` (стабильные подписи часов), а не по `row.cells`: ключом
          обязан быть час, а не позиция в массиве, и час же служит запасной клеткой
          на случай прочерка в `noUncheckedIndexedAccess` — по контракту сетки длины
          совпадают всегда (rounds-grid.ts), запасная клетка здесь только для типов. */}
      {columns.map((column, index) => {
        const cell = row.cells[index] ?? {
          kind: "none" as const,
          done: 0,
          missed: 0,
          pending: 0,
        };
        return (
          <td
            key={column}
            className={TD_CELL_CLASS}
            data-testid="rounds-cell"
            data-kind={cell.kind}
            aria-label={cellLabel(cell, t)}
          >
            {cellText(cell)}
          </td>
        );
      })}
      <td className={TD_CELL_CLASS}>{row.doneCount}</td>
      <td className={TD_CELL_CLASS}>{row.missedCount}</td>
    </tr>
  );
}

export async function RoundsGridTable({
  model,
}: {
  readonly model: RoundsReportModel;
}): Promise<ReactElement> {
  const t = await getTranslations("feed");

  return (
    <div className={CARD_CLASS} data-testid="rounds-table">
      <div className={HEAD_CLASS}>
        <h2 className={TITLE_CLASS}>{t("report.tableTitle")}</h2>
        <span className={TOTALS_CLASS} data-testid="rounds-totals">
          {t("report.totals", {
            done: model.doneCount,
            missed: model.missedCount,
          })}
        </span>
      </div>

      <div className={SCROLLER_CLASS} data-testid="rounds-scroller">
        <table className={TABLE_CLASS}>
          <thead>
            <tr>
              <th className={TH_ITEM_CLASS}>{t("report.item")}</th>
              {model.columns.map((column) => (
                <th key={column} className={TH_HOUR_CLASS}>
                  {column}
                </th>
              ))}
              <th className={TH_HOUR_CLASS}>{t("report.doneColumn")}</th>
              <th className={TH_HOUR_CLASS}>{t("report.missedColumn")}</th>
            </tr>
          </thead>
          <tbody>
            {model.rows.map((row) => (
              <RoundsRow
                key={row.key}
                row={row}
                columns={model.columns}
                t={t}
              />
            ))}
          </tbody>
        </table>
      </div>

      <p className={LEGEND_CLASS} data-testid="rounds-legend">
        <span>✓ — {t("report.legendDone")}</span>
        <span>2 — {t("report.legendMissed")}</span>
        <span>… — {t("report.legendPending")}</span>
        <span>— — {t("report.legendNone")}</span>
      </p>
    </div>
  );
}
