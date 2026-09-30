// Сборка модели листа и экрана планшета на настоящих данных: справочник читается
// теми же запросами, что и в работе. Ошибка здесь не падает, а тихо печатает наклейку
// с чужим кодом — самый дорогой вид ошибки в этом блоке.
import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, test, vi } from "vitest";

import { createCountry, createStation, createStore } from "@/blocks/catalog";
import { closeTestDb } from "@/blocks/data/testing/db";
import { WHOLE_NETWORK, type Scope } from "@/blocks/auth/scope";
import { getDb } from "@/blocks/data";

import { buildQrModel, buildScreenModel } from "./build-model";
import { CONFIRM_REISSUE } from "./view";

afterAll(closeTestDb);

const ORIGIN = "http://localhost:3160";
const TIMEZONE = "Asia/Almaty";

interface Fixture {
  countryId: string;
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
    countryId,
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
      { origin: ORIGIN, scope: WHOLE_NETWORK },
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
      { origin: ORIGIN, scope: WHOLE_NETWORK },
    );
    const [first, second] = model.stations;

    expect(first?.svg).not.toBe(second?.svg);
  });

  test("в карточке планшета — выбранная станция, а без выбора первая", async () => {
    const data = await fixture();
    const last = data.stations.at(-1)?.id;

    const auto = await buildQrModel(
      { storeId: data.storeId },
      { origin: ORIGIN, scope: WHOLE_NETWORK },
    );
    const picked = await buildQrModel(
      { storeId: data.storeId, stationId: last },
      { origin: ORIGIN, scope: WHOLE_NETWORK },
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
      { origin: ORIGIN, scope: WHOLE_NETWORK },
    );

    expect(model.selected?.id).not.toBe(alien.id);
    expect(model.stations.map((station) => station.id)).not.toContain(alien.id);
  });

  test("без пиццерии в адресе экран предлагает выбрать её из списка", async () => {
    const data = await fixture();

    const model = await buildQrModel(
      {},
      { origin: ORIGIN, scope: WHOLE_NETWORK },
    );

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
      { origin: ORIGIN, scope: WHOLE_NETWORK },
    );

    expect(model.store).toBeNull();
    expect(model.stations).toHaveLength(0);
  });

  test("код отказа из адреса доходит до экрана", async () => {
    const model = await buildQrModel(
      { error: "codeCollision" },
      { origin: ORIGIN, scope: WHOLE_NETWORK },
    );

    expect(model.errorCode).toBe("codeCollision");
  });

  test("confirming — станция из адреса, когда задан вопрос о перевыпуске (T266)", async () => {
    const data = await fixture();
    const target = data.stations[1]?.id;
    if (target === undefined) throw new Error("станция не завелась");

    const model = await buildQrModel(
      { storeId: data.storeId, stationId: target, confirm: CONFIRM_REISSUE },
      { origin: ORIGIN, scope: WHOLE_NETWORK },
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
      { origin: ORIGIN, scope: WHOLE_NETWORK },
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
      { origin: ORIGIN, scope: WHOLE_NETWORK },
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
      { origin: ORIGIN, scope: WHOLE_NETWORK },
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
      { origin: ORIGIN, scope: WHOLE_NETWORK },
    );

    expect(model).toBeNull();
  });
});

/** Область партнёра, которому видны только эти страны (D145). */
function partnerOf(...countryIds: string[]): Scope {
  return { kind: "countries", countryIds: new Set(countryIds) };
}

async function emptyCountry(): Promise<string> {
  return createCountry({
    name: `Пустая ${randomUUID().slice(0, 8)}`,
    locale: "ru",
  });
}

