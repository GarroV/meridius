// Пиццерия вместе со своей страной — для соседних блоков, которым пиццерию называют
// идентификатором из адреса (экраны QR), а не страной.
//
// Один запрос на вызов, а не запрос на каждую страну: раньше блок qr находил пиццерию
// перебором `listStores` по всем видимым странам, и время экрана росло со справочником
// сети — в общей тестовой базе, где стран сотни, лист печати уходил за 20 секунд (T347).
import { and, asc, count, eq } from "drizzle-orm";

import { countryCondition, type Scope } from "@/blocks/auth/scope";
import type { Locale } from "@/blocks/core/locale";
import { countries, getDb, stations, stores } from "@/blocks/data";

import type { StoreRow } from "./stores";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface StoreInCountry {
  readonly store: StoreRow;
  readonly countryName: string;
  /** Язык страны как он лежит в справочнике. */
  readonly countryLocale: Locale;
}

function selectStoresInCountries() {
  return getDb()
    .select({
      id: stores.id,
      countryId: stores.countryId,
      name: stores.name,
      timezone: stores.timezone,
      city: stores.city,
      code: stores.code,
      stationCount: count(stations.id),
      countryName: countries.name,
      countryLocale: countries.locale,
    })
    .from(stores)
    .innerJoin(countries, eq(countries.id, stores.countryId))
    .leftJoin(stations, eq(stations.storeId, stores.id))
    .$dynamic();
}

type Row = Awaited<ReturnType<typeof selectStoresInCountries>>[number];

function toStoreInCountry(row: Row): StoreInCountry {
  const { countryName, countryLocale, ...store } = row;
  return {
    store,
    countryName,
    // Безопасно: ограничение базы countries_locale не пускает в столбец ничего,
    // кроме языков продукта (та же оговорка, что в listCountries).
    countryLocale: countryLocale as Locale,
  };
}

/**
 * Пиццерия по идентификатору — только в странах области видимости (D145): чужая не
 * находится вовсе, как и несуществующая. Некорректный идентификатор — `null`, а не
 * ошибка драйвера 22P02.
 */
export async function findStoreInScope(
  storeId: string,
  scope: Scope,
): Promise<StoreInCountry | null> {
  if (!UUID_PATTERN.test(storeId)) return null;

  const [row] = await selectStoresInCountries()
    .where(
      and(eq(stores.id, storeId), countryCondition(scope, stores.countryId)),
    )
    .groupBy(stores.id, countries.id);
  return row === undefined ? null : toStoreInCountry(row);
}

/**
 * Все пиццерии видимых стран: по имени страны, внутри страны — по имени пиццерии
 * (тот же порядок, что давали `listCountries` и `listStores` друг за другом).
 */
export async function listStoresInScope(
  scope: Scope,
): Promise<StoreInCountry[]> {
  const rows = await selectStoresInCountries()
    .where(countryCondition(scope, stores.countryId))
    .groupBy(stores.id, countries.id)
    .orderBy(asc(countries.name), asc(countries.id), asc(stores.name));
  return rows.map(toStoreInCountry);
}
