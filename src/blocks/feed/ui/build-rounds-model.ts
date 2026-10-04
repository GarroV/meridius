// Сборка модели отчёта об обходах: фильтры → запросы → проходы окон → сетка → строки.
//
// Фильтры те же, что у ленты, и берутся тем же кодом: разъехавшийся разбор адреса
// означал бы, что одна и та же ссылка открывает на двух экранах разные части сети.
import type { Locale } from "@/blocks/core/locale";
import {
  scopeOf as scopeOfViewer,
  type Scope,
  type Viewer,
} from "@/blocks/auth/scope";

import type { FeedSelection } from "../model";
import { loadFeedCatalog } from "../options";
import { rangeBounds } from "../period";
import { buildRoundsDays } from "../rounds-days";
import type { RoundsCell, RoundsGridRow } from "../rounds-grid";
import { buildRoundsGrid } from "../rounds-grid";
import type {
  RoundsEmptyKind,
  RoundsReportCell,
  RoundsReportModel,
  RoundsReportRow,
} from "../rounds-model";
import type { RoundsChecklist } from "../rounds-source";
import { loadRoundsSource } from "../rounds-source";
import type { FeedScope } from "../scope";
import {
  isTimeZoneAmbiguous,
  resolveSelection,
  screenTimeZone,
} from "../selection";
import { pickText } from "../text";
import type { FeedView } from "../view";

/**
 * Самый длинный период отчёта: сетка «пункты × часы» на каждый день, и больше месяца
 * на экране не читается. Длиннее — обрезается до последнего месяца, считая от «по».
 */
const MAX_REPORT_DAYS = 31;

/** Фильтры экрана в том виде, в каком их принимают запросы: незаданное не передаётся. */
function scopeOf(selection: FeedSelection, visible: Scope): FeedScope {
  return {
    visible,
    ...(selection.countryId === null ? {} : { countryId: selection.countryId }),
    ...(selection.storeId === null ? {} : { storeId: selection.storeId }),
    ...(selection.stationId === null ? {} : { stationId: selection.stationId }),
  };
}

/**
 * Что показывает клетка. Пропуск сильнее всего остального: отчёт заводился ради
 * вопроса «в какие часы обход сыпется», и клетка, где сделано 28 из 30, обязана
 * говорить про двойку, а не про двадцать восемь.
 */
function cellOf(cell: RoundsCell | null): RoundsReportCell {
  if (cell === null) {
    return { kind: "none", done: 0, missed: 0, pending: 0 };
  }
  const kind = cell.missed > 0 ? "missed" : cell.done > 0 ? "done" : "pending";
  return { kind, done: cell.done, missed: cell.missed, pending: cell.pending };
}

function rowOf(
  row: RoundsGridRow,
  places: ReadonlyMap<string, RoundsChecklist>,
  locale: Locale,
): RoundsReportRow {
  const place = places.get(row.checklistId);
  return {
    key: row.key,
    title: pickText(row.itemTitle, locale),
    severity: row.severity,
    storeName: place?.storeName ?? "",
    stationName: place?.stationName ?? "",
    checklistTitle:
      place === undefined ? "" : pickText(place.checklistTitle, locale),
    cells: row.cells.map(cellOf),
    doneCount: row.doneCount,
    missedCount: row.missedCount,
  };
}

/**
 * Почему сетка пуста. Три причины различаются, потому что за ними стоят три разных
 * следующих шага: завести чек-лист, настроить расписание обходов или расширить период.
 */
function emptyKindOf(
  checklistCount: number,
  dayCount: number,
  rowCount: number,
): RoundsEmptyKind | null {
  if (checklistCount === 0) return "noChecklists";
  if (dayCount === 0) return "noPasses";
  if (rowCount === 0) return "noSchedule";
  return null;
}

/**
 * Модель отчёта. `now` приходит параметром, а не берётся внутри: границы «сегодня»
 * иначе невозможно проверить тестом, не подменяя системные часы.
 */
export async function buildRoundsModel(
  view: FeedView,
  locale: Locale,
  viewer: Viewer,
  now: Date = new Date(),
): Promise<RoundsReportModel> {
  const visible = scopeOfViewer(viewer);
  const catalog = await loadFeedCatalog(visible);
  const selection = resolveSelection(view, catalog, now, MAX_REPORT_DAYS);
  const timeZone = screenTimeZone(selection);
  const { from, to } = rangeBounds(selection.period, timeZone);

  const source = await loadRoundsSource(
    scopeOf(selection, visible),
    selection.period,
    now,
  );

  const days = buildRoundsDays({
    checklists: source.checklists,
    versions: source.versions,
    shiftModes: source.shiftModes,
    period: selection.period,
  });
  const grid = buildRoundsGrid(days, source.marks);

  const places = new Map(
    source.checklists.map((row) => [row.checklistId, row] as const),
  );

  return {
    selection,
    timeZone,
    timeZoneAmbiguous: isTimeZoneAmbiguous(selection),
    periodFrom: from,
    periodTo: to,
    columns: grid.columns,
    rows: grid.rows.map((row) => rowOf(row, places, locale)),
    doneCount: grid.doneCount,
    missedCount: grid.missedCount,
    strayMarkCount: grid.strayMarkCount,
    unknownTimezoneStores: source.unknownTimezoneStores,
    emptyKind: emptyKindOf(
      source.checklists.length,
      days.length,
      grid.rows.length,
    ),
  };
}
