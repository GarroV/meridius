// Старые адреса привязки — куда они ведут теперь (T312, D163).
//
// До раздела «Станции» наклейку печатали на `/admin/qr`, а планшет привязывали на
// `/admin/devices`. Оба адреса живут в закладках, в напечатанных инструкциях и в
// ссылках других экранов, поэтому они не умирают 404, а уводят туда, где та же работа
// делается теперь: станция из адреса — на её карточку, без станции — в список станций.
// Лист QR пиццерии (`/admin/qr?store=<id>`, на него ведёт справочник) — на лист
// наклеек её станций: человек шёл печатать наклейки пиццерии, и напечатать он их
// должен, не выбирая станции заново.
//
// Адрес — ввод от кого угодно: станция берётся, только если это похоже на id.
// Мусор ведёт в список, а не на 404 несуществующей карточки.
import { STATIONS_PATH, stationHref, stickersHref } from "./view";

type SearchParams = Record<string, string | string[] | undefined>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Имя параметра станции у обоих старых адресов: `?station=<id>`. */
const STATION = "station";
/** Имя параметра пиццерии у старого листа QR: `?store=<id>`. */
const STORE = "store";

/** Значение параметра, если оно похоже на id; повторённый параметр — первое значение. */
function idParam(params: SearchParams, name: string): string | undefined {
  const raw = params[name];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value !== undefined && UUID_PATTERN.test(value) ? value : undefined;
}

/** Куда уводит старый адрес «Устройств»: станция — на карточку, иначе в список. */
export function legacyStationTarget(params: SearchParams): string {
  const stationId = idParam(params, STATION);
  return stationId === undefined ? STATIONS_PATH : stationHref(stationId);
}

/**
 * Куда уводит старый адрес листа QR. Станция важнее пиццерии: ссылка «QR» строки
 * станции несёт обе. Станции пиццерии читает тот, кто зовёт (страница в `app`), —
 * пиццерия без станций и неизвестная пиццерия ведут в список станций.
 */
export async function legacyQrTarget(
  params: SearchParams,
  stationsOfStore: (storeId: string) => Promise<readonly { id: string }[]>,
): Promise<string> {
  const stationId = idParam(params, STATION);
  if (stationId !== undefined) return stationHref(stationId);

  const storeId = idParam(params, STORE);
  if (storeId === undefined) return STATIONS_PATH;

  const stations = await stationsOfStore(storeId);
  return stations.length === 0
    ? STATIONS_PATH
    : stickersHref(stations.map((station) => station.id));
}
