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
