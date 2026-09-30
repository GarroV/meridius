// Отказные пути выпуска пина (#146). Сломанный отказ здесь выглядит как удача: пин,
// которого нет в базе, выдан управляющему, или ошибка базы проглочена повтором.
// Генератор кода подменён, чтобы столкновение значений было не случайностью, а условием
// теста; всё остальное — настоящая база.
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";

import { devicePairings, getDb } from "@/blocks/data";
import { createStation } from "@/blocks/data/testing/fixtures";

import { classifyIssueFailure } from "./issue-failure";
import { consumePairingPin, issuePairingPin } from "./pairing";
import { PinsExhaustedError } from "./pin-errors";
import { holdPairingsLock } from "./testing/pairings-lock";

// Выпуск чистит истёкшие пины всех станций: соседние файлы с пинами ждут своей очереди (T346).
holdPairingsLock();

/** Значение, которое генератор отдаёт на каждый вызов. */
const FIXED_CODE = 4242;

vi.mock("node:crypto", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:crypto")>();
  return { ...original, randomInt: vi.fn(() => FIXED_CODE) };
});

// Мгновение впереди соседних файлов само по себе не защищает: оно же делает этот файл
// тем, кто сметает их пины (T346). Разводит файлы блокировка выше, а не эпохи.
const NOW = new Date("2030-01-01T10:00:00Z");
const MISSING_STATION = "2f1c9a3e-0000-4000-8000-000000000000";

afterEach(async () => {
  await getDb()
    .delete(devicePairings)
    .where(eq(devicePairings.code, String(FIXED_CODE)));
});

describe("выпуск пина: отказы", () => {
  it("все значения заняты — свой отказ «временно», а не пин, которого нет в базе", async () => {
    const holder = await createStation();
    const { stationId } = await createStation();
    await issuePairingPin(holder.stationId, NOW);

    const attempt = issuePairingPin(stationId, NOW);

    await expect(attempt).rejects.toBeInstanceOf(PinsExhaustedError);
    const error: unknown = await attempt.catch((caught: unknown) => caught);
    expect(classifyIssueFailure(error)).toBe("temporary");
    // Занятый код по-прежнему ведёт к станции-владельцу, а не к новой.
    expect(await consumePairingPin(String(FIXED_CODE), NOW)).toEqual({
      stationId: holder.stationId,
    });
  });

  it("станции нет — ошибка базы уходит наверх, а не глотается повтором", async () => {
    const attempt = issuePairingPin(MISSING_STATION, NOW);

    await expect(attempt).rejects.toThrow();
    const error: unknown = await attempt.catch((caught: unknown) => caught);
    expect(error).not.toBeInstanceOf(PinsExhaustedError);
    expect(classifyIssueFailure(error)).toBe("stationGone");
    const rows = await getDb()
      .select({ id: devicePairings.id })
      .from(devicePairings)
      .where(eq(devicePairings.stationId, MISSING_STATION));
    expect(rows).toHaveLength(0);
  });
});
