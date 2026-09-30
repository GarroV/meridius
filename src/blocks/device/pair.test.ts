// Ввод пина на планшете — отказные пути (#146). Каждый из них молчит, если сломан:
// пропущенный счётчик выглядит как обычный отказ «код не подошёл», а привязка по
// негодному коду — как успешная привязка. Поэтому тесты идут через `pairTablet` целиком,
// на настоящей базе, а запрос Next (заголовки и куки) подменён своим хранилищем.
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { devicePairings, devices, getDb } from "@/blocks/data";
import { createStation } from "@/blocks/data/testing/fixtures";

import { pairDevice } from "./devices";
import { pairTablet } from "./pair";
import { pgErrorCode } from "./pg-error";
import { PIN_TTL_SECONDS } from "./pin";
import {
  DEVICE_COOKIE_NAME,
  createDeviceToken,
  readDeviceToken,
} from "./session";
import { holdPairingsLock } from "./testing/pairings-lock";

// Строки `device_pairings` этого файла не должны встретить чужой выпуск посреди проверки (T346).
holdPairingsLock();

const jar = vi.hoisted(() => new Map<string, string>());

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve({ get: () => null }),
  cookies: () =>
    Promise.resolve({
      get: (name: string) => {
        const value = jar.get(name);
        return value === undefined ? undefined : { name, value };
      },
      set: (cookie: { name: string; value: string }) => {
        jar.set(cookie.name, cookie.value);
      },
    }),
}));

const SECRET = "секрет-подписи-куки-планшета-для-проверок-0123456789";
const SECOND = 1000;
const HOUR = 60 * 60 * SECOND;
/** Предел «на всех» из `rate-limit.ts`: клиентов без посредника различить нечем. */
const EVERYONE_LIMIT = 60;
const PIN_SPACE = 10_000;
const PIN_ATTEMPTS = 20;
const PG_UNIQUE_VIOLATION = "23505";

// Предел попыток живёт в базе (#144) и считает по переданному мигу. Каждый тест
// получает своё окно на час позже прежнего — иначе попытки соседних тестов
// складывались бы в один счёт и отказ «слишком часто» приходил бы не от этого теста.
// Год — позже любого «сейчас» соседних файлов (`pairing-failures.test.ts` живёт в 2030):
// их выпуск чистит пины, истёкшие к ИХ мигу, и пин этого файла им не достаётся.
let hourOffset = 0;
function freshWindow(): Date {
  hourOffset += 1;
  return new Date(Date.UTC(2031, 0, 1, 0, 0, 0) + hourOffset * HOUR);
}

/**
 * Пин заводится строкой в базе, а не выпуском. Выпуск чистит истёкшие пины ВСЕХ станций
 * по своему «сейчас», а соседние файлы тестов выпускают параллельно со своими мигами —
 * и снимали пин этого теста посреди него (поймано прогоном: «съеденный код» получал
 * отказ на первом же вводе). Выпуск проверяет `pairing.test.ts`, здесь — ввод.
 */
async function pinFor(stationId: string, now: Date): Promise<{ code: string }> {
  const expiresAt = new Date(now.getTime() + PIN_TTL_SECONDS * SECOND);
  for (let attempt = 0; attempt < PIN_ATTEMPTS; attempt++) {
    const code = String(Math.floor(Math.random() * PIN_SPACE)).padStart(4, "0");
    try {
      await getDb()
        .insert(devicePairings)
        .values({ code, stationId, expiresAt });
      return { code };
    } catch (error) {
      if (pgErrorCode(error) !== PG_UNIQUE_VIOLATION) throw error;
    }
  }
  throw new Error("свободный код для теста не нашёлся");
}

async function deviceRowsOf(stationId: string): Promise<number> {
  const rows = await getDb()
    .select({ id: devices.id })
    .from(devices)
    .where(eq(devices.stationId, stationId));
  return rows.length;
}

beforeEach(() => {
  jar.clear();
  vi.stubEnv("DEVICE_SESSION_SECRET", SECRET);
  vi.stubEnv("TRUSTED_PROXY_HOPS", undefined);
});

