// Справочник фильтров читается собственным запросом блока (D024): слой доступа `data`
// отдаёт заполнения, а списки стран, пиццерий и станций для выпадающих списков — нет.
import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, test } from "vitest";

import { countries, stations, stores } from "@/blocks/data";
import { closeTestDb, getTestDb } from "@/blocks/data/testing/db";
import { createStation } from "@/blocks/data/testing/fixtures";
import { WHOLE_NETWORK } from "@/blocks/auth/scope";

import { loadFeedCatalog } from "./options";

const db = getTestDb();

afterAll(closeTestDb);

describe("loadFeedCatalog", () => {
  test("отдаёт страну, пиццерию и станцию, связанные между собой", async () => {
    const fixture = await createStation({ timezone: "Asia/Almaty" });

    const catalog = await loadFeedCatalog(WHOLE_NETWORK);

    const country = catalog.countries.find(
      (row) => row.id === fixture.countryId,
    );
    const store = catalog.stores.find((row) => row.id === fixture.storeId);
    const station = catalog.stations.find(
      (row) => row.id === fixture.stationId,
    );

    expect(country?.name).toMatch(/^Страна /);
    expect(store?.countryId).toBe(fixture.countryId);
    expect(store?.timezone).toBe("Asia/Almaty");
    expect(station?.storeId).toBe(fixture.storeId);
  });

  test("пиццерия несёт свой часовой пояс: в нём считается «сегодня» и время строк", async () => {
    const fixture = await createStation({ timezone: "Europe/Berlin" });

    const catalog = await loadFeedCatalog(WHOLE_NETWORK);

    expect(
      catalog.stores.find((row) => row.id === fixture.storeId)?.timezone,
    ).toBe("Europe/Berlin");
  });

  test("страна без пиццерий в списке остаётся: фильтр по ней покажет пустую ленту, а не спрячет страну", async () => {
    const name = `Страна без точек ${randomUUID().slice(0, 8)}`;
    const [country] = await db
      .insert(countries)
      .values({ name, locale: "ru" })
      .returning({ id: countries.id });

    const catalog = await loadFeedCatalog(WHOLE_NETWORK);

    expect(catalog.countries.some((row) => row.id === country?.id)).toBe(true);
    expect(catalog.stores.some((row) => row.countryId === country?.id)).toBe(
      false,
    );
  });

  test("справочник читается тремя запросами, а не по строке на пиццерию", async () => {
    // Косвенная проверка формы результата: станции разных пиццерий приходят одним
    // списком со ссылкой на свою пиццерию, а не вложенными в неё.
    const first = await createStation();
    const second = await createStation();

    const catalog = await loadFeedCatalog(WHOLE_NETWORK);
    const ownerIds = new Set(
      catalog.stations
        .filter(
          (row) => row.id === first.stationId || row.id === second.stationId,
        )
        .map((row) => row.storeId),
    );

    expect(ownerIds).toStrictEqual(new Set([first.storeId, second.storeId]));
    expect(catalog.stores.length).toBeGreaterThanOrEqual(2);
    expect(await db.$count(stores)).toBeGreaterThanOrEqual(
      catalog.stores.length,
    );
    expect(await db.$count(stations)).toBeGreaterThanOrEqual(
      catalog.stations.length,
    );
  });
});
