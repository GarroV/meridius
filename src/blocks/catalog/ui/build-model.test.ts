// Расчёт «что показано» — единственное место, где сходятся адрес, дерево и карточка.
// Ошибка здесь не падает, а тихо показывает чужую пиццерию, поэтому проверяется
// на настоящих данных: справочник читается из базы теми же запросами, что в работе.
import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, test } from "vitest";

import { getDb, stores } from "@/blocks/data";
import { closeTestDb } from "@/blocks/data/testing/db";
import { createChecklist } from "@/blocks/data/testing/fixtures";

import { createCountry } from "../countries";
import { assignChecklist, createStation } from "../stations";
import { createStore } from "../stores";
import { buildCatalogModel } from "./build-model";

afterAll(closeTestDb);

const TIMEZONE = "Asia/Almaty";

interface Fixture {
  countryId: string;
  firstStoreId: string;
  secondStoreId: string;
  stationId: string;
}

/** Страна с двумя пиццериями и одной станцией: минимум, на котором виден выбор. */
async function catalogFixture(): Promise<Fixture> {
  const suffix = randomUUID().slice(0, 8);
  const countryId = await createCountry({
    name: `Страна ${suffix}`,
    locale: "ru",
  });
  // Имена заданы так, чтобы «первая» была первой по алфавиту, а не по случайности.
  const firstStoreId = await createStore({
    countryId,
    name: `А-пиццерия ${suffix}`,
    timezone: TIMEZONE,
  });
  const secondStoreId = await createStore({
    countryId,
    name: `Я-пиццерия ${suffix}`,
    timezone: TIMEZONE,
  });
  const station = await createStation({
    storeId: firstStoreId,
    name: `Кухня ${suffix}`,
  });

  return { countryId, firstStoreId, secondStoreId, stationId: station.id };
}

describe("что показывает экран справочника", () => {
  test("выбранная страна раскрывает свои пиццерии, первая выбирается сама", async () => {
    const fixture = await catalogFixture();

    const model = await buildCatalogModel(
      { countryId: fixture.countryId },
      "ru",
    );

    expect(model.countryId).toBe(fixture.countryId);
    expect(model.storeId).toBe(fixture.firstStoreId);
    // Состояние эталона: карточка внизу — про пиццерию.
    expect(model.focus).toBe("store");
    expect(model.stores.map((item) => item.id)).toStrictEqual([
      fixture.firstStoreId,
      fixture.secondStoreId,
    ]);
  });

  test("пиццерия из чужой страны в адресе игнорируется", async () => {
    // Адрес правит кто угодно: подставленная чужая пиццерия не должна ни открыться,
    // ни оставить экран в состоянии «страна одна, пиццерия другая».
    const mine = await catalogFixture();
    const alien = await catalogFixture();

    const model = await buildCatalogModel(
      { countryId: mine.countryId, storeId: alien.firstStoreId },
      "ru",
    );

    expect(model.storeId).toBe(mine.firstStoreId);
  });

  test("станция не из выбранной пиццерии не открывается", async () => {
    const mine = await catalogFixture();

    const model = await buildCatalogModel(
      {
        countryId: mine.countryId,
        storeId: mine.secondStoreId,
        stationId: mine.stationId,
        focus: "station",
      },
      "ru",
    );

    expect(model.stationId).toBeNull();
    expect(model.station).toBeNull();
    // Запрошенной карточки станции нет — экран показывает пиццерию, а не пустоту.
    expect(model.focus).toBe("store");
  });

  test("станция своей пиццерии открывается карточкой с кодом", async () => {
    const fixture = await catalogFixture();

    const model = await buildCatalogModel(
      {
        countryId: fixture.countryId,
        storeId: fixture.firstStoreId,
        stationId: fixture.stationId,
        focus: "station",
      },
      "ru",
    );

    expect(model.focus).toBe("station");
    expect(model.station?.code).toHaveLength(10);
    expect(model.stations.find((item) => item.selected)?.id).toBe(
      fixture.stationId,
    );
  });

  test("станция без чек-листа отдаёт пустой список — экрану есть что пометить", async () => {
    const fixture = await catalogFixture();

    const model = await buildCatalogModel(
      { countryId: fixture.countryId, storeId: fixture.firstStoreId },
      "ru",
    );

    expect(model.stations[0]?.checklists).toStrictEqual([]);
  });

  test("названия чек-листов приходят на языке экрана", async () => {
    const fixture = await catalogFixture();
    const suffix = randomUUID().slice(0, 8);
    const checklistId = await createChecklist({
      title: { ru: `Открытие ${suffix}`, en: `Opening ${suffix}` },
    });
    await assignChecklist(fixture.stationId, checklistId);

    const russian = await buildCatalogModel(
      { countryId: fixture.countryId, storeId: fixture.firstStoreId },
      "ru",
    );
    const english = await buildCatalogModel(
      { countryId: fixture.countryId, storeId: fixture.firstStoreId },
      "en",
    );

    expect(russian.stations[0]?.checklists[0]?.title).toBe(
      `Открытие ${suffix}`,
    );
    expect(english.stations[0]?.checklists[0]?.title).toBe(`Opening ${suffix}`);
  });

  test("часовые пояса грузятся только когда открыта карточка пиццерии", async () => {
    const fixture = await catalogFixture();

    const withStore = await buildCatalogModel(
      { countryId: fixture.countryId, storeId: fixture.firstStoreId },
      "ru",
    );
    const withStation = await buildCatalogModel(
      {
        countryId: fixture.countryId,
        storeId: fixture.firstStoreId,
        stationId: fixture.stationId,
        focus: "station",
      },
      "ru",
    );

    expect(withStore.timezones.length).toBeGreaterThan(100);
    expect(withStation.timezones).toStrictEqual([]);
  });

  test("ссылки строк ведут в своё состояние экрана", async () => {
    const fixture = await catalogFixture();

    const model = await buildCatalogModel(
      { countryId: fixture.countryId },
      "ru",
    );

    expect(model.countries.find((item) => item.selected)?.href).toBe(
      `/admin/catalog?country=${fixture.countryId}&focus=country`,
    );
    expect(model.stores.find((item) => item.selected)?.href).toBe(
      `/admin/catalog?country=${fixture.countryId}&store=${fixture.firstStoreId}&focus=store`,
    );
  });

  test("кнопки QR ведут в раздел кодов: пиццерии — её лист, станции — её код (T107)", async () => {
    // Экран собирать эти адреса не должен: он не знает ни выбранной пиццерии до
    // расчёта, ни того, что станция может быть чужой. Поэтому они в модели.
    const fixture = await catalogFixture();

    const model = await buildCatalogModel(
      { countryId: fixture.countryId, storeId: fixture.firstStoreId },
      "ru",
    );

    expect(model.hrefs.qrStations).toBe(
      `/admin/qr?store=${fixture.firstStoreId}`,
    );
    expect(
      model.stations.find((item) => item.id === fixture.stationId)?.qrHref,
    ).toBe(
      `/admin/qr?store=${fixture.firstStoreId}&station=${fixture.stationId}`,
    );
  });
});

