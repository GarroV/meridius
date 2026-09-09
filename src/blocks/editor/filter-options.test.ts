// Списки фильтра сужают друг друга: страна — пиццерии, пиццерия — станции. Проверяется
// именно согласование, потому что несогласованный выбор даёт заведомо пустой список
// чек-листов, и экран молча показывает «ничего не найдено» там, где найтись не могло.
import { describe, expect, test } from "vitest";

import { buildFilterCatalog, resolveChecklistFilter } from "./filter-options";
import type { StationOption } from "./listing";

const KZ = "11111111-1111-4111-8111-111111111111";
const UZ = "11111111-1111-4111-8111-111111111112";
const ALMATY = "22222222-2222-4222-8222-222222222221";
const ASTANA = "22222222-2222-4222-8222-222222222222";
const TASHKENT = "22222222-2222-4222-8222-222222222223";
const KITCHEN_ALMATY = "33333333-3333-4333-8333-333333333331";
const CASH_ALMATY = "33333333-3333-4333-8333-333333333332";
const KITCHEN_ASTANA = "33333333-3333-4333-8333-333333333333";
const KITCHEN_TASHKENT = "33333333-3333-4333-8333-333333333334";

// Порядок тот же, в каком станции приходят из listStations: страна → пиццерия → станция.
const STATIONS: StationOption[] = [
  station(KITCHEN_ALMATY, "Кухня", ALMATY, "Алматы, Абая 44", KZ, "Казахстан"),
  station(CASH_ALMATY, "Касса", ALMATY, "Алматы, Абая 44", KZ, "Казахстан"),
  station(
    KITCHEN_ASTANA,
    "Кухня",
    ASTANA,
    "Астана, Кабанбай 12",
    KZ,
    "Казахстан",
  ),
  station(
    KITCHEN_TASHKENT,
    "Кухня",
    TASHKENT,
    "Ташкент, Амира 3",
    UZ,
    "Узбекистан",
  ),
];

function station(
  id: string,
  name: string,
  storeId: string,
  storeName: string,
  countryId: string,
  countryName: string,
): StationOption {
  return { id, name, storeId, storeName, countryId, countryName };
}

function names(options: readonly { name: string }[]): string[] {
  return options.map((option) => option.name);
}

describe("buildFilterCatalog", () => {
  test("страны и пиццерии выводятся из станций без повторов и в том же порядке", () => {
    const catalog = buildFilterCatalog(STATIONS);

    expect(names(catalog.countries)).toStrictEqual(["Казахстан", "Узбекистан"]);
    expect(names(catalog.stores)).toStrictEqual([
      "Алматы, Абая 44",
      "Астана, Кабанбай 12",
      "Ташкент, Амира 3",
    ]);
  });

  test("пустой справочник не роняет разбор", () => {
    expect(buildFilterCatalog([])).toStrictEqual({
      countries: [],
      stores: [],
      stations: [],
    });
  });
});

describe("resolveChecklistFilter", () => {
  const catalog = buildFilterCatalog(STATIONS);

  test("без выбора показываются все страны, пиццерии и станции", () => {
    const selection = resolveChecklistFilter(
      { countryId: null, storeId: null, stationId: null },
      catalog,
    );

    expect(selection.countries).toHaveLength(2);
    expect(selection.stores).toHaveLength(3);
    expect(selection.stations).toHaveLength(4);
  });

  test("выбранная страна сужает список пиццерий и станций", () => {
    const selection = resolveChecklistFilter(
      { countryId: KZ, storeId: null, stationId: null },
      catalog,
    );

    expect(names(selection.stores)).toStrictEqual([
      "Алматы, Абая 44",
      "Астана, Кабанбай 12",
    ]);
    expect(selection.stations).toHaveLength(3);
  });

  test("выбранная пиццерия сужает станции до своих", () => {
    const selection = resolveChecklistFilter(
      { countryId: null, storeId: ALMATY, stationId: null },
      catalog,
    );

    expect(names(selection.stations)).toStrictEqual(["Кухня", "Касса"]);
  });

  test("без выбранной пиццерии станция названа путём: «Кухня» есть в каждой", () => {
    // Иначе в списке три одинаковых строки «Кухня» и методист выбирает вслепую.
    const selection = resolveChecklistFilter(
      { countryId: null, storeId: null, stationId: null },
      catalog,
    );

    expect(names(selection.stations)).toStrictEqual([
      "Алматы, Абая 44 · Кухня",
      "Алматы, Абая 44 · Касса",
      "Астана, Кабанбай 12 · Кухня",
      "Ташкент, Амира 3 · Кухня",
    ]);
  });

  test("пиццерия чужой страны из выбора выпадает, а страна остаётся", () => {
    // Такой выбор складывается в заведомо пустой список: пиццерии Ташкента нет в Казахстане.
    const selection = resolveChecklistFilter(
      { countryId: KZ, storeId: TASHKENT, stationId: null },
      catalog,
    );

    expect(selection.filter).toStrictEqual({
      countryId: KZ,
      storeId: null,
      stationId: null,
    });
  });

  test("станция чужой пиццерии из выбора выпадает", () => {
    const selection = resolveChecklistFilter(
      { countryId: null, storeId: ALMATY, stationId: KITCHEN_ASTANA },
      catalog,
    );

    expect(selection.filter.stationId).toBeNull();
    expect(selection.filter.storeId).toStrictEqual(ALMATY);
  });

  test("несуществующий выбор отбрасывается целиком", () => {
    // Пиццерию могли удалить из справочника, пока ссылка лежала в чате.
    const selection = resolveChecklistFilter(
      {
        countryId: "44444444-4444-4444-8444-444444444444",
        storeId: null,
        stationId: null,
      },
      catalog,
    );

    expect(selection.filter.countryId).toBeNull();
    expect(selection.stores).toHaveLength(3);
  });

  test("согласованный выбор сохраняется целиком", () => {
    const filter = {
      countryId: KZ,
      storeId: ALMATY,
      stationId: KITCHEN_ALMATY,
    };

    expect(resolveChecklistFilter(filter, catalog).filter).toStrictEqual(
      filter,
    );
  });
});