describe("чужая пиццерия не находится (D145)", () => {
  test("партнёр своей страны видит лист своей пиццерии", async () => {
    const data = await fixture();

    const model = await buildQrModel(
      { storeId: data.storeId },
      { origin: ORIGIN, scope: partnerOf(data.countryId) },
    );

    expect(model.store?.id).toBe(data.storeId);
    expect(model.store?.countryName).toBe(data.countryName);
    expect(model.stations).toHaveLength(data.stations.length);
  });

  test("партнёр другой страны не получает ни листа, ни пиццерии в списке", async () => {
    const data = await fixture();
    const scope = partnerOf(await emptyCountry());

    const model = await buildQrModel(
      { storeId: data.storeId },
      { origin: ORIGIN, scope },
    );

    expect(model.store).toBeNull();
    expect(model.stations).toHaveLength(0);
    expect(model.stores.map((option) => option.id)).not.toContain(data.storeId);
  });

  test("партнёр другой страны не получает экрана планшета", async () => {
    const data = await fixture();
    const station = data.stations[0];
    if (station === undefined) throw new Error("станция не завелась");

    const model = await buildScreenModel(
      { storeId: data.storeId, stationId: station.id },
      { origin: ORIGIN, scope: partnerOf(await emptyCountry()) },
    );

    expect(model).toBeNull();
  });

  test("список выбора партнёра — только пиццерии его стран, со страной и числом станций", async () => {
    const data = await fixture();
    const other = await fixture();

    const model = await buildQrModel(
      {},
      { origin: ORIGIN, scope: partnerOf(data.countryId) },
    );

    const ids = model.stores.map((option) => option.id);
    expect(ids).toEqual(
      expect.arrayContaining([data.storeId, data.otherStoreId]),
    );
    expect(ids).toHaveLength(2);
    expect(ids).not.toContain(other.storeId);
    const own = model.stores.find((option) => option.id === data.storeId);
    expect(own?.countryName).toBe(data.countryName);
    expect(own?.stationCount).toBe(data.stations.length);
  });
});

/**
 * Сколько запросов уходит в базу за время `run`. Считается на пуле: через него идёт
 * каждый запрос вне транзакции, а модели экранов QR транзакций не открывают.
 */
/** Та часть пула, что нужна счёту: драйвер тесту не импортируется (границы модулей). */
interface QueryPool {
  query(...args: unknown[]): unknown;
}

async function countQueries(run: () => Promise<unknown>): Promise<number> {
  getDb();
  const pool = (globalThis as { meridiusPool?: QueryPool }).meridiusPool;
  if (pool === undefined) throw new Error("пул базы не поднялся");
  const spy = vi.spyOn(pool, "query");
  try {
    await run();
    return spy.mock.calls.length;
  } finally {
    spy.mockRestore();
  }
}

// T347: поиск пиццерии обходил страны запросом на каждую, и в общей тестовой базе,
// где стран сотни, лист с выдуманной пиццерией уходил за 20 секунд. Проверяется не
// время (оно зависит от машины), а причина: число запросов не зависит от числа стран.
describe("число запросов не растёт с числом стран сети (T347)", () => {
  const COUNTRIES_ADDED = 3;

  async function growNetwork(): Promise<void> {
    for (let index = 0; index < COUNTRIES_ADDED; index += 1) {
      await emptyCountry();
    }
  }

  test.each([
    ["выдуманная пиццерия", () => ({ storeId: randomUUID() })],
    ["пиццерия не задана", () => ({})],
  ])("лист печати: %s", async (_name, view) => {
    const request = { origin: ORIGIN, scope: WHOLE_NETWORK };
    const before = await countQueries(() => buildQrModel(view(), request));
    await growNetwork();
    const after = await countQueries(() => buildQrModel(view(), request));

    expect(after).toBe(before);
  });

  test("лист печати и экран планшета настоящей пиццерии", async () => {
    const data = await fixture();
    const station = data.stations[0];
    if (station === undefined) throw new Error("станция не завелась");
    const request = { origin: ORIGIN, scope: WHOLE_NETWORK };
    const open = async (): Promise<void> => {
      await buildQrModel({ storeId: data.storeId }, request);
      await buildScreenModel(
        { storeId: data.storeId, stationId: station.id },
        request,
      );
    };

    const before = await countQueries(open);
    await growNetwork();
    const after = await countQueries(open);

    expect(after).toBe(before);
  });
});
