// Режим смены пиццерии на настоящей базе: местная дата считается часовым поясом
// пиццерии, а история перестановок обязана оставаться целой (D055).
import { afterAll, describe, expect, test } from "vitest";

import {
  getShiftMode,
  getShiftModeOnDate,
  listShiftModeChanges,
  setShiftMode,
} from "./shift-modes";
import { closeTestDb, getTestDb } from "./testing/db";
import { createStation } from "./testing/fixtures";

getTestDb();
afterAll(closeTestDb);

/** 06.09.2026, 20:00 UTC — в Алма-Ате (+05) это уже 01:00 седьмого сентября. */
const EVENING_UTC = new Date(Date.UTC(2026, 8, 6, 20, 0, 0));
const MORNING_UTC = new Date(Date.UTC(2026, 8, 6, 8, 0, 0));

describe("getShiftMode", () => {
  test("пиццерия без выбора работает полной сменой", async () => {
    const { storeId } = await createStation();

    const state = await getShiftMode(storeId, MORNING_UTC);

    expect(state).toMatchObject({ mode: "normal", chosen: false });
    expect(state?.staffPresent).toBeNull();
  });

  test("несуществующая пиццерия не выдумывает режим", async () => {
    const state = await getShiftMode(
      "00000000-0000-4000-8000-000000000000",
      MORNING_UTC,
    );

    expect(state).toBeNull();
  });
});

describe("setShiftMode", () => {
  test("выбранный режим начинает действовать", async () => {
    const { storeId } = await createStation();

    await setShiftMode(
      { storeId, mode: "reduced", staffPresent: 2, staffExpected: 4 },
      MORNING_UTC,
    );
    const state = await getShiftMode(storeId, MORNING_UTC);

    expect(state).toMatchObject({
      mode: "reduced",
      chosen: true,
      staffPresent: 2,
      staffExpected: 4,
    });
  });

  test("действует последняя перестановка, а не первая", async () => {
    const { storeId } = await createStation();

    await setShiftMode({ storeId, mode: "critical" }, MORNING_UTC);
    await setShiftMode({ storeId, mode: "reduced" }, MORNING_UTC);

    expect((await getShiftMode(storeId, MORNING_UTC))?.mode).toBe("reduced");
  });

  test("история перестановок остаётся целой", async () => {
    const { storeId } = await createStation();

    await setShiftMode({ storeId, mode: "critical" }, MORNING_UTC);
    await setShiftMode({ storeId, mode: "normal" }, MORNING_UTC);

    const changes = await listShiftModeChanges(storeId, MORNING_UTC);

    expect(changes.map((change) => change.mode)).toStrictEqual([
      "normal",
      "critical",
    ]);
  });

  test("вчерашний режим сегодня не действует", async () => {
    const { storeId } = await createStation();
    const yesterday = new Date(Date.UTC(2026, 8, 5, 8, 0, 0));

    await setShiftMode({ storeId, mode: "critical" }, yesterday);

    expect((await getShiftMode(storeId, MORNING_UTC))?.mode).toBe("normal");
  });
});

describe("сутки считаются по часовому поясу пиццерии", () => {
  test("режим гаснет в местную полночь, а не в полночь UTC", async () => {
    const { storeId } = await createStation({ timezone: "Asia/Almaty" });

    // Выбран утром шестого по местному времени.
    await setShiftMode({ storeId, mode: "critical" }, MORNING_UTC);

    // 20:00 UTC — это уже 01:00 седьмого в Алма-Ате: наступили новые сутки.
    expect((await getShiftMode(storeId, EVENING_UTC))?.mode).toBe("normal");
  });

  test("в пиццерии на UTC те же сутки продолжаются", async () => {
    const { storeId } = await createStation({ timezone: "UTC" });

    await setShiftMode({ storeId, mode: "critical" }, MORNING_UTC);

    expect((await getShiftMode(storeId, EVENING_UTC))?.mode).toBe("critical");
  });
});

describe("getShiftModeOnDate", () => {
  test("отдаёт режим тех суток, о которых спросили, а не сегодняшних", async () => {
    const { storeId } = await createStation({ timezone: "UTC" });
    await setShiftMode({ storeId, mode: "reduced" }, MORNING_UTC);

    expect(await getShiftModeOnDate(storeId, "2026-09-06")).toBe("reduced");
    // Проход окна через полночь начался вчера — и режим у него вчерашний (D055).
    expect(await getShiftModeOnDate(storeId, "2026-09-07")).toBe("normal");
  });

  test("режим не выбирали — смена полная: сокращение всегда осознанное действие", async () => {
    const { storeId } = await createStation();

    expect(await getShiftModeOnDate(storeId, "2026-09-06")).toBe("normal");
  });

  test("действует последняя перестановка за эти сутки", async () => {
    const { storeId } = await createStation({ timezone: "UTC" });
    await setShiftMode({ storeId, mode: "critical" }, MORNING_UTC);
    await setShiftMode({ storeId, mode: "reduced" }, MORNING_UTC);

    expect(await getShiftModeOnDate(storeId, "2026-09-06")).toBe("reduced");
  });
});