describe("ввод пина: отказы", () => {
  it("частота считается и на мусоре: после предела отказ «часто» даже на верном коде", async () => {
    const now = freshWindow();
    const { stationId } = await createStation();
    const pin = await pinFor(stationId, now);

    for (let i = 0; i < EVERYONE_LIMIT; i++) {
      expect(await pairTablet({ code: "не код" }, now)).toEqual({
        kind: "refused",
      });
    }

    const outcome = await pairTablet({ code: pin.code }, now);
    expect(outcome.kind).toBe("tooOften");
    expect(await deviceRowsOf(stationId)).toBe(0);
    expect(jar.has(DEVICE_COOKIE_NAME)).toBe(false);
  });

  it("тело не того вида — отказ, а не падение: действие зовёт кто угодно", async () => {
    const now = freshWindow();
    for (const input of [null, undefined, "1234", [], { code: 1234 }, {}]) {
      expect(await pairTablet(input, now)).toEqual({ kind: "refused" });
    }
    expect(jar.has(DEVICE_COOKIE_NAME)).toBe(false);
  });

  it("несуществующий код — отказ без строки устройства и без куки", async () => {
    const now = freshWindow();
    const { stationId } = await createStation();
    const pin = await pinFor(stationId, now);
    const wrong = pin.code === "0000" ? "0001" : "0000";

    expect(await pairTablet({ code: wrong }, now)).toEqual({ kind: "refused" });
    expect(await deviceRowsOf(stationId)).toBe(0);
    expect(jar.has(DEVICE_COOKIE_NAME)).toBe(false);
  });

  it("истёкший код — тот же отказ, что и неверный", async () => {
    const now = freshWindow();
    const { stationId } = await createStation();
    const pin = await pinFor(stationId, now);
    const afterExpiry = new Date(now.getTime() + PIN_TTL_SECONDS * SECOND);

    expect(await pairTablet({ code: pin.code }, afterExpiry)).toEqual({
      kind: "refused",
    });
    expect(await deviceRowsOf(stationId)).toBe(0);
  });

  it("съеденный код второй раз не привязывает", async () => {
    const now = freshWindow();
    const { stationId } = await createStation();
    const pin = await pinFor(stationId, now);

    expect(await pairTablet({ code: pin.code }, now)).toEqual({
      kind: "paired",
    });
    jar.clear();
    expect(await pairTablet({ code: pin.code }, now)).toEqual({
      kind: "refused",
    });
    expect(await deviceRowsOf(stationId)).toBe(1);
    expect(jar.has(DEVICE_COOKIE_NAME)).toBe(false);
  });
});

describe("ввод пина: привязка", () => {
  it("пробелы вокруг кода не мешают, кука подписана и называет новую строку", async () => {
    const now = freshWindow();
    const { stationId } = await createStation();
    const pin = await pinFor(stationId, now);

    expect(await pairTablet({ code: ` ${pin.code} ` }, now)).toEqual({
      kind: "paired",
    });

    const token = jar.get(DEVICE_COOKIE_NAME);
    expect(token).toBeDefined();
    const read = readDeviceToken(token ?? "", SECRET, now);
    const [row] = await getDb()
      .select({ id: devices.id })
      .from(devices)
      .where(eq(devices.stationId, stationId));
    expect(read?.deviceId).toBe(row?.id);
  });

  it("планшет с прежней кукой: прежняя строка снимается, призрака нет", async () => {
    const now = freshWindow();
    const old = await createStation();
    const next = await createStation();
    const previous = await pairDevice({ stationId: old.stationId }, now);
    jar.set(DEVICE_COOKIE_NAME, createDeviceToken(previous.id, SECRET, now));
    const pin = await pinFor(next.stationId, now);

    expect(await pairTablet({ code: pin.code }, now)).toEqual({
      kind: "paired",
    });

    expect(await deviceRowsOf(old.stationId)).toBe(0);
    expect(await deviceRowsOf(next.stationId)).toBe(1);
  });

  it("чужая подпись в прежней куке не снимает чужую строку", async () => {
    const now = freshWindow();
    const neighbour = await createStation();
    const mine = await createStation();
    const victim = await pairDevice({ stationId: neighbour.stationId }, now);
    jar.set(
      DEVICE_COOKIE_NAME,
      createDeviceToken(
        victim.id,
        "поддельный-секрет-той-же-длины-0123456789abcdef",
        now,
      ),
    );
    const pin = await pinFor(mine.stationId, now);

    expect(await pairTablet({ code: pin.code }, now)).toEqual({
      kind: "paired",
    });

    expect(await deviceRowsOf(neighbour.stationId)).toBe(1);
  });
});
