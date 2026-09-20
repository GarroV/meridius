// Сборка модели листа и экрана планшета на настоящих данных: справочник читается
// теми же запросами, что и в работе. Ошибка здесь не падает, а тихо печатает наклейку
// с чужим кодом — самый дорогой вид ошибки в этом блоке.
import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, test } from "vitest";

import { createCountry, createStation, createStore } from "@/blocks/catalog";
import { closeTestDb } from "@/blocks/data/testing/db";

import { buildQrModel, buildScreenModel } from "./build-model";
import { CONFIRM_REISSUE } from "./view";

afterAll(closeTestDb);

const ORIGIN = "http://localhost:3160";
const TIMEZONE = "Asia/Almaty";

interface Fixture {
  countryName: string;
  storeName: string;
  storeId: string;
  otherStoreId: string;
  /** Станции в порядке заведения — намеренно не по алфавиту. */
  stations: { id: string; name: string }[];
  /** Их же имена по алфавиту: в таком порядке их обязан отдать экран. */
  sortedNames: string[];
}

/** Пиццерия с тремя станциями и соседняя пустая — минимум, на котором виден выбор. */
async function fixture(): Promise<Fixture> {
  const suffix = randomUUID().slice(0, 8);
  const countryName = `Страна ${suffix}`;
  const countryId = await createCountry({ name: countryName, locale: "ru" });
  const storeName = `Пиццерия ${suffix}`;
  const storeId = await createStore({
    countryId,
    name: storeName,
    timezone: TIMEZONE,
  });
  const otherStoreId = await createStore({
    countryId,
    name: `Соседняя ${suffix}`,
    timezone: TIMEZONE,
  });

  // Заводятся не по алфавиту: список обязан прийти отсортированным, а не как повезёт.
  const names = [`Упаковка ${suffix}`, `Касса ${suffix}`, `Кухня ${suffix}`];
  const created: { id: string; name: string }[] = [];
  for (const name of names) {
    const station = await createStation({ storeId, name });
    created.push({ id: station.id, name });
  }

  return {
    countryName,
    storeName,
    storeId,
    otherStoreId,
    stations: created,
    sortedNames: [...names].sort((left, right) => left.localeCompare(right)),
  };
}

