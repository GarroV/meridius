import { openSignedToken, packSignedToken } from "@/blocks/core/signed-token";

/** Имя сессионной куки. Одно на весь кабинет: кто вошёл, говорит её содержимое (D145). */
export const SESSION_COOKIE_NAME = "meridius_admin";

/**
 * Срок жизни сессии — 30 дней по контракту блока.
 *
 * Отозвать выданную сессию раньше срока можно только сменой `SESSION_SECRET`:
 * подпись зависит от него и не зависит от пароля, поэтому смена одного лишь
 * `ADMIN_PASSWORD_HASH` украденную куку НЕ обесценивает. Хранилища сессий в MVP нет.
 */
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

// Версия 2 (D145): кука несёт учётную запись. Куки версии 1 учётки не несут и отнести
// их ни к одному тенанту нельзя — после выкатки все входят заново, и это намеренно.
const PAYLOAD_VERSION = 2;

/** Учётка УК из окружения площадки (`ADMIN_PASSWORD_HASH`): строки в базе у неё нет. */
export const ROOT_SUBJECT = "root";

const UUID_SHAPE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function isSubject(value: unknown): value is string {
  return (
    typeof value === "string" &&
    (value === ROOT_SUBJECT || UUID_SHAPE.test(value))
  );
}
const MILLISECONDS = 1000;

/**
 * Сессия кабинета. Внутри — только идентификатор учётки: тенант и страны читаются из
 * базы на каждый запрос, поэтому снятая учётка или отобранная страна действуют сразу, а
 * не через 30 дней, когда истечёт кука.
 */
export interface AdminSession {
  /** `ROOT_SUBJECT` или идентификатор строки `accounts`. */
  readonly subject: string;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
}

interface Payload {
  readonly subject: string;
  readonly issuedAt: number;
  readonly expiresAt: number;
}

/**
 * Разбор содержимого куки. Подпись к этому моменту уже сошлась (`openSignedToken`):
 * здесь проверяется только смысл полей — он принадлежит входу, а не общей подписи.
 */
function parsePayload(claims: Record<string, unknown>): Payload | null {
  const { v, sub, iat, exp } = claims;
  if (
    v !== PAYLOAD_VERSION ||
    !isSubject(sub) ||
    typeof iat !== "number" ||
    typeof exp !== "number"
  ) {
    return null;
  }

  return { subject: sub, issuedAt: iat, expiresAt: exp };
}

/**
 * Собирает значение сессионной куки: содержимое и подпись HMAC-SHA256 на `SESSION_SECRET`.
 * Внутри идентификатор учётки и отметки времени — ни пароля, ни секрета, ни логина.
 *
 * Подпись берётся из `core/signed-token`: она одна на весь продукт, и вторая копия
 * рядом с кукой планшета была бы тем расхождением, которое годами выглядит рабочим.
 */
export function createSessionToken(
  subject: string,
  secret: string,
  now: Date,
): string {
  if (!isSubject(subject)) {
    throw new Error("Сессия выпускается только на учётную запись");
  }
  const issuedAt = Math.floor(now.getTime() / MILLISECONDS);
  return packSignedToken(
    {
      v: PAYLOAD_VERSION,
      sub: subject,
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

  return {
    subject: parsed.subject,
    issuedAt: new Date(parsed.issuedAt * MILLISECONDS),
    expiresAt,
  };
}
