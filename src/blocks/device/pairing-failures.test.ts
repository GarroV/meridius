// Отказные пути выпуска пина (#146). Сломанный отказ здесь выглядит как удача: пин,
// которого нет в базе, выдан управляющему, или ошибка базы проглочена повтором.
// Генератор кода подменён, чтобы столкновение значений было не случайностью, а условием
// теста; всё остальное — настоящая база.
import { randomInt } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";

import { devicePairings, getDb } from "@/blocks/data";
import { createStation } from "@/blocks/data/testing/fixtures";

import { classifyIssueFailure } from "./issue-failure";
import { consumePairingPin, issuePairingPin } from "./pairing";
import { PIN_TTL_SECONDS } from "./pin";
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

// Совпадение с кодом строки, которую выпуск сам же и убирает, — не занятое значение (#206).
// Раньше чистка и вставка шли одним запросом, удалённая строка место в индексе не
// освобождала, запрос откатывался вместе с чисткой и тратил попытку; при генераторе,
// который всегда отдаёт одно значение, это был отказ «свободный код не нашёлся».
describe("выпуск пина: совпадение с тем, что выпуск убирает", () => {
  const SECOND = 1000;

  it("код истёкшего несъеденного пина чужой станции выдаётся с первой попытки", async () => {
    const stale = await createStation();
    const { stationId } = await createStation();
    await getDb()
      .insert(devicePairings)
      .values({
        code: String(FIXED_CODE),
        stationId: stale.stationId,
        expiresAt: new Date(NOW.getTime() - SECOND),
      });
    vi.mocked(randomInt).mockClear();

    const pin = await issuePairingPin(stationId, NOW);

    expect(pin.code).toBe(String(FIXED_CODE));
    expect(randomInt).toHaveBeenCalledTimes(1);
    expect(await consumePairingPin(String(FIXED_CODE), NOW)).toEqual({
      stationId,
    });
  });

  it("код прежнего несъеденного пина той же станции выдаётся снова, прежний гаснет", async () => {
    const { stationId } = await createStation();
    await issuePairingPin(stationId, NOW);
    vi.mocked(randomInt).mockClear();

    const later = new Date(NOW.getTime() + (PIN_TTL_SECONDS / 2) * SECOND);
    const pin = await issuePairingPin(stationId, later);

    expect(pin.expiresAt.getTime()).toBe(
      later.getTime() + PIN_TTL_SECONDS * SECOND,
    );
    expect(randomInt).toHaveBeenCalledTimes(1);
    const rows = await getDb()
      .select({ id: devicePairings.id })
      .from(devicePairings)
      .where(eq(devicePairings.stationId, stationId));
    expect(rows).toHaveLength(1);
  });
});
