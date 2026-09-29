// Адреса раздела станций — один факт на блок.
//
// Отдельным файлом, а не строкой по месту: адреса кабинета в этом проекте вычищали
// трижды (T116, T118, T119), каждый раз блок держал собственную копию того, что уже
// лежало в `core/admin-sections`. Сторож `core/admin-paths.test.ts` ловит возврат к
// строке — он и поймал его в этом блоке на первом же экране.
import { ADMIN_SECTIONS } from "@/blocks/core/admin-sections";

/** Список станций сети. */
export const STATIONS_PATH = ADMIN_SECTIONS.stations.path;

/** Карточка одной станции. */
export function stationHref(stationId: string): string {
  return `${STATIONS_PATH}/${stationId}`;
}

/** Параметр фильтра колонки станций. Значения совпадают с именами дырок. */
export const GAP_PARAM = "gap";

/** Какие дырки можно выбрать фильтром колонки, в порядке фишек. */
export const GAP_FILTERS = ["noChecklist", "silent"] as const;

export type GapFilter = (typeof GAP_FILTERS)[number];

/** Значение из адреса — фильтр или ничего: неизвестное показывает всё, а не пустоту. */
export function asGapFilter(value: string | undefined): GapFilter | undefined {
  return GAP_FILTERS.find((name) => name === value);
}

/**
 * Форма выбора станций на экране раздела; галочки колонки ссылаются на неё атрибутом
 * `form`. У неё две кнопки: раскатать шаблон (серверное действие) и напечатать наклейки
 * (переход на лист печати с теми же галочками в адресе).
 */
export const ROLLOUT_FORM_ID = "rollout-form";

/** Имя поля галочки колонки: его читают и раскатка, и лист печати. */
export const STATION_IDS_PARAM = "stationIds";

/** Лист печати наклеек пачкой (T311). */
export const STICKERS_PATH = `${STATIONS_PATH}/stickers`;
