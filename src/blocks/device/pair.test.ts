// Ввод пина на планшете — отказные пути (#146). Каждый из них молчит, если сломан:
// пропущенный счётчик выглядит как обычный отказ «код не подошёл», а привязка по
// негодному коду — как успешная привязка. Поэтому тесты идут через `pairTablet` целиком,
// на настоящей базе, а запрос Next (заголовки и куки) подменён своим хранилищем.
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { devices, getDb } from "@/blocks/data";
import { createStation } from "@/blocks/data/testing/fixtures";

import { pairDevice } from "./devices";
import { pairTablet } from "./pair";
import { issuePairingPin } from "./pairing";
import { PIN_TTL_SECONDS } from "./pin";
import {
  DEVICE_COOKIE_NAME,
  createDeviceToken,
  readDeviceToken,
} from "./session";

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

// Предел попыток живёт в памяти модуля и считает по переданному мигу. Каждый тест
// получает своё окно на час позже прежнего — иначе попытки соседних тестов
// складывались бы в один счёт и отказ «слишком часто» приходил бы не от этого теста.
let hourOffset = 0;
function freshWindow(): Date {
  hourOffset += 1;
  return new Date(Date.UTC(2026, 8, 23, 0, 0, 0) + hourOffset * HOUR);
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
    const pin = await issuePairingPin(stationId, now);

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
    const pin = await issuePairingPin(stationId, now);
    const wrong = pin.code === "0000" ? "0001" : "0000";

    expect(await pairTablet({ code: wrong }, now)).toEqual({ kind: "refused" });
    expect(await deviceRowsOf(stationId)).toBe(0);
    expect(jar.has(DEVICE_COOKIE_NAME)).toBe(false);
  });

  it("истёкший код — тот же отказ, что и неверный", async () => {
    const now = freshWindow();
    const { stationId } = await createStation();
    const pin = await issuePairingPin(stationId, now);
    const afterExpiry = new Date(now.getTime() + PIN_TTL_SECONDS * SECOND);

    expect(await pairTablet({ code: pin.code }, afterExpiry)).toEqual({
      kind: "refused",
    });
    expect(await deviceRowsOf(stationId)).toBe(0);
  });

  it("съеденный код второй раз не привязывает", async () => {
    const now = freshWindow();
    const { stationId } = await createStation();
    const pin = await issuePairingPin(stationId, now);

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
    const pin = await issuePairingPin(stationId, now);

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
    const pin = await issuePairingPin(next.stationId, now);

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
    const pin = await issuePairingPin(mine.stationId, now);

    expect(await pairTablet({ code: pin.code }, now)).toEqual({
      kind: "paired",
    });

    expect(await deviceRowsOf(neighbour.stationId)).toBe(1);
  });
});
