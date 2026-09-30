import { describe, expect, test } from "vitest";

import type { NetworkStation } from "@/blocks/stations/overview";

import {
  countGapsOf,
  countWorking,
  inScope,
  mergeStations,
  summarizeStores,
} from "./summary";

function station(
  overrides: Partial<NetworkStation> & Pick<NetworkStation, "id">,
): NetworkStation {
  return {
    name: `Станция ${overrides.id}`,
    code: overrides.id,
    storeId: "store-a",
    storeName: "Пилот",
    countryId: "country-1",
    countryName: "Демоленд",
    checklistCount: 1,
    deviceCount: 0,
    lastSubmissionAt: null,
    gaps: [],
    ...overrides,
  };
}

const MON = new Date("2026-09-28T09:00:00Z");
const TUE = new Date("2026-09-29T09:00:00Z");

describe("станции главной", () => {
  test("статус берётся у дырок раздела «Станции», а не считается заново", () => {
    const merged = mergeStations(
      [
        station({ id: "a" }),
        station({ id: "b", gaps: ["silent"] }),
        station({ id: "c", checklistCount: 0, gaps: ["noChecklist"] }),
      ],
      [],
    );

    expect(merged.map((s) => s.status)).toEqual([
      "working",
      "silent",
      "noChecklist",
    ]);
  });

  test("планшеты: число и самая свежая связь; без записи — без планшета", () => {
    const [withTwo, without] = mergeStations(
      [station({ id: "a" }), station({ id: "b" })],
      [
        {
          stationId: "a",
          tablets: [{ lastSeenAt: MON }, { lastSeenAt: TUE }],
        },
      ],
    );

    expect(withTwo?.tabletCount).toBe(2);
    expect(withTwo?.lastSeenAt).toEqual(TUE);
    expect(without?.tabletCount).toBe(0);
    expect(without?.lastSeenAt).toBeNull();
  });

  test("в работе — только работающие; молчащая и пустая в «работе» не считаются", () => {
    const merged = mergeStations(
      [
        station({ id: "a" }),
        station({ id: "b" }),
        station({ id: "c", gaps: ["silent"] }),
        station({ id: "d", checklistCount: 0, gaps: ["noChecklist"] }),
      ],
      [],
    );

    expect(countWorking(merged)).toEqual({ working: 2, total: 4 });
    expect(countGapsOf(merged)).toEqual({ noChecklist: 1, silent: 1 });
  });

  test("область: страна, пиццерия и станция сужают по очереди", () => {
    const merged = mergeStations(
      [
        station({ id: "a" }),
        station({ id: "b", storeId: "store-b" }),
        station({ id: "c", countryId: "country-2", storeId: "store-c" }),
      ],
      [],
    );

    expect(inScope(merged, {}).map((s) => s.id)).toEqual(["a", "b", "c"]);
    expect(
      inScope(merged, { countryId: "country-1" }).map((s) => s.id),
    ).toEqual(["a", "b"]);
    expect(inScope(merged, { storeId: "store-b" }).map((s) => s.id)).toEqual([
      "b",
    ]);
    expect(inScope(merged, { stationId: "c" }).map((s) => s.id)).toEqual(["c"]);
  });
});

describe("сводка по пиццериям", () => {
  test("строка на пиццерию: всего, в работе, с планшетом, последнее заполнение", () => {
    const merged = mergeStations(
      [
        station({ id: "a", lastSubmissionAt: MON }),
        station({ id: "b", gaps: ["silent"], lastSubmissionAt: TUE }),
        station({
          id: "c",
          storeId: "store-b",
          storeName: "Абая",
          checklistCount: 0,
          gaps: ["noChecklist"],
        }),
      ],
      [{ stationId: "b", tablets: [{ lastSeenAt: TUE }] }],
    );

    expect(summarizeStores(merged)).toEqual([
      {
        storeId: "store-b",
        storeName: "Абая",
        countryName: "Демоленд",
        total: 1,
        working: 0,
        withTablet: 0,
        lastSubmissionAt: null,
      },
      {
        storeId: "store-a",
        storeName: "Пилот",
        countryName: "Демоленд",
        total: 2,
        working: 1,
        withTablet: 1,
        lastSubmissionAt: TUE,
      },
    ]);
  });
});