/** Пояс пишется мимо справочника — ровно так он и попадает в базу в жизни. */
async function storeWithTimezone(timezone: string): Promise<{
  countryId: string;
  storeId: string;
}> {
  const suffix = randomUUID().slice(0, 8);
  const countryId = await createCountry({
    name: `Страна ${suffix}`,
    locale: "ru",
  });
  const [store] = await getDb()
    .insert(stores)
    .values({
      countryId,
      name: `Пиццерия ${suffix}`,
      timezone,
    })
    .returning({ id: stores.id });
  if (store === undefined) throw new Error("пиццерия не завелась");
  return { countryId, storeId: store.id };
}

// Пиццерия, чей пояс база уже не признаёт, существует: так его пишет сид, миграция или
// любой код мимо справочника (T062 закрыл только путь через `createStore`/`updateStore`).
// По D060 такую пиццерию ловят в справочнике при сохранении, а публичный маршрут
// оставляют громко падающим. Чтобы это сработало, карточка обязана показать НАСТОЯЩЕЕ
// значение: пока она молчала, `<select>` без совпадающего пункта показывал первую зону
// по алфавиту, то есть врал о состоянии, а сохранение тихо переписывало пояс на чужой.
describe("пиццерия с непризнаваемым поясом видна в карточке (T102, D060)", () => {
  const TYPO = "Asia/Almatyy";

  async function storeWithBrokenTimezone(): Promise<{
    countryId: string;
    storeId: string;
  }> {
    return storeWithTimezone(TYPO);
  }

  test("карточка отдаёт сохранённое значение и признаётся, что база его не знает", async () => {
    const { countryId, storeId } = await storeWithBrokenTimezone();

    const model = await buildCatalogModel(
      { countryId, storeId, focus: "store" },
      "ru",
    );

    expect(model.store?.timezone).toBe(TYPO);
    expect(model.store?.timezoneKnown).toBe(false);
  });

  test("исправный пояс остаётся признанным: признак не взведён у всех подряд", async () => {
    const fixture = await catalogFixture();

    const model = await buildCatalogModel(
      {
        countryId: fixture.countryId,
        storeId: fixture.firstStoreId,
        focus: "store",
      },
      "ru",
    );

    expect(model.store?.timezone).toBe(TIMEZONE);
    expect(model.store?.timezoneKnown).toBe(true);
  });

  test("сломанного значения нет среди пунктов списка: выбрать его заново нельзя", async () => {
    const { countryId, storeId } = await storeWithBrokenTimezone();

    const model = await buildCatalogModel(
      { countryId, storeId, focus: "store" },
      "ru",
    );

    expect(model.timezones.map((zone) => zone.name)).not.toContain(TYPO);
  });

  // Спрашивать надо у PostgreSQL, а не у `Intl` движка (D060 так и записан). Разница
  // не теоретическая: `US/Pacific`, `Japan` и `Factory` PostgreSQL знает, а список
  // `Intl.supportedValuesOf('timeZone')` их не содержит — он отдаёт только канонические
  // имена. Проверка на `Intl` объявила бы такие пиццерии сломанными и потребовала бы
  // менять исправный пояс. Опечатка `Asia/Almatyy` этой подмены не ловит: её обе
  // стороны считают неизвестной, поэтому нужен пояс, по которому списки расходятся.
  test.each(["US/Pacific", "Japan", "Factory"])(
    "пояс «%s» база знает, хотя список Intl его не содержит — признан",
    async (timezone) => {
      const { countryId, storeId } = await storeWithTimezone(timezone);

      const model = await buildCatalogModel(
        { countryId, storeId, focus: "store" },
        "ru",
      );

      expect(Intl.supportedValuesOf("timeZone")).not.toContain(timezone);
      expect(model.store?.timezoneKnown).toBe(true);
    },
  );
});
