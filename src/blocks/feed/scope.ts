// Область видимости экранов блока: страна, пиццерия, станция — и то, как она ложится
// в условия запроса.
//
// Лежит отдельно от тревог и отчёта, потому что нужна обоим. Две копии этих условий
// разъехались бы молча: оба запроса продолжали бы что-то показывать, просто разное —
// а полоса тревог и сетка обходов на одном и том же фильтре обязаны смотреть на одну
// и ту же часть сети.
import type { SQL } from "drizzle-orm";
import { and, countDistinct, eq, isNull, sql } from "drizzle-orm";

import { getDb, stations, stores, timezoneNames } from "@/blocks/data";

/** Фильтры экрана в том виде, в каком их принимают запросы: незаданное не передаётся. */
export interface FeedScope {
  readonly countryId?: string;
  readonly storeId?: string;
  readonly stationId?: string;
}

export function scopeConditions(scope: FeedScope): SQL[] {
  const conditions: SQL[] = [];
  if (scope.countryId !== undefined) {
    conditions.push(eq(stores.countryId, scope.countryId));
  }
  if (scope.storeId !== undefined) {
    conditions.push(eq(stores.id, scope.storeId));
  }
  if (scope.stationId !== undefined) {
    conditions.push(eq(stations.id, scope.stationId));
  }
  return conditions;
}

/**
 * Пояс пиццерии, найденный в справочнике самой базы. Сравнение без учёта регистра:
 * PostgreSQL принимает имя зоны так, и `utc` в справочнике не должен выглядеть
 * незнакомым.
 *
 * Присоединение по имени, а не перевод по `stores.timezone` напрямую: эти выборки
 * идут по многим пиццериям сразу, и одно незнакомое базе имя роняло бы весь запрос —
 * то есть экран управляющего целиком. С присоединённым именем такая пиццерия выпадает
 * из условий и попадает в отдельный счёт, который экран показывает вслух.
 */
export const ZONE_MATCHES = sql`lower(${timezoneNames.name}) = lower(${stores.timezone})`;

/**
 * Пиццерии в этих фильтрах, чей часовой пояс база не знает. Их обходы и тревоги
 * посчитать нечем: без пояса неизвестно, кончились ли местные сутки и закрылось ли
 * окно. Число отдаётся наружу и показывается, а не прячется, — иначе сломанная
 * строка справочника тихо вычитала бы пиццерию из надзора (T062).
 */
export async function countUnknownTimezoneStores(
  scope: FeedScope,
): Promise<number> {
  const [row] = await getDb()
    .select({ stores: countDistinct(stores.id) })
    .from(stations)
    .innerJoin(stores, eq(stations.storeId, stores.id))
    .leftJoin(timezoneNames, ZONE_MATCHES)
    .where(and(...scopeConditions(scope), isNull(timezoneNames.name)));

  return row?.stores ?? 0;
}
