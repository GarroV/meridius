// Сборка модели экрана: один поход в базу и один расчёт выбора на запрос.
// Выбор «что показано» решается здесь, потому что он один на весь экран: три
// колонки, карточка внизу и адрес обязаны показывать одно и то же состояние.
import type { Locale } from "@/blocks/core/locale";

import { listCountries } from "../countries";
import { listStations, listUnassignedChecklists } from "../stations";
import { listStores } from "../stores";
import { listTimezones } from "../timezone";
import {
  localized,
  type CatalogModel,
  type StationItem,
  type TreeItem,
} from "./model";
import {
  catalogHref,
  qrStationsHref,
  type CatalogFocus,
  type CatalogView,
} from "./view";

/**
 * Первая страна и первая пиццерия выбираются сами, если в адресе ничего нет:
 * экран открывается наполненным, как в эталоне, а не пустым с просьбой выбрать.
 */
function pick(
  requested: string | undefined,
  available: string[],
): string | null {
  if (requested !== undefined && available.includes(requested))
    return requested;
  return available[0] ?? null;
}

function focusOf(
  view: CatalogView,
  countryId: string | null,
  storeId: string | null,
  stationId: string | null,
): CatalogFocus | null {
  if (view.focus === "station" && stationId !== null) return "station";
  if (view.focus === "country" && countryId !== null) return "country";
  if (view.focus === "store" && storeId !== null) return "store";
  // Умолчание — пиццерия: это состояние эталона, и в нём экран открывается пустым адресом.
  if (storeId !== null) return "store";
  return countryId === null ? null : "country";
}

export async function buildCatalogModel(
  view: CatalogView,
  locale: Locale,
): Promise<CatalogModel> {
  const countries = await listCountries();
  const countryId = pick(
    view.countryId,
    countries.map((country) => country.id),
  );

  const stores = countryId === null ? [] : await listStores(countryId);
  const storeId = pick(
    view.storeId,
    stores.map((store) => store.id),
  );

  const stations = storeId === null ? [] : await listStations(storeId);
  const stationId =
    view.stationId !== undefined &&
    stations.some((station) => station.id === view.stationId)
      ? view.stationId
      : null;

  const focus = focusOf(view, countryId, storeId, stationId);
  const country = countries.find((item) => item.id === countryId) ?? null;
  const store = stores.find((item) => item.id === storeId) ?? null;
  const station = stations.find((item) => item.id === stationId) ?? null;

  const countryItems: TreeItem[] = countries.map((item) => ({
    id: item.id,
    name: item.name,
    count: item.storeCount,
    selected: item.id === countryId,
    // Клик по стране меняет страну и снимает выбор пиццерии: список пиццерий другой.
    href: catalogHref({ countryId: item.id, focus: "country" }),
  }));

  const storeItems: TreeItem[] = stores.map((item) => ({
    id: item.id,
    name: item.name,
    count: item.stationCount,
    selected: item.id === storeId,
    href: catalogHref({
      countryId: item.countryId,
      storeId: item.id,
      focus: "store",
    }),
  }));

  const stationItems: StationItem[] = stations.map((item) => ({
    id: item.id,
    name: item.name,
    code: item.code,
    checklists: item.checklists.map((checklist) => ({
      id: checklist.id,
      title: localized(checklist.title, locale),
    })),
    selected: item.id === stationId,
    href: catalogHref({
      countryId: countryId ?? undefined,
      storeId: item.storeId,
      stationId: item.id,
      focus: "station",
    }),
    qrHref: qrStationsHref({ storeId: item.storeId, stationId: item.id }),
  }));

  // Полтысячи зон и список свободных чек-листов нужны только раскрытой форме:
  // грузить их на каждый показ дерева незачем.
  const needsTimezones = view.create === "store" || focus === "store";
  const needsChecklists = focus === "station";

  return {
    countries: countryItems,
    stores: storeItems,
    stations: stationItems,
    storeName: store?.name ?? null,
    countryId,
    storeId,
    stationId,
    focus,
    country:
      country === null
        ? null
        : { id: country.id, name: country.name, locale: country.locale },
    store:
      store === null || country === null
        ? null
        : {
            id: store.id,
            name: store.name,
            timezone: store.timezone,
            countryName: country.name,
            stationCount: store.stationCount,
          },
    station:
      station === null
        ? null
        : {
            id: station.id,
            name: station.name,
            code: station.code,
            codeIssuedAt: station.codeIssuedAt.toISOString(),
            checklists:
              stationItems.find((item) => item.id === station.id)?.checklists ??
              [],
          },
    create: view.create ?? null,
    confirm: view.confirm ?? null,
    errorCode: view.error ?? null,
    timezones: needsTimezones ? await listTimezones() : [],
    freeChecklists: needsChecklists
      ? (await listUnassignedChecklists()).map((checklist) => ({
          id: checklist.id,
          title: localized(checklist.title, locale),
        }))
      : [],
    hrefs: {
      // Пиццерия не выбрана — ведём в сам раздел QR: там экран предложит выбрать.
      // Неактивной кнопка не бывает ни в одном состоянии экрана (T107).
      qrStations: qrStationsHref({ storeId }),
      createCountry: catalogHref({
        countryId: countryId ?? undefined,
        storeId: storeId ?? undefined,
        create: "country",
      }),
      createStore: catalogHref({
        countryId: countryId ?? undefined,
        storeId: storeId ?? undefined,
        create: "store",
      }),
      createStation: catalogHref({
        countryId: countryId ?? undefined,
        storeId: storeId ?? undefined,
        create: "station",
      }),
      cancel: catalogHref({
        countryId: countryId ?? undefined,
        storeId: storeId ?? undefined,
        stationId: stationId ?? undefined,
        focus: focus ?? undefined,
      }),
    },
  };
}
