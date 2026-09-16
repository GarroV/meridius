// Загрузка данных для экранов QR. Справочник берётся только через публичный вход
// блока `catalog`: в таблицы блок qr не ходит (контракт блоков, docs/furca/plan.md).
import {
  listCountries,
  listStations,
  listStores,
  type StoreRow,
} from "@/blocks/catalog";

import { stationQrSvg } from "../svg";
import type {
  QrModel,
  QrScreenModel,
  QrStationView,
  QrStoreOption,
} from "./model";
import {
  qrHref,
  qrScreenHref,
  qrCodeHref,
  type QrErrorCode,
  type QrView,
  type StationRef,
} from "./view";

interface FoundStore {
  readonly store: StoreRow;
  readonly countryName: string;
}

/**
 * Пиццерия и страна, которой она принадлежит.
 *
 * Справочник умеет отдавать пиццерии страны, но не пиццерию по её идентификатору,
 * поэтому страны перебираются. Перебор идёт по справочнику сети (десятки строк),
 * а не по станциям, и происходит один раз на открытие экрана — опрос планшета
 * сюда не заходит.
 */
async function findStore(storeId: string): Promise<FoundStore | null> {
  for (const country of await listCountries()) {
    const stores = await listStores(country.id);
    const store = stores.find((candidate) => candidate.id === storeId);
    if (store !== undefined) return { store, countryName: country.name };
  }
  return null;
}

/** Все пиццерии сети с их странами — список выбора, когда пиццерия не задана. */
async function listAllStores(): Promise<QrStoreOption[]> {
  const options: QrStoreOption[] = [];

  for (const country of await listCountries()) {
    for (const store of await listStores(country.id)) {
      options.push({
        id: store.id,
        name: store.name,
        countryName: country.name,
        stationCount: store.stationCount,
        href: qrHref({ storeId: store.id }),
      });
    }
  }

  return options;
}

/** Экран без выбранной пиццерии: список пиццерий вместо листа. */
async function chooseStore(
  origin: string,
  errorCode: QrErrorCode | null,
): Promise<QrModel> {
  return {
    scanOrigin: origin,
    store: null,
    stations: [],
    selected: null,
    stores: await listAllStores(),
    errorCode,
  };
}

async function stationViews(
  storeId: string,
  origin: string,
  basePath: string,
): Promise<QrStationView[]> {
  const stations = await listStations(storeId);

  return stations.map((station) => ({
    id: station.id,
    name: station.name,
    code: station.code,
    codeIssuedAt: station.codeIssuedAt,
    svg: stationQrSvg(station.code, origin, basePath),
    screenHref: qrScreenHref({ storeId, stationId: station.id }),
  }));
}

/**
 * Что показывает экран печати листа.
 *
 * `origin` приходит снаружи (его знает страница, а не слой): в наклейку обязан
 * попасть тот адрес, по которому продукт открыт, иначе камера уведёт в никуда.
 */
export async function buildQrModel(
  view: QrView,
  origin: string,
  basePath = "",
): Promise<QrModel> {
  const errorCode = view.error ?? null;
  const storeId = view.storeId;

  if (storeId === undefined) {
    return chooseStore(origin, errorCode);
  }

  const found = await findStore(storeId);
  // Пиццерии с таким идентификатором нет: показываем выбор, а не пустой лист
  // с чужой шапкой.
  if (found === null) return chooseStore(origin, errorCode);

  const stations = await stationViews(storeId, origin, basePath);
  const picked = stations.find((station) => station.id === view.stationId);

  return {
    scanOrigin: origin,
    store: {
      id: found.store.id,
      name: found.store.name,
      countryName: found.countryName,
      timezone: found.store.timezone,
    },
    stations,
    // Станция чужой пиццерии выбором не становится: список уже сужен до своих.
    selected: picked ?? stations[0] ?? null,
    stores: [],
    errorCode,
  };
}

/** Что показывает полноэкранный QR планшета. Неизвестная станция — `null`. */
export async function buildScreenModel(
  ref: StationRef,
  origin: string,
  basePath = "",
): Promise<QrScreenModel | null> {
  const found = await findStore(ref.storeId);
  if (found === null) return null;

  const station = (await listStations(ref.storeId)).find(
    (candidate) => candidate.id === ref.stationId,
  );
  if (station === undefined) return null;

  return {
    stationName: station.name,
    storeName: found.store.name,
    code: station.code,
    svg: stationQrSvg(station.code, origin, basePath),
    codeHref: qrCodeHref(ref),
    backHref: qrHref({ storeId: ref.storeId, stationId: ref.stationId }),
  };
}
