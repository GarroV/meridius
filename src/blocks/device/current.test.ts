// Кто пришёл на запрос вкладки — отказные пути (#146). Сломанный отказ здесь молчит
// хуже всего: подделанная, чужая или просроченная кука, принятая за годную, выглядит как
// обычная работающая вкладка. Проверки идут на настоящей базе, куки запроса подменены.
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { devices, getDb } from "@/blocks/data";
import { createStation } from "@/blocks/data/testing/fixtures";

import { currentDevice, deviceIdFromCookie, rememberDevice } from "./current";
import { pairDevice, unpairDevice } from "./devices";
import {
  DEVICE_COOKIE_MAX_AGE_SECONDS,
  DEVICE_COOKIE_NAME,
  createDeviceToken,
} from "./session";

interface StoredCookie {
  readonly value: string;
  readonly options: Record<string, unknown>;
}

const jar = vi.hoisted(() => new Map<string, StoredCookie>());

vi.mock("next/headers", () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) => {
        const found = jar.get(name);
        return found === undefined ? undefined : { name, value: found.value };
      },
      set: (
        cookie: { name: string; value: string } & Record<string, unknown>,
      ) => {
        jar.set(cookie.name, { value: cookie.value, options: cookie });
      },
    }),
}));

const SECRET = "секрет-подписи-куки-планшета-для-проверок-0123456789";
const OTHER_SECRET = "другой-секрет-подписи-той-же-длины-0123456789abcdef";
const SECOND = 1000;
const ANCIENT = new Date("2020-01-01T00:00:00Z");

function putCookie(value: string): void {
  jar.set(DEVICE_COOKIE_NAME, { value, options: {} });
}

async function lastSeenOf(id: string): Promise<Date | undefined> {
  const [row] = await getDb()
    .select({ lastSeenAt: devices.lastSeenAt })
    .from(devices)
    .where(eq(devices.id, id));
  return row?.lastSeenAt;
}

beforeEach(() => {
  jar.clear();
  vi.stubEnv("DEVICE_SESSION_SECRET", SECRET);
});

describe("кука планшета: отказы", () => {
  it("куки нет — планшет не узнан, секрет даже не спрашивается", async () => {
    vi.stubEnv("DEVICE_SESSION_SECRET", "");

    expect(await deviceIdFromCookie(new Date())).toBeNull();
    expect(await currentDevice()).toBeNull();
  });

  it("кука есть, а секрета нет — отказ настройки, а не «кука годна»", async () => {
    putCookie(createDeviceToken(crypto.randomUUID(), SECRET, new Date()));
    vi.stubEnv("DEVICE_SESSION_SECRET", "");

    await expect(deviceIdFromCookie(new Date())).rejects.toThrow(
      /DEVICE_SESSION_SECRET/,
    );
  });

  it("подпись чужим секретом — не узнан, хотя строка устройства живая", async () => {
    const { stationId } = await createStation();
    const device = await pairDevice({ stationId }, new Date());
    putCookie(createDeviceToken(device.id, OTHER_SECRET, new Date()));

    expect(await deviceIdFromCookie(new Date())).toBeNull();
    expect(await currentDevice()).toBeNull();
  });

  it("мусор вместо куки — не узнан и не падает: куку пишет кто угодно", async () => {
    for (const value of ["", "мусор", "a.b", "eyJ2IjoxfQ.подпись"]) {
      putCookie(value);
      expect(await deviceIdFromCookie(new Date())).toBeNull();
    }
  });

  it("кука старше года — не узнан, даже с живой строкой", async () => {
    const { stationId } = await createStation();
    const device = await pairDevice({ stationId }, new Date());
    const issued = new Date(
      Date.now() - (DEVICE_COOKIE_MAX_AGE_SECONDS + 60) * SECOND,
    );
    putCookie(createDeviceToken(device.id, SECRET, issued));

    expect(await currentDevice()).toBeNull();
  });

  it("отвязанный планшет с годной кукой не узнаётся тем же мигом", async () => {
    const { stationId } = await createStation();
    const device = await pairDevice({ stationId }, new Date());
    putCookie(createDeviceToken(device.id, SECRET, new Date()));
    await unpairDevice(device.id);

    expect(await deviceIdFromCookie(new Date())).toBe(device.id);
    expect(await currentDevice()).toBeNull();
  });
});

describe("кука планшета: годная", () => {
  it("узнаёт живую строку, отдаёт код станции и отмечает «был на связи»", async () => {
    const { stationId, stationCode } = await createStation();
    const device = await pairDevice({ stationId }, ANCIENT);
    putCookie(createDeviceToken(device.id, SECRET, new Date()));

    const found = await currentDevice();

    expect(found).toEqual({ id: device.id, stationId, stationCode });
    const seen = await lastSeenOf(device.id);
    expect(seen?.getTime()).toBeGreaterThan(ANCIENT.getTime());
  });

  it("запоминание пишет подписанную куку с защитными флагами", async () => {
    const id = crypto.randomUUID();
    const now = new Date();

    await rememberDevice(id, now);

    const stored = jar.get(DEVICE_COOKIE_NAME);
    expect(stored?.options).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: DEVICE_COOKIE_MAX_AGE_SECONDS,
    });
    expect(await deviceIdFromCookie(now)).toBe(id);
  });
});
