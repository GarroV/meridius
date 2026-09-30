// План импорта справочника сети внутри одной страны (#141): кого завести, кого
// обновить, кого не трогать. Главное обещание — повтор не плодит дублей: пиццерия с
// кодом опознаётся по коду, даже если её переименовали на экране.
import { describe, expect, test } from "vitest";

import {
  type ExistingStore,
  NetworkPlanError,
  planStoreImport,
  readNetworkStore,
} from "./network-plan";

const TZ = "Europe/Warsaw";

function existing(
  id: string,
  name: string,
  extra: Partial<ExistingStore> = {},
): ExistingStore {
  return { id, name, city: null, code: null, timezone: TZ, ...extra };
}

describe("readNetworkStore", () => {
  test("строка — старая запись: только название", () => {
    expect(readNetworkStore("Gyumri-1")).toEqual({
      name: "Gyumri-1",
      city: undefined,
      code: undefined,
    });
  });

  test("объект: название, город и код со срезанными пробелами", () => {
    expect(
      readNetworkStore({ name: " Bemowo ", city: "Warsaw ", code: " PL-7" }),
    ).toEqual({ name: "Bemowo", city: "Warsaw", code: "PL-7" });
  });

  test.each([
    ["пустое название", { name: "  " }],
    ["название не строкой", { name: 7 }],
    ["пустой код", { name: "A", code: " " }],
    ["код длиннее 64 знаков", { name: "A", code: "x".repeat(65) }],
    ["город длиннее 120 знаков", { name: "A", city: "x".repeat(121) }],
    ["город не строкой", { name: "A", city: 1 }],
    ["не строка и не объект", 42],
  ])("%s — отказ с понятной причиной", (_label, raw) => {
    expect(() => readNetworkStore(raw)).toThrow(NetworkPlanError);
  });
});

describe("planStoreImport", () => {
  test("пустая страна: всё заводится, с городом и кодом", () => {
    const plan = planStoreImport(
      [],
      [
        { name: "Bemowo", city: "Warsaw", code: "PL-7" },
        { name: "Mokotów", city: undefined, code: undefined },
      ],
      TZ,
    );
    expect(plan.creates).toEqual([
      { name: "Bemowo", city: "Warsaw", code: "PL-7", timezone: TZ },
      { name: "Mokotów", timezone: TZ },
    ]);
    expect(plan.updates).toEqual([]);
    expect(plan.unknown).toEqual([]);
  });

  test("повтор того же файла ничего не меняет", () => {
    const plan = planStoreImport(
      [existing("s1", "Bemowo", { city: "Warsaw", code: "PL-7" })],
      [{ name: "Bemowo", city: "Warsaw", code: "PL-7" }],
      TZ,
    );
    expect(plan).toEqual({
      creates: [],
      updates: [],
      unchanged: 1,
      unknown: [],
    });
  });

  test("переименованная на экране пиццерия с кодом опознаётся по коду, а не заводится рядом", () => {
    const plan = planStoreImport(
      [existing("s1", "Бемово (правка методиста)", { code: "PL-7" })],
      [{ name: "Bemowo", city: "Warsaw", code: "PL-7" }],
      TZ,
    );
    expect(plan.creates).toEqual([]);
    expect(plan.updates).toEqual([
      {
        id: "s1",
        previousName: "Бемово (правка методиста)",
        set: { name: "Bemowo", city: "Warsaw" },
      },
    ]);
    expect(plan.unknown).toEqual([]);
  });

  test("пиццерия без кода, заведённая по имени, получает код из файла, а не дубль", () => {
    const plan = planStoreImport(
      [existing("s1", "Bemowo")],
      [{ name: "Bemowo", city: "Warsaw", code: "PL-7" }],
      TZ,
    );
    expect(plan.creates).toEqual([]);
    expect(plan.updates).toEqual([
      {
        id: "s1",
        previousName: "Bemowo",
        set: { city: "Warsaw", code: "PL-7" },
      },
    ]);
  });

  test("по имени не присваивается строка, у которой уже другой код", () => {
    const plan = planStoreImport(
      [existing("s1", "Bemowo", { code: "PL-1" })],
      [{ name: "Bemowo", city: undefined, code: "PL-7" }],
      TZ,
    );
    expect(plan.creates).toEqual([
      { name: "Bemowo", code: "PL-7", timezone: TZ },
    ]);
    expect(plan.updates).toEqual([]);
    expect(plan.unknown).toEqual(["Bemowo"]);
  });

  test("поля, которых нет в файле, не стираются", () => {
    const plan = planStoreImport(
      [existing("s1", "Bemowo", { city: "Warsaw", code: "PL-7" })],
      [{ name: "Bemowo", city: undefined, code: undefined }],
      TZ,
    );
    expect(plan).toEqual({
      creates: [],
      updates: [],
      unchanged: 1,
      unknown: [],
    });
  });

  test("сменился часовой пояс страны — обновление пояса", () => {
    const plan = planStoreImport(
      [existing("s1", "Bemowo", { timezone: "UTC" })],
      [{ name: "Bemowo", city: undefined, code: undefined }],
      TZ,
    );
    expect(plan.updates).toEqual([
      { id: "s1", previousName: "Bemowo", set: { timezone: TZ } },
    ]);
  });

  test("пиццерии, которой нет в файле, план не трогает и называет её", () => {
    const plan = planStoreImport(
      [existing("s1", "Bemowo"), existing("s2", "Ручная")],
      [{ name: "Bemowo", city: undefined, code: undefined }],
      TZ,
    );
    expect(plan.unknown).toEqual(["Ручная"]);
    expect(plan.updates).toEqual([]);
  });

  test("два одинаковых кода в файле одной страны — отказ до записи", () => {
    expect(() =>
      planStoreImport(
        [],
        [
          { name: "A", city: undefined, code: "PL-7" },
          { name: "B", city: undefined, code: "PL-7" },
        ],
        TZ,
      ),
    ).toThrow(/PL-7/);
  });

  test("два одинаковых названия без кода в файле — отказ до записи", () => {
    expect(() =>
      planStoreImport(
        [],
        [
          { name: "A", city: undefined, code: undefined },
          { name: "A", city: undefined, code: undefined },
        ],
        TZ,
      ),
    ).toThrow(NetworkPlanError);
  });
});
