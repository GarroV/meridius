import { describe, expect, test } from "vitest";

import { legacyQrTarget, legacyStationTarget } from "./legacy-routes";

const ID = "5b1f0c2e-8d4a-4c3b-9e2f-1a2b3c4d5e6f";
const STORE = "6c2f0d3e-9e5b-4d4c-8f3a-2b3c4d5e6f70";
const OTHER = "7d3a1e4f-0f6c-4e5d-9a4b-3c4d5e6f7081";

describe("legacyStationTarget", () => {
  test("станция из адреса ведёт на её карточку", () => {
    expect(legacyStationTarget({ station: ID, store: "x" })).toBe(
      `/admin/stations/${ID}`,
    );
  });

  test("без станции — в список станций", () => {
    expect(legacyStationTarget({})).toBe("/admin/stations");
    expect(legacyStationTarget({ store: ID })).toBe("/admin/stations");
  });

  test("мусор вместо id ведёт в список, а не на чужой путь", () => {
    expect(legacyStationTarget({ station: "../catalog" })).toBe(
      "/admin/stations",
    );
  });

  test("повторённый параметр — берётся первое значение", () => {
    expect(legacyStationTarget({ station: [ID, "x"] })).toBe(
      `/admin/stations/${ID}`,
    );
  });
});

function stationsOf(storeId: string): Promise<readonly { id: string }[]> {
  return Promise.resolve(storeId === STORE ? [{ id: ID }, { id: OTHER }] : []);
}

describe("legacyQrTarget", () => {
  test("станция важнее пиццерии: ссылка строки станции ведёт на её карточку", async () => {
    expect(
      await legacyQrTarget({ store: STORE, station: ID }, stationsOf),
    ).toBe(`/admin/stations/${ID}`);
  });

  test("лист пиццерии — на лист наклеек всех её станций", async () => {
    expect(await legacyQrTarget({ store: STORE }, stationsOf)).toBe(
      `/admin/stations/stickers?stationIds=${ID}&stationIds=${OTHER}`,
    );
  });

  test("пиццерия без станций, неизвестная или мусорная — в список станций", async () => {
    expect(await legacyQrTarget({ store: OTHER }, stationsOf)).toBe(
      "/admin/stations",
    );
    expect(await legacyQrTarget({ store: "x" }, stationsOf)).toBe(
      "/admin/stations",
    );
    expect(await legacyQrTarget({}, stationsOf)).toBe("/admin/stations");
  });
});
