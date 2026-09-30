// Публичный вход в блок catalog. Отсюда справочник берут соседние блоки:
// `qr` — код станции и его перевыпуск, `demo` — заведение показательного контура,
// `scripts/import-network.mjs` — план импорта справочника сети.
// Внутренние файлы блока (запросы, разметка экрана) наружу не выставляются.
export type { CountryRow } from "./countries";
export {
  createCountry,
  deleteCountry,
  listCountries,
  updateCountry,
} from "./countries";

export type { StoreRow } from "./stores";
export {
  countStationsOfStore,
  createStore,
  deleteStore,
  listStores,
  updateStore,
} from "./stores";

export type {
  ExistingStore,
  NetworkStore,
  StoreCreate,
  StoreImportPlan,
  StoreUpdate,
} from "./network-plan";
export {
  NetworkPlanError,
  planStoreImport,
  readNetworkStore,
} from "./network-plan";

export type { StationChecklist, StationCode, StationRow } from "./stations";
export {
  assignChecklist,
  createStation,
  deleteStation,
  detachChecklist,
  listStations,
  listUnassignedChecklists,
  reissueStationCode,
  updateStation,
} from "./stations";

export {
  STATION_CODE_ALPHABET,
  STATION_CODE_LENGTH,
  generateStationCode,
} from "./station-code";

export type { TimezoneOption } from "./timezone";
export {
  assertKnownTimezone,
  isKnownTimezone,
  listTimezones,
} from "./timezone";

export type { CatalogErrorCode } from "./errors";
export {
  CATALOG_ERROR_CODES,
  CatalogError,
  isCatalogErrorCode,
} from "./errors";
