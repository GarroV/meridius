// Модель экрана справочника: то, что страница уже посчитала, а разметка только
// рисует. Компоненты не ходят в базу, не разбирают адрес и не выбирают язык —
// иначе один и тот же вопрос («какая пиццерия выбрана») решался бы в трёх местах.
import type { Locale } from "@/blocks/core/locale";
import type { LocalizedText } from "@/blocks/data";

import type { CatalogErrorCode } from "../errors";
import type { TimezoneOption } from "../timezone";
import type { CatalogConfirmKind, CatalogFocus, CatalogFormKind } from "./view";

/** Строка колонки дерева: страна или пиццерия. */
export interface TreeItem {
  id: string;
  name: string;
  /**
   * Число вложенных строк: пиццерий у страны, станций у пиццерии. Числом, а не
   * текстом: подпись к нему («3 станции») склоняется по-разному в разных языках,
   * и собирать её обязан словарь, а не расчёт модели.
   */
  count: number;
  selected: boolean;
  href: string;
}

export interface StationChecklistItem {
  id: string;
  /** Название на языке экрана: выбор языка сделан страницей, а не разметкой. */
  title: string;
}

export interface StationItem {
  id: string;
  name: string;
  code: string;
  /** Пустой список — станция без назначенного чек-листа, экран помечает её явно. */
  checklists: StationChecklistItem[];
  selected: boolean;
  href: string;
  /** Кнопка «QR» строки: раздел QR с этой станцией выбранной. */
  qrHref: string;
}

export interface CountryDetail {
  id: string;
  name: string;
  locale: Locale;
}

export interface StoreDetail {
  id: string;
  name: string;
  /** Пояс как он лежит в базе, даже если база его уже не признаёт (T102). */
  timezone: string;
  /**
   * Знает ли PostgreSQL этот пояс. `false` — пиццерия записана мимо справочника
   * (сид, миграция, правка руками): публичный маршрут её станций падает на каждом
   * сканировании, и карточка обязана сказать об этом вслух, а не подставить молча
   * первую зону по алфавиту (D060).
   */
  timezoneKnown: boolean;
  countryName: string;
  stationCount: number;
}

export interface StationDetail {
  id: string;
  name: string;
  code: string;
  codeIssuedAt: string;
  checklists: StationChecklistItem[];
}

/** Ссылки, которые экран не собирает сам: их считает страница. */
interface CatalogHrefs {
  /** Раскрыть форму создания (кнопки «+» в шапках колонок). */
  createCountry: string;
  createStore: string;
  createStation: string;
  /** Свернуть любую форму создания или подтверждение. */
  cancel: string;
  /** Кнопка верхней полосы: коды станций выбранной пиццерии в разделе QR. */
  qrStations: string;
}

export interface CatalogModel {
  countries: TreeItem[];
  stores: TreeItem[];
  stations: StationItem[];
  /** Имя выбранной пиццерии для заголовка третьей колонки; null — не выбрана. */
  storeName: string | null;
  countryId: string | null;
  storeId: string | null;
  stationId: string | null;
  focus: CatalogFocus | null;
  country: CountryDetail | null;
  store: StoreDetail | null;
  station: StationDetail | null;
  create: CatalogFormKind | null;
  confirm: CatalogConfirmKind | null;
  errorCode: CatalogErrorCode | null;
  timezones: TimezoneOption[];
  /** Чек-листы, не привязанные ни к одной станции: их предлагает форма привязки. */
  freeChecklists: StationChecklistItem[];
  hrefs: CatalogHrefs;
}

/**
 * Название на языке экрана. Запасной путь — второй язык продукта, затем любое
 * заполненное значение: пустая строка вместо названия чек-листа хуже чужого языка.
 */
export function localized(text: LocalizedText, locale: Locale): string {
  const own = text[locale];
  if (own !== undefined && own !== "") return own;

  for (const value of Object.values(text)) {
    if (value !== "") return value;
  }
  return "";
}
