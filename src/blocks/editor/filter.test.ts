// Фильтр списка чек-листов живёт в адресе. Разбор — это ввод от кого угодно, а не от
// нашей же формы, поэтому проверяется на мусоре, а не только на нашем собственном адресе.
import { describe, expect, test } from "vitest";

import {
  checklistsHref,
  isFilterActive,
  NO_FILTER,
  parseChecklistFilter,
} from "./filter";
import { CHECKLISTS_PATH } from "./routes";

const COUNTRY = "11111111-1111-4111-8111-111111111111";
const STORE = "22222222-2222-4222-8222-222222222222";
const STATION = "33333333-3333-4333-8333-333333333333";

describe("parseChecklistFilter", () => {
  test("пустой адрес — фильтра нет", () => {
    expect(parseChecklistFilter({})).toStrictEqual(NO_FILTER);
  });

  test("три опознанных значения доезжают до фильтра", () => {
    expect(
      parseChecklistFilter({
        country: COUNTRY,
        store: STORE,
        station: STATION,
      }),
    ).toStrictEqual({
      countryId: COUNTRY,
      storeId: STORE,
      stationId: STATION,
    });
  });

  test("не-uuid отбрасывается молча: это мусор в адресе, а не ошибка методиста", () => {
    // Иначе строка уедет в запрос и уронит экран отказом базы на приведении типа.
    expect(
      parseChecklistFilter({ country: "Казахстан", store: "'; drop table --" }),
    ).toStrictEqual(NO_FILTER);
  });

  test("пустое значение — это «Все», а не выбор", () => {
    // Так приходит наша же форма: у пункта «Все» значение пустое.
    expect(parseChecklistFilter({ country: "", station: "" })).toStrictEqual(
      NO_FILTER,
    );
  });

  test("повторённый параметр берёт первое значение, а не склеивает", () => {
    expect(
      parseChecklistFilter({ store: [STORE, STATION] }).storeId,
    ).toStrictEqual(STORE);
  });

  test("список без значений — то же самое, что параметра нет", () => {
    expect(parseChecklistFilter({ store: [] }).storeId).toBeNull();
  });
});

describe("checklistsHref", () => {
  test("пустой фильтр — чистый адрес экрана, без хвоста из пустых параметров", () => {
    expect(checklistsHref(NO_FILTER)).toStrictEqual(CHECKLISTS_PATH);
  });

  test("адрес с фильтром возвращается тем же фильтром: ссылкой можно поделиться", () => {
    const filter = { countryId: COUNTRY, storeId: STORE, stationId: null };
    const query = checklistsHref(filter).split("?")[1] ?? "";

    expect(
      parseChecklistFilter(
        Object.fromEntries(new URLSearchParams(query).entries()),
      ),
    ).toStrictEqual(filter);
  });
});

describe("isFilterActive", () => {
  test("пустой фильтр не активен, любой выбор — активен", () => {
    expect(isFilterActive(NO_FILTER)).toBe(false);
    expect(isFilterActive({ ...NO_FILTER, stationId: STATION })).toBe(true);
  });
});
