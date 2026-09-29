// Станции для печати наклеек пачкой — те, что отмечены галочками в колонке (T311).
//
// Своё чтение, а не справочник: справочник отдаёт станции одной пиццерии, а пачка
// набирается по всей сети — сорок станций страны за один лист, а не сорок заходов в
// раздел QR по пиццерии. Язык наклейки — язык страны пиццерии (D122), поэтому вместе со
// станцией читается и он: пачка из двух стран печатается на двух языках, каждая наклейка
// на своём.
import { asc, eq, inArray } from "drizzle-orm";

import { countries, getDb, stations, stores } from "@/blocks/data";

export interface StickerStation {
  readonly id: string;
  readonly name: string;
  readonly code: string;
  readonly codeIssuedAt: Date;
  readonly storeId: string;
  readonly storeName: string;
  readonly countryLocale: string;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Станции по списку id в порядке «страна → пиццерия → станция», как в колонке.
 *
 * Некорректный uuid отсеивается до базы (драйвер ответил бы 22P02 и экран — пятисоткой),
 * повтор схлопывается, неизвестный id просто не находится: лист печатает то, что есть,
 * а не падает из-за станции, удалённой между галочкой и печатью.
 */
export async function listStickerStations(
  ids: readonly string[],
): Promise<readonly StickerStation[]> {
  const wanted = [...new Set(ids.filter((id) => UUID_PATTERN.test(id)))];
  if (wanted.length === 0) return [];

  return (
    getDb()
      .select({
        id: stations.id,
        name: stations.name,
        code: stations.code,
        codeIssuedAt: stations.codeIssuedAt,
        storeId: stores.id,
        storeName: stores.name,
        countryLocale: countries.locale,
      })
      .from(stations)
      .innerJoin(stores, eq(stations.storeId, stores.id))
      .innerJoin(countries, eq(stores.countryId, countries.id))
      .where(inArray(stations.id, wanted))
      // `stores.id` вслед за именем: пиццерии-тёзки не перемешивают станции, и лист
      // одной пиццерии собирается подряд.
      .orderBy(
        asc(countries.name),
        asc(stores.name),
        asc(stores.id),
        asc(stations.name),
      )
  );
}