describe("что показывает лист печати", () => {
  test("на каждую станцию пиццерии приходит своя наклейка со своим кодом", async () => {
    const data = await fixture();

    const model = await buildQrModel(
      { storeId: data.storeId },
      { origin: ORIGIN },
    );

    expect(model.scanOrigin).toBe(ORIGIN);
    expect(model.store?.name).toBe(data.storeName);
    expect(model.store?.countryName).toBe(data.countryName);
    expect(model.stations.map((station) => station.name)).toEqual(
      data.sortedNames,
    );

    const codes = new Set(model.stations.map((station) => station.code));
    expect(codes.size).toBe(model.stations.length);
    for (const station of model.stations) {
      expect(station.svg).toMatch(/^<svg /);
      expect(station.screenHref).toContain(station.id);
    }
  });

  test("картинка наклейки — код именно этой станции, а не соседней", async () => {
    const data = await fixture();

    const model = await buildQrModel(
      { storeId: data.storeId },
      { origin: ORIGIN },
    );
    const [first, second] = model.stations;

    expect(first?.svg).not.toBe(second?.svg);
  });

  test("в карточке планшета — выбранная станция, а без выбора первая", async () => {
    const data = await fixture();
    const last = data.stations.at(-1)?.id;

    const auto = await buildQrModel(
      { storeId: data.storeId },
      { origin: ORIGIN },
    );
    const picked = await buildQrModel(
      { storeId: data.storeId, stationId: last },
      { origin: ORIGIN },
    );

    expect(auto.selected?.name).toBe(data.sortedNames[0]);
    expect(picked.selected?.id).toBe(last);
  });

  test("станция чужой пиццерии выбором не становится", async () => {
    const data = await fixture();
    const alien = await createStation({
      storeId: data.otherStoreId,
      name: `Чужая ${randomUUID().slice(0, 6)}`,
    });

    const model = await buildQrModel(
      { storeId: data.storeId, stationId: alien.id },
      { origin: ORIGIN },
    );

    expect(model.selected?.id).not.toBe(alien.id);
    expect(model.stations.map((station) => station.id)).not.toContain(alien.id);
  });

  test("без пиццерии в адресе экран предлагает выбрать её из списка", async () => {
    const data = await fixture();

    const model = await buildQrModel({}, { origin: ORIGIN });

    expect(model.store).toBeNull();
    expect(model.stations).toHaveLength(0);
    const option = model.stores.find((store) => store.id === data.storeId);
    expect(option?.name).toBe(data.storeName);
    expect(option?.countryName).toBe(data.countryName);
    expect(option?.stationCount).toBe(3);
    expect(option?.href).toContain(data.storeId);
  });

  test("выдуманная пиццерия в адресе не подставляет чужую", async () => {
    const model = await buildQrModel(
      { storeId: randomUUID() },
      { origin: ORIGIN },
    );

    expect(model.store).toBeNull();
    expect(model.stations).toHaveLength(0);
  });

  test("код отказа из адреса доходит до экрана", async () => {
    const model = await buildQrModel(
      { error: "codeCollision" },
      { origin: ORIGIN },
    );

    expect(model.errorCode).toBe("codeCollision");
  });

  test("confirming — станция из адреса, когда задан вопрос о перевыпуске (T266)", async () => {
    const data = await fixture();
    const target = data.stations[1]?.id;
    if (target === undefined) throw new Error("станция не завелась");

    const model = await buildQrModel(
      { storeId: data.storeId, stationId: target, confirm: CONFIRM_REISSUE },
      { origin: ORIGIN },
    );

    expect(
      model.confirming?.id,
      "Без этой станции окно подтверждения не знает, про что оно спрашивает.",
    ).toBe(target);
  });

  test("confirming — null, когда вопроса в адресе нет", async () => {
    const data = await fixture();
    const target = data.stations[0]?.id;

    const model = await buildQrModel(
      { storeId: data.storeId, stationId: target },
      { origin: ORIGIN },
    );

    expect(model.confirming).toBeNull();
  });

  test("confirming — null для чужой станции, а selected всё равно подставляет первую", async () => {
    const data = await fixture();
    const alien = await createStation({
      storeId: data.otherStoreId,
      name: `Чужая ${randomUUID().slice(0, 6)}`,
    });

    const model = await buildQrModel(
      {
        storeId: data.storeId,
        stationId: alien.id,
        confirm: CONFIRM_REISSUE,
      },
      { origin: ORIGIN },
    );

    expect(
      model.confirming,
      "Чужая станция не должна становиться вопросом на этом листе — иначе " +
        "подтверждение спросило бы про станцию, которой здесь нет.",
    ).toBeNull();
    expect(
      model.selected?.name,
      "`selected` и `confirming` — разные поля: подстановка первой станции нужна " +
        "карточке планшета, а в окне подтверждения она означала бы вопрос про одну " +
        "станцию и перевыпуск кода у другой.",
    ).toBe(data.sortedNames[0]);
  });
});

describe("что показывает экран планшета", () => {
  test("станция, пиццерия, её код и адрес опроса", async () => {
    const data = await fixture();
    const station = data.stations[0];
    if (station === undefined) throw new Error("станция не завелась");

    const model = await buildScreenModel(
      { storeId: data.storeId, stationId: station.id },
      { origin: ORIGIN },
    );

    expect(model?.storeName).toBe(data.storeName);
    expect(model?.stationName).toBe(station.name);
    expect(model?.svg).toMatch(/^<svg /);
    expect(model?.codeHref).toContain(station.id);
    expect(model?.backHref).toContain(data.storeId);
  });

  test("станции нет в этой пиццерии — экрана нет, а не чужой код", async () => {
    const data = await fixture();
    const alien = await createStation({
      storeId: data.otherStoreId,
      name: `Чужая ${randomUUID().slice(0, 6)}`,
    });

    const model = await buildScreenModel(
      { storeId: data.storeId, stationId: alien.id },
      { origin: ORIGIN },
    );

    expect(model).toBeNull();
  });
});
