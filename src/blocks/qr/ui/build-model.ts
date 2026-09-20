// Загрузка данных для экранов QR. Справочник берётся только через публичный вход
// блока `catalog`: в таблицы блок qr не ходит (контракт блоков, docs/furca/plan.md).
import {
  listCountries,
  listStations,
  listStores,
  type StoreRow,
} from "@/blocks/catalog";
import type { Locale } from "@/blocks/core/locale";
import { storeLocale } from "@/blocks/core/store-locale";

import { stationQrSvg } from "../svg";
import type {
  QrModel,
  QrScreenModel,
  QrStationView,
  QrStoreOption,
} from "./model";
import {
  CONFIRM_REISSUE,
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
  /** Язык страны пиццерии как он лежит в справочнике — сырьё для `storeLocale`. */
  readonly countryLocale: Locale;
}

/**
 * Что о запросе знает страница и не должен узнавать сам слой.
 *
 * Три факта едут вместе, потому что все три — про ОДИН запрос, и ни один из них слою
 * не добыть: адрес площадки и базовый путь приходят из окружения (D045), язык
 * устройства — из заголовка. Раньше они стояли позиционными аргументами, и третий
 * добавился бы четвёртым — то есть зовущий передавал бы `""` ради того, чтобы
 * добраться до языка.
 */
export interface QrRequest {
  /** Адрес, который попадёт внутрь кода наклейки (`https://host`). */
  readonly origin: string;
  /** Базовый путь площадки: продукт бывает опубликован не на корне адреса (D045). */
  readonly basePath?: string;
  /**
   * Заголовок `Accept-Language` запроса — язык УСТРОЙСТВА, а не ответ на вопрос о
   * языке. Решает его `core/store-locale.ts`: у известной пиццерии язык её, и это
   * звено не срабатывает вовсе. Оно нужно там, где пиццерии нет (выбор пиццерии) и
   * на случай, если правило языка однажды поменяется, — тогда меняться будет одно
   * место, а не это плюс наклейка.
   */
  readonly acceptLanguage?: string | null;
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
    if (store !== undefined) {
      return {
        store,
        countryName: country.name,
        countryLocale: country.locale,
      };
    }
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
    confirming: null,
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
  request: QrRequest,
): Promise<QrModel> {
  const { origin, basePath = "" } = request;
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
      // Язык печатных материалов этой пиццерии. Спрашивается у общего правила, а не
      // берётся полем страны: «поверхность пиццерии говорит языком своей страны» —
      // это одно решение на продукт (D122), и своя его копия здесь разошлась бы с
      // экраном заполнения молча, как уже расходились #133 и T268.
      locale: storeLocale(request.acceptLanguage, found.countryLocale),
    },
    stations,
    // Станция чужой пиццерии выбором не становится: список уже сужен до своих.
    selected: picked ?? stations[0] ?? null,
    stores: [],
    errorCode,
    // Вопрос задан ровно про ту станцию, что названа в адресе, и только если она
    // есть в ЭТОЙ пиццерии: подстановка первой станции здесь означала бы вопрос
    // про одну, а перевыпуск — у другой.
    confirming: view.confirm === CONFIRM_REISSUE ? (picked ?? null) : null,
  };
}

/** Что показывает полноэкранный QR планшета. Неизвестная станция — `null`. */
export async function buildScreenModel(
  ref: StationRef,
  request: QrRequest,
): Promise<QrScreenModel | null> {
  const { origin, basePath = "" } = request;
  const found = await findStore(ref.storeId);
  if (found === null) return null;

  const station = (await listStations(ref.storeId)).find(
    (candidate) => candidate.id === ref.stationId,
  );
  if (station === undefined) return null;

  return {
    stationName: station.name,
    storeName: found.store.name,
    // Тот же вопрос и тот же ответчик, что у печатного листа: планшет и наклейка
    // одной станции обязаны говорить на одном языке.
    locale: storeLocale(request.acceptLanguage, found.countryLocale),
    code: station.code,
    svg: stationQrSvg(station.code, origin, basePath),
    codeHref: qrCodeHref(ref),
    backHref: qrHref({ storeId: ref.storeId, stationId: ref.stationId }),
  };
}
