// Списки фильтра и согласование выбора. Страна сужает пиццерии, пиццерия — станции;
// выбор, противоречащий сужению (пиццерия чужой страны), отбрасывается: иначе фильтры
// складываются в заведомо пустой список, и экран показывает «ничего не подошло» там,
// где подойти не могло.
//
// Справочник выводится из одного уже существующего запроса `listStations()`, а не из
// трёх новых. Побочный выигрыш: в списках оказываются только те страны и пиццерии,
// где есть хотя бы одна станция, — то есть только те, где чек-лист вообще может жить.
import type { ChecklistFilter } from "./filter";
import type { StationOption } from "./listing";

/** Пункт выпадающего списка фильтра. */
export interface FilterOption {
  readonly id: string;
  readonly name: string;
}

interface StoreFilterOption extends FilterOption {
  readonly countryId: string;
}

interface StationFilterOption extends FilterOption {
  readonly storeId: string;
}

/** Весь справочник фильтра: что вообще можно выбрать. */
export interface ChecklistFilterCatalog {
  readonly countries: readonly FilterOption[];
  readonly stores: readonly StoreFilterOption[];
  readonly stations: readonly StationFilterOption[];
}

/** Фильтр в том виде, в каком его рисует экран: согласованный выбор и суженные списки. */
export interface ChecklistFilterSelection {
  readonly filter: ChecklistFilter;
  readonly countries: readonly FilterOption[];
  readonly stores: readonly FilterOption[];
  readonly stations: readonly FilterOption[];
}

/**
 * Справочник фильтра из списка станций. Порядок не пересчитывается: станции приходят
 * из `listStations()` уже разложенными «страна → пиццерия → станция», и это ровно тот
 * порядок, в котором список читается на экране.
 */
export function buildFilterCatalog(
  stations: readonly StationOption[],
): ChecklistFilterCatalog {
  const countries = new Map<string, FilterOption>();
  const stores = new Map<string, StoreFilterOption>();

  for (const station of stations) {
    if (!countries.has(station.countryId)) {
      countries.set(station.countryId, {
        id: station.countryId,
        name: station.countryName,
      });
    }
    if (!stores.has(station.storeId)) {
      stores.set(station.storeId, {
        id: station.storeId,
        name: station.storeName,
        countryId: station.countryId,
      });
    }
  }

  return {
    countries: [...countries.values()],
    stores: [...stores.values()],
    stations: stations.map((station) => ({
      id: station.id,
      name: station.name,
      storeId: station.storeId,
    })),
  };
}

/**
 * Крошка над заголовком: где именно методист сейчас смотрит. На эталоне на её месте
 * стоит «Казахстан» — то есть выбранная страна, а не постоянная надпись. Без этого
 * сужённый список выглядит как весь список сети, и «пропавшие» чек-листы ищут заново.
 */
export function filterCrumb(
  selection: ChecklistFilterSelection,
  allLabel: string,
): string {
  const chosen: [readonly FilterOption[], string | null][] = [
    [selection.countries, selection.filter.countryId],
    [selection.stores, selection.filter.storeId],
    [selection.stations, selection.filter.stationId],
  ];

  const steps = chosen
    .map(([options, id]) => options.find((option) => option.id === id)?.name)
    .filter((name) => name !== undefined);

  return steps.length === 0 ? allLabel : steps.join(" · ");
}

function exists(options: readonly FilterOption[], id: string | null): boolean {
  return id !== null && options.some((option) => option.id === id);
}

/**
 * Ступень вверх достраивается по нижней: выбрав «Кухню Алматы», методист выбрал и
 * пиццерию, и страну. Без этого экран списка одной станции подписан «Все страны», а
 * название станции в списке остаётся путём («Алматы, Абая 44 · Кухня») и не влезает
 * в поле — обрезанное посреди слова значение прочесть нельзя.
 *
 * Достраивается только пустое: явный выбор не переписывается, поэтому несогласованную
 * пару (станция Казахстана при выбранном Узбекистане) подстановка не спасает — её
 * по-прежнему отбрасывает сужение ниже.
 */
function completeFilter(
  filter: ChecklistFilter,
  catalog: ChecklistFilterCatalog,
): ChecklistFilter {
  const station = catalog.stations.find(
    (option) => option.id === filter.stationId,
  );
  const storeId = filter.storeId ?? station?.storeId ?? null;
  const store = catalog.stores.find((option) => option.id === storeId);

  return {
    countryId: filter.countryId ?? store?.countryId ?? null,
    storeId,
    stationId: filter.stationId,
  };
}

/**
 * Раскладывает фильтр в то, что показывает экран: выбранные значения (только
 * существующие и согласованные между собой) и списки, уже суженные выбором.
 */
export function resolveChecklistFilter(
  chosen: ChecklistFilter,
  catalog: ChecklistFilterCatalog,
): ChecklistFilterSelection {
  const filter = completeFilter(chosen, catalog);
  const countryId = exists(catalog.countries, filter.countryId)
    ? filter.countryId
    : null;

  const stores = catalog.stores.filter(
    (store) => countryId === null || store.countryId === countryId,
  );
  const storeId = exists(stores, filter.storeId) ? filter.storeId : null;

  const storeIds = new Set(stores.map((store) => store.id));
  const storeNames = new Map(stores.map((store) => [store.id, store.name]));
  const stations = catalog.stations
    .filter((station) =>
      storeId === null
        ? storeIds.has(station.storeId)
        : station.storeId === storeId,
    )
    // Пока пиццерия не выбрана, «Кухня» есть в каждой, и список превращается в
    // несколько одинаковых строк — методист выбирает вслепую. Поэтому без выбранной
    // пиццерии станция названа путём, а с выбранной путь не нужен: список и так её.
    .map((station) =>
      storeId === null
        ? {
            ...station,
            name: `${storeNames.get(station.storeId) ?? ""} · ${station.name}`,
          }
        : station,
    );
  const stationId = exists(stations, filter.stationId)
    ? filter.stationId
    : null;

  return {
    filter: { countryId, storeId, stationId },
    countries: catalog.countries,
    stores,
    stations,
  };
}
