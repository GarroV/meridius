// Фильтр экрана «Чек-листы» живёт в адресе, а не в памяти компонента: ссылкой на
// «Кухню Алматы» можно поделиться в чате, и она откроется тем же списком. Так же
// устроены фильтры ленты (`src/blocks/feed/view.ts`) — общего места для этого кода нет,
// потому что границы модулей запрещают `editor` зависеть от `feed`.
//
// Всё, что приходит из адреса, разбирается строго: это ввод от кого угодно, а не от
// нашей же формы.
// Импорты этого файла держатся пустыми нарочно: он уезжает в браузер вместе со
// списками фильтра, а `./validation` тянет за собой слой данных и драйвер базы.
import { CHECKLISTS_PATH } from "./routes";
import { isUuid } from "./uuid";

export const COUNTRY_PARAM = "country";
export const STORE_PARAM = "store";
export const STATION_PARAM = "station";

/** Значения параметров адреса. Next отдаёт их именно так: строка, список или ничего. */
export type SearchParams = Record<string, string | string[] | undefined>;

/** Чем сужен список чек-листов. Незаданное — `null`, а не пустая строка. */
export interface ChecklistFilter {
  readonly countryId: string | null;
  readonly storeId: string | null;
  readonly stationId: string | null;
}

/** Список без сужения: вся сеть. */
export const NO_FILTER: ChecklistFilter = {
  countryId: null,
  storeId: null,
  stationId: null,
};

function single(value: string | string[] | undefined): string | undefined {
  if (value === undefined) return undefined;
  // Повторённый параметр (`?store=a&store=b`) — попытка подсунуть неожиданное:
  // берём первое значение, а не склеиваем.
  return Array.isArray(value) ? value[0] : value;
}

/** Опознанный идентификатор или `null`. Мусор отбрасывается молча: это не отказ методиста. */
function uuidOrNull(value: string | string[] | undefined): string | null {
  const raw = single(value);
  return raw !== undefined && isUuid(raw) ? raw : null;
}

/** Разбирает адрес экрана «Чек-листы». Непонятное отбрасывается, экран открывается. */
export function parseChecklistFilter(params: SearchParams): ChecklistFilter {
  return {
    countryId: uuidOrNull(params[COUNTRY_PARAM]),
    storeId: uuidOrNull(params[STORE_PARAM]),
    stationId: uuidOrNull(params[STATION_PARAM]),
  };
}

/** Список чем-то сужен: от этого зависит, что показывать вместо пустой таблицы. */
export function isFilterActive(filter: ChecklistFilter): boolean {
  return (
    filter.countryId !== null ||
    filter.storeId !== null ||
    filter.stationId !== null
  );
}

/** Адрес экрана с заданным фильтром. Пустые значения в адрес не попадают. */
export function checklistsHref(filter: ChecklistFilter): string {
  const query = new URLSearchParams();
  const entries: [string, string | null][] = [
    [COUNTRY_PARAM, filter.countryId],
    [STORE_PARAM, filter.storeId],
    [STATION_PARAM, filter.stationId],
  ];

  for (const [key, value] of entries) {
    if (value !== null) query.set(key, value);
  }

  const search = query.toString();
  return search === "" ? CHECKLISTS_PATH : `${CHECKLISTS_PATH}?${search}`;
}
