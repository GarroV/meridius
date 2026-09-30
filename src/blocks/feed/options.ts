// Справочник для фильтров ленты: страны, пиццерии и станции одним чтением.
//
// Запрос свой, а не заказанный у блока `data`: слой доступа отдаёт заполнения, а списки
// для выпадающих списков — это уже дело экрана (D024). В базу блок при этом ходит только
// через `getDb()` и схему из `data`, как и все остальные.
import { eq } from "drizzle-orm";

import { getDb, countries, stations, stores } from "@/blocks/data";
import { countryCondition, type Scope } from "@/blocks/auth/scope";

import type { FeedStationOption, FeedStoreOption, FilterOption } from "./model";

export interface FeedCatalog {
  readonly countries: readonly FilterOption[];
  readonly stores: readonly FeedStoreOption[];
  readonly stations: readonly FeedStationOption[];
}

/**
 * Весь справочник сети целиком: страны, пиццерии и станции — три запроса.
 *
 * Именно целиком, а не по выбранной стране: выпадающие списки показывают всё, чтобы
 * управляющий мог переключиться, не сбрасывая фильтр. Объём — справочник сети (десятки
 * строк на пилоте), и он не растёт вместе с историей заполнений.
 */
export async function loadFeedCatalog(scope: Scope): Promise<FeedCatalog> {
  const db = getDb();

  // Выпадающие списки — только видимые страны (D145): выбор экрана берётся отсюда, и
  // чужой идентификатор в адресе просто не находится.
  const [countryRows, storeRows, stationRows] = await Promise.all([
    db
      .select({ id: countries.id, name: countries.name })
      .from(countries)
      .where(countryCondition(scope, countries.id)),
    db
      .select({
        id: stores.id,
        name: stores.name,
        countryId: stores.countryId,
        timezone: stores.timezone,
      })
      .from(stores)
      .where(countryCondition(scope, stores.countryId)),
    db
      .select({
        id: stations.id,
        name: stations.name,
        storeId: stations.storeId,
      })
      .from(stations)
      .innerJoin(stores, eq(stores.id, stations.storeId))
      .where(countryCondition(scope, stores.countryId)),
  ]);

  return { countries: countryRows, stores: storeRows, stations: stationRows };
}

/**
 * Часовой пояс пиццерии, которой принадлежит станция: в нём показывается время
 * карточки. Карточке весь справочник ни к чему — одна станция и один джойн.
 * Неизвестная станция даёт `null`, а не исключение: карточка всё равно откроется.
 */
export async function stationTimeZone(
  stationId: string,
): Promise<string | null> {
  const [row] = await getDb()
    .select({ timezone: stores.timezone })
    .from(stations)
    .innerJoin(stores, eq(stations.storeId, stores.id))
    .where(eq(stations.id, stationId));

  return row?.timezone ?? null;
}
