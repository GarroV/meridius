import { describe, expect, test } from "vitest";

import { legacyStationTarget } from "./legacy-routes";

const ID = "5b1f0c2e-8d4a-4c3b-9e2f-1a2b3c4d5e6f";

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
