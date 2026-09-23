import { openSignedToken, packSignedToken } from "@/blocks/core/signed-token";

/** Имя сессионной куки. Одно на весь продукт: аккаунт в MVP один (D014). */
export const SESSION_COOKIE_NAME = "meridius_admin";

/**
 * Срок жизни сессии — 30 дней по контракту блока.
 *
 * Отозвать выданную сессию раньше срока можно только сменой `SESSION_SECRET`:
 * подпись зависит от него и не зависит от пароля, поэтому смена одного лишь
 * `ADMIN_PASSWORD_HASH` украденную куку НЕ обесценивает. Хранилища сессий в MVP нет.
 */
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

const PAYLOAD_VERSION = 1;
const MILLISECONDS = 1000;

/** Сессия администратора. Ни имени, ни роли: в MVP аккаунт один и прав у него все. */
export interface AdminSession {
  readonly issuedAt: Date;
  readonly expiresAt: Date;
}

interface Payload {
  readonly issuedAt: number;
  readonly expiresAt: number;
}

/**
 * Разбор содержимого куки. Подпись к этому моменту уже сошлась (`openSignedToken`):
 * здесь проверяется только смысл полей — он принадлежит входу, а не общей подписи.
 */
function parsePayload(claims: Record<string, unknown>): Payload | null {
  const { v, iat, exp } = claims;
  if (
    v !== PAYLOAD_VERSION ||
    typeof iat !== "number" ||
    typeof exp !== "number"
  ) {
    return null;
  }

  return { issuedAt: iat, expiresAt: exp };
}

/**
 * Собирает значение сессионной куки: содержимое и подпись HMAC-SHA256 на `SESSION_SECRET`.
 * Внутри только отметки времени — ни пароля, ни секрета, ни персональных данных.
 *
 * Подпись берётся из `core/signed-token`: она одна на весь продукт, и вторая копия
 * рядом с кукой планшета была бы тем расхождением, которое годами выглядит рабочим.
 */
export function createSessionToken(secret: string, now: Date): string {
  const issuedAt = Math.floor(now.getTime() / MILLISECONDS);
  return packSignedToken(
    {
      v: PAYLOAD_VERSION,
      iat: issuedAt,
      exp: issuedAt + SESSION_MAX_AGE_SECONDS,
    },
    secret,
  );
}

/**
 * Разбирает куку. Возвращает сессию, только если подпись сходится и срок не истёк;
 * во всех остальных случаях — null, без исключений: мусор в куке приходит из интернета.
 */
export function readSessionToken(
  token: string,
  secret: string,
  now: Date,
): AdminSession | null {
  const claims = openSignedToken(token, secret);
  if (claims === null) return null;

  const parsed = parsePayload(claims);
  if (parsed === null) return null;

  const expiresAt = new Date(parsed.expiresAt * MILLISECONDS);
  if (now.getTime() >= expiresAt.getTime()) return null;

  return { issuedAt: new Date(parsed.issuedAt * MILLISECONDS), expiresAt };
}
