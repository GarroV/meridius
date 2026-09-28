// Сужение колонки чек-листов (D162): фильтры страны, пиццерии и станции (T075) плюс
// поиск по названию из левой панели (`?q=`, D164).
//
// Сужает клиент, а не база: колонка стоит в разметке сегмента, до которой параметры
// адреса не доходят, а поход на сервер ради сужения пересобрал бы рабочую зону справа
// вместе с несохранённой правкой. Правила сужения при этом те же, что у запроса
// (`listing.ts`): выбор согласуется справочником (`resolveChecklistFilter`) до того,
// как сузит список, — пиццерия чужой страны отбрасывается, а не даёт пустоту.
//
// Импорты — только чистые модули: файл уезжает в браузер вместе с колонкой, а
// `./listing` тянет за собой драйвер базы (поэтому оттуда — только типы).
import {
  COUNTRY_PARAM,
  STATION_PARAM,
  STORE_PARAM,
  parseChecklistFilter,
  type ChecklistFilter,
} from "./filter";
import type { ChecklistRow } from "./listing";
import { pickEditorText } from "./localized-text";

/** Поиск по названию. Имя параметра — то же, что шлёт поиск левой панели. */
export const QUERY_PARAM = "q";

/** Параметры адреса, которыми сужена колонка, в порядке их записи в адрес. */
export const RAIL_KEYS: readonly string[] = [
  COUNTRY_PARAM,
  STORE_PARAM,
  STATION_PARAM,
  QUERY_PARAM,
];

/**
 * Длиннее — обрезается. Поиск идёт по названиям в пару десятков символов, а строка
 * из адреса — ввод от кого угодно: сравнивать с ней каждую строку списка незачем.
 */
const MAX_QUERY_LENGTH = 100;

export interface RailQuery {
  readonly filter: ChecklistFilter;
  /** Искомое как ввели, без краевых пробелов; пусто — не ищем. */
  readonly q: string;
}

/** Разбор значений адреса: мусор в идентификаторах отбрасывается, как на сервере. */
export function railQueryFrom(
  values: Readonly<Record<string, string>>,
): RailQuery {
  return {
    filter: parseChecklistFilter(values),
    q: (values[QUERY_PARAM] ?? "").trim().slice(0, MAX_QUERY_LENGTH),
  };
}

/** Обратно в значения адреса: пустое не пишется. */
export function railValues(query: RailQuery): Record<string, string> {
  const values: Record<string, string> = {};
  const entries: [string, string | null][] = [
    [COUNTRY_PARAM, query.filter.countryId],
    [STORE_PARAM, query.filter.storeId],
    [STATION_PARAM, query.filter.stationId],
    [QUERY_PARAM, query.q === "" ? null : query.q],
  ];
  for (const [key, value] of entries) {
    if (value !== null) values[key] = value;
  }
  return values;
}

/**
 * Ищется название на языке кабинета и путь «страна · пиццерия · станция»: методист
 * помнит чек-лист то по имени («Открытие»), то по месту («Абая»), и второе в списке
 * сети из одинаковых «Открытий» — единственное, что их различает. Без учёта регистра.
 */
function matchesQuery(row: ChecklistRow, q: string, locale: string): boolean {
  if (q === "") return true;
  const needle = q.toLocaleLowerCase(locale);
  const haystack = [
    pickEditorText(row.title, locale),
    row.countryName,
    row.storeName,
    row.stationName,
  ]
    .filter((part) => part !== null)
    .join(" ")
    .toLocaleLowerCase(locale);
  return haystack.includes(needle);
}

function matchesFilter(row: ChecklistRow, filter: ChecklistFilter): boolean {
  if (filter.countryId !== null && row.countryId !== filter.countryId) {
    return false;
  }
  if (filter.storeId !== null && row.storeId !== filter.storeId) return false;
  return filter.stationId === null || row.stationId === filter.stationId;
}

/**
 * Строки колонки под сужение. Фильтр ждётся УЖЕ согласованным справочником; порядок
 * строк не меняется — его задала база (страна → пиццерия → станция), и группы колонки
 * держатся на нём.
 */
export function narrowChecklists(
  rows: readonly ChecklistRow[],
  filter: ChecklistFilter,
  q: string,
  locale: string,
): readonly ChecklistRow[] {
  return rows.filter(
    (row) => matchesFilter(row, filter) && matchesQuery(row, q, locale),
  );
}
