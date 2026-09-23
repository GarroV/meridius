// Кука планшета — код доступа: тот, чья кука сходится, видит чек-лист станции и пишет
// в него отметки. Проверки написаны до кода и стоят на подделке, чужом секрете и сроке.
//
// Живой строки устройства подпись не заменяет — это проверяется отдельно
// (`devices.test.ts`) и сквозным сценарием: отвязали из кабинета, вкладка просит код.
import { describe, expect, it } from "vitest";

import {
  DEVICE_COOKIE_MAX_AGE_SECONDS,
  createDeviceToken,
  readDeviceToken,
} from "./session";

const SECRET = "device-secret-device-secret-device-1";
const OTHER_SECRET = "device-secret-device-secret-device-2";
const DEVICE_ID = "2f1c9a3e-1111-4000-8000-000000000001";
const NOW = new Date("2026-09-23T10:00:00Z");
const SECOND = 1000;

function later(seconds: number): Date {
  return new Date(NOW.getTime() + seconds * SECOND);
}

describe("кука привязанного планшета", () => {
  it("читается тем же секретом и называет планшет", () => {
    const token = createDeviceToken(DEVICE_ID, SECRET, NOW);

    expect(readDeviceToken(token, SECRET, later(60))).toEqual({
      deviceId: DEVICE_ID,
      issuedAt: NOW,
    });
  });

  it("не читается чужим секретом: админский ключ куку планшета не печатает", () => {
    const token = createDeviceToken(DEVICE_ID, SECRET, NOW);

    expect(readDeviceToken(token, OTHER_SECRET, later(60))).toBeNull();
  });

  it("не читается после года жизни", () => {
    const token = createDeviceToken(DEVICE_ID, SECRET, NOW);

    expect(
      readDeviceToken(token, SECRET, later(DEVICE_COOKIE_MAX_AGE_SECONDS + 1)),
    ).toBeNull();
  });

  it("не читается на мусоре и на подделанном опознавателе", () => {
    expect(readDeviceToken("", SECRET, NOW)).toBeNull();
    expect(readDeviceToken("не.кука", SECRET, NOW)).toBeNull();

    // Своя подпись, но опознаватель не того вида: такой ответ обязан быть отказом,
    // а не запросом в базу с негодным значением.
    const forged = createDeviceToken("не uuid", SECRET, NOW);
    expect(readDeviceToken(forged, SECRET, later(60))).toBeNull();
  });
});
