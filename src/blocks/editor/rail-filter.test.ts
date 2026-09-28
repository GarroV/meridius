// Сужение колонки чек-листов (D162) — то, что раньше делал запрос к базе, теперь делает
// клиент. Проверяется, что правила не разошлись с запросом: фильтр по пути сужает, как
// `where` в `listing.ts`, мусор из адреса не сужает ничего, а поиск находит чек-лист и
// по названию, и по месту — второе единственное различает одинаковые «Открытия».
import { describe, expect, test } from "vitest";

import type { ChecklistRow } from "./listing";
import { narrowChecklists, railQueryFrom, railValues } from "./rail-filter";

const KZ = "11111111-1111-4111-8111-111111111111";
const ALMATY = "22222222-2222-4222-8222-222222222221";
const ASTANA = "22222222-2222-4222-8222-222222222222";
const KITCHEN = "33333333-3333-4333-8333-333333333331";

function row(
  id: string,
  title: string,
  place: {
    readonly stationId: string;
    readonly storeId: string;
    readonly storeName: string;
  } | null,
): ChecklistRow {
  return {
    id,
    title: { ru: title },
    windowStart: "00:00:00",
    windowEnd: "24:00:00",
    stationId: place?.stationId ?? null,
    storeId: place?.storeId ?? null,
    countryId: place === null ? null : KZ,
    stationName: place === null ? null : "Кухня",
    storeName: place?.storeName ?? null,
    countryName: place === null ? null : "Казахстан",
    publishedNumber: null,
    hasUnpublishedChanges: true,
    itemCount: 0,
    submissions7d: 0,
  };
}

const ROWS: readonly ChecklistRow[] = [
  row("a", "Открытие кухни", {
    stationId: KITCHEN,
    storeId: ALMATY,
    storeName: "Алматы, Абая 44",
  }),
  row("b", "Открытие кухни", {
    stationId: "33333333-3333-4333-8333-333333333332",
    storeId: ASTANA,
    storeName: "Астана, Кабанбай 12",
  }),
  row("c", "Закрытие смены", null),
];

function ids(rows: readonly ChecklistRow[]): string[] {
  return rows.map((one) => one.id);
}

describe("сужение колонки чек-листов", () => {
  test("пиццерия оставляет только свои чек-листы, чек-лист без станции уходит", () => {
    const { filter, q } = railQueryFrom({ store: ALMATY });
    expect(ids(narrowChecklists(ROWS, filter, q, "ru"))).toEqual(["a"]);
  });

  test("поиск находит по месту без учёта регистра: одинаковые названия различает адрес", () => {
    const { filter, q } = railQueryFrom({ q: "  абая " });
    expect(q).toBe("абая");
    expect(ids(narrowChecklists(ROWS, filter, q, "ru"))).toEqual(["a"]);
  });

  test("поиск по названию и фильтр складываются", () => {
    const { filter, q } = railQueryFrom({ country: KZ, q: "ОТКРЫТИЕ" });
    expect(ids(narrowChecklists(ROWS, filter, q, "ru"))).toEqual(["a", "b"]);
  });

  test("мусор из адреса не сужает список, а длинный поиск обрезается", () => {
    const query = railQueryFrom({
      country: "Казахстан",
      store: "1 or 1=1",
      q: "я".repeat(500),
    });
    expect(query.filter).toEqual({
      countryId: null,
      storeId: null,
      stationId: null,
    });
    expect(query.q).toHaveLength(100);
    expect(ids(narrowChecklists(ROWS, query.filter, "", "ru"))).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  test("в адрес уходит только заданное", () => {
    expect(railValues(railQueryFrom({ station: KITCHEN, q: " " }))).toEqual({
      station: KITCHEN,
    });
  });
});
