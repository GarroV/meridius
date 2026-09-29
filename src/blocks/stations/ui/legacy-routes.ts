// Старые адреса привязки — куда они ведут теперь (T312, D163).
//
// До раздела «Станции» наклейку печатали на `/admin/qr`, а планшет привязывали на
// `/admin/devices`. Оба адреса живут в закладках, в напечатанных инструкциях и в
// ссылках других экранов, поэтому они не умирают 404, а уводят туда, где та же работа
// делается теперь: станция из адреса — на её карточку, без станции — в список станций.
//
// Адрес — ввод от кого угодно: станция берётся, только если это похоже на id.
// Мусор ведёт в список, а не на 404 несуществующей карточки.
import { STATIONS_PATH, stationHref } from "./view";

type SearchParams = Record<string, string | string[] | undefined>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Имя параметра станции у обоих старых адресов: `?station=<id>`. */
const STATION = "station";

/** Куда уводит старый адрес с этими параметрами. */
export function legacyStationTarget(params: SearchParams): string {
  const raw = params[STATION];
  const stationId = Array.isArray(raw) ? raw[0] : raw;
  return stationId !== undefined && UUID_PATTERN.test(stationId)
    ? stationHref(stationId)
    : STATIONS_PATH;
}
