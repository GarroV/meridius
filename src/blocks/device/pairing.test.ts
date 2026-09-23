// Пин привязки — код доступа: подобранный или переживший свой срок код отдаёт планшету
// станцию (D021, D132). Поэтому проверки написаны ДО кода и идут на настоящей базе:
// одноразовость и срок здесь выражены запросом к PostgreSQL, а не ветками в коде, и
// заглушка не проверила бы ровно то, ради чего запрос такой.
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { devicePairings, getDb } from "@/blocks/data";
import { createStation } from "@/blocks/data/testing/fixtures";

import { PIN_TTL_SECONDS, consumePairingPin, issuePairingPin } from "./pairing";

const NOW = new Date("2026-09-23T10:00:00Z");
const SECOND = 1000;

function later(seconds: number): Date {
  return new Date(NOW.getTime() + seconds * SECOND);
}

async function livePinCount(stationId: string): Promise<number> {
  const rows = await getDb()
    .select({ id: devicePairings.id })
    .from(devicePairings)
    .where(eq(devicePairings.stationId, stationId));
  return rows.length;
}

describe("выпуск пина", () => {
  it("отдаёт четыре цифры и срок в пять минут", async () => {
    const { stationId } = await createStation();

    const pin = await issuePairingPin(stationId, NOW);

    expect(pin.code).toMatch(/^\d{4}$/);
    expect(pin.expiresAt.getTime()).toBe(
      NOW.getTime() + PIN_TTL_SECONDS * SECOND,
    );
  });

  it("гасит прежний несъеденный пин ЭТОЙ станции: два живых кода — повод ввести не тот", async () => {
    const { stationId } = await createStation();
    const first = await issuePairingPin(stationId, NOW);

    await issuePairingPin(stationId, later(10));

    expect(await consumePairingPin(first.code, later(20))).toBeNull();
    expect(await livePinCount(stationId)).toBe(1);
  });

  it("не трогает живой пин ЧУЖОЙ станции", async () => {
    const mine = await createStation();
    const neighbour = await createStation();
    const neighbourPin = await issuePairingPin(neighbour.stationId, NOW);

    await issuePairingPin(mine.stationId, later(10));

    expect(await consumePairingPin(neighbourPin.code, later(20))).toEqual({
      stationId: neighbour.stationId,
    });
  });

  it("чистит истёкшие несъеденные пины тем же запросом, что выпускает новый", async () => {
    const stale = await createStation();
    const fresh = await createStation();
    await issuePairingPin(stale.stationId, NOW);

    // Выпуск случился после того, как чужой пин истёк: уборщика в продукте нет,
    // чистка живёт в самом выпуске — иначе четырёхзначные значения однажды кончатся.
    await issuePairingPin(fresh.stationId, later(PIN_TTL_SECONDS + 1));

    expect(await livePinCount(stale.stationId)).toBe(0);
  });
});

describe("съедание пина", () => {
  it("отдаёт станцию первому, кто ввёл, и больше никому", async () => {
    const { stationId } = await createStation();
    const pin = await issuePairingPin(stationId, NOW);

    expect(await consumePairingPin(pin.code, later(10))).toEqual({ stationId });
    expect(await consumePairingPin(pin.code, later(11))).toBeNull();
  });

  it("не отдаёт станцию после истечения срока", async () => {
    const { stationId } = await createStation();
    const pin = await issuePairingPin(stationId, NOW);

    expect(
      await consumePairingPin(pin.code, later(PIN_TTL_SECONDS + 1)),
    ).toBeNull();
  });

  it("живёт ровно до последней секунды срока", async () => {
    const { stationId } = await createStation();
    const pin = await issuePairingPin(stationId, NOW);

    expect(
      await consumePairingPin(pin.code, later(PIN_TTL_SECONDS - 1)),
    ).toEqual({ stationId });
  });

  it("не отдаёт ничего на несуществующий и на негодный код", async () => {
    expect(await consumePairingPin("0000", NOW)).toBeNull();
    expect(await consumePairingPin("не код", NOW)).toBeNull();
    expect(await consumePairingPin("", NOW)).toBeNull();
  });

  it("при двух одновременных попытках станцию получает ровно один", async () => {
    // Ровно та последовательность, которая обходится у входа в кабинет (#93):
    // «прочитать, проверить, записать» здесь пропустила бы обоих.
    const { stationId } = await createStation();
    const pin = await issuePairingPin(stationId, NOW);

    const outcomes = await Promise.all([
      consumePairingPin(pin.code, later(10)),
      consumePairingPin(pin.code, later(10)),
      consumePairingPin(pin.code, later(10)),
    ]);

    expect(outcomes.filter((outcome) => outcome !== null)).toEqual([
      { stationId },
    ]);
  });
});
