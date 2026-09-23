// Кука привязанного планшета: чем вкладка называет себя на каждом запросе.
//
// Подпись берётся из `core/signed-token` — она одна на весь продукт. Секрет свой
// (`DEVICE_SESSION_SECRET`, см. `./config`): утёкший ключ кухонного планшета не должен
// печатать сессии кабинета.
import { openSignedToken, packSignedToken } from "@/blocks/core/signed-token";

import { isDeviceId } from "./devices";

/** Имя куки планшета. Рядом с админской (`meridius_admin`) и намеренно другое. */
export const DEVICE_COOKIE_NAME = "meridius_device";

/**
 * Год. Планшет висит на стене и не должен просить код каждую неделю: отзывают привязку
 * не сроком, а отвязкой из кабинета — она мгновенна, потому что подпись без живой строки
 * ничего не значит.
 */
export const DEVICE_COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

const PAYLOAD_VERSION = 1;
const MILLISECONDS = 1000;

/** Что лежит в куке: какой планшет и когда его привязали. Ни станции, ни кода станции. */
export interface DeviceToken {
  readonly deviceId: string;
  readonly issuedAt: Date;
}

/**
 * Собирает значение куки. Внутри — опознаватель устройства и время выпуска; станции в
 * куке нет намеренно: её спрашивают у базы по строке устройства, иначе отвязка и
 * перевод планшета на другую станцию оставались бы в старой куке.
 */
export function createDeviceToken(
  deviceId: string,
  secret: string,
  now: Date,
): string {
  return packSignedToken(
    {
      v: PAYLOAD_VERSION,
      id: deviceId,
      iat: Math.floor(now.getTime() / MILLISECONDS),
    },
    secret,
  );
}

/**
 * Читает куку. `null` — подпись не сошлась, содержимое не то или срок вышел; различать
 * эти случаи наружу незачем, ответ один: планшет не узнан, введите код.
 */
export function readDeviceToken(
  token: string,
  secret: string,
  now: Date,
): DeviceToken | null {
  const claims = openSignedToken(token, secret);
  if (claims === null) return null;

  const { v, id, iat } = claims;
  if (
    v !== PAYLOAD_VERSION ||
    typeof id !== "string" ||
    typeof iat !== "number"
  ) {
    return null;
  }

  // Опознаватель проверяется здесь, а не в базе: подпись сошлась только у того, кто
  // знает секрет, но своя же кука старого вида не должна уезжать в запрос как есть.
  if (!isDeviceId(id)) return null;

  const issuedAt = new Date(iat * MILLISECONDS);
  const expiresAt = new Date(
    issuedAt.getTime() + DEVICE_COOKIE_MAX_AGE_SECONDS * MILLISECONDS,
  );
  if (now.getTime() >= expiresAt.getTime()) return null;

  return { deviceId: id, issuedAt };
}
