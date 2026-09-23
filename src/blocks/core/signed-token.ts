// Подпись одна на весь продукт: HMAC-SHA256 и сравнение за постоянное время.
//
// Живёт в `core`, потому что подписанных кук в продукте две и доверие у них разное:
// сессия кабинета (`auth/session.ts`, секрет `SESSION_SECRET`) и кука привязанного
// планшета (`device/session.ts`, секрет `DEVICE_SESSION_SECRET`). Второй реализации
// подписи быть не должно — это ровно тот класс расхождений, где вторая копия годами
// выглядит рабочей: она проверяет подпись «почти так же», и разницу замечают в день,
// когда одна из копий перестаёт отказывать.
//
// Что здесь есть и чего здесь нет. Здесь — упаковка содержимого, подпись и проверка.
// Здесь НЕТ ни срока, ни версии, ни смысла полей: срок сессии и срок куки планшета
// разные, и знание о них принадлежит тому, кто куку выдаёт.
import { Buffer } from "node:buffer";
import { createHmac, timingSafeEqual } from "node:crypto";

const SEPARATOR = ".";
const ENCODING = "base64url";
const PARTS = 2;

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest(ENCODING);
}

/**
 * Сравнение подписей постоянного времени. Длины HMAC совпадают всегда, кроме случая,
 * когда подпись в куке подделана — там разная длина сама по себе означает отказ, и
 * проверить её надо ДО сравнения: `timingSafeEqual` на разных длинах бросает.
 */
function signaturesMatch(expected: string, actual: string): boolean {
  const left = Buffer.from(expected, ENCODING);
  const right = Buffer.from(actual, ENCODING);

  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Собирает значение куки: содержимое в base64url и подпись через точку.
 * Внутри содержимого не бывает ни секрета, ни пароля — только то, что положил вызывающий.
 */
export function packSignedToken(
  claims: Record<string, unknown>,
  secret: string,
): string {
  const payload = Buffer.from(JSON.stringify(claims), "utf8").toString(
    ENCODING,
  );
  return `${payload}${SEPARATOR}${sign(payload, secret)}`;
}

/**
 * Разбирает значение куки. Возвращает содержимое, только если подпись сходится; во всех
 * остальных случаях — `null`, без исключений: мусор в куке приходит из интернета, и
 * пятисотка на подделанную куку — это тоже ответ перебору.
 *
 * Смысл полей не проверяется вовсе: срок, версию и состав содержимого проверяет тот,
 * кто эту куку выдал.
 */
export function openSignedToken(
  token: string,
  secret: string,
): Record<string, unknown> | null {
  const parts = token.split(SEPARATOR);
  if (parts.length !== PARTS) return null;

  const [payload, signature] = parts;
  if (!payload || !signature) return null;
  if (!signaturesMatch(sign(payload, secret), signature)) return null;

  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(payload, ENCODING).toString("utf8"));
  } catch {
    return null;
  }

  if (typeof decoded !== "object" || decoded === null) return null;
  return decoded as Record<string, unknown>;
}
