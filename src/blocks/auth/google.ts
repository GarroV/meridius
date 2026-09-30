/**
 * Вход через Google (D176, по образцу Decimus `src/web/google_auth.py`): OAuth 2.0 с
 * кодом, без библиотек. Ядро: ошибка здесь не падает, а тихо пускает чужого.
 *
 * Подпись `id_token` не проверяется, и это осознанно: токен приходит не от браузера, а в
 * ответ на наш же запрос к `oauth2.googleapis.com` по TLS с секретом клиента — подменить
 * его по дороге нельзя (так и разрешает документация Google, «OpenID Connect → Obtain
 * user information from the ID token»). Проверяются издатель, адресат, срок и
 * подтверждённость почты: без них в токене можно принести чужой адрес.
 *
 * Реквизиты не заданы — вход через Google выключен целиком, кнопки на экране нет,
 * пароль работает как работал.
 */
import { randomBytes } from "node:crypto";

const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const ISSUERS: readonly string[] = [
  "accounts.google.com",
  "https://accounts.google.com",
];
const SCOPE = "openid email profile";
/** Запас на расхождение часов между нами и Google. */
const CLOCK_SKEW_SECONDS = 60;
const STATE_BYTES = 32;
/** Сколько ждём Google: дольше человек у экрана всё равно не стоит. */
const TOKEN_TIMEOUT_MS = 10_000;

const CLIENT_ID_VARIABLE = "GOOGLE_CLIENT_ID";
const CLIENT_SECRET_VARIABLE = "GOOGLE_CLIENT_SECRET";
const REDIRECT_URI_VARIABLE = "GOOGLE_REDIRECT_URI";

export interface GoogleSettings {
  readonly clientId: string;
  readonly clientSecret: string;
  /** Адрес возврата; обязан побуквенно совпадать с записанным в консоли Google. */
  readonly redirectUri: string;
}

function variable(name: string): string | null {
  const value = process.env[name]?.trim();
  return value === undefined || value === "" ? null : value;
}

/** Реквизиты клиента из окружения; null — хоть одного нет, и вход через Google выключен. */
export function googleSettings(): GoogleSettings | null {
  const clientId = variable(CLIENT_ID_VARIABLE);
  const clientSecret = variable(CLIENT_SECRET_VARIABLE);
  const redirectUri = variable(REDIRECT_URI_VARIABLE);
  if (clientId === null || clientSecret === null || redirectUri === null) {
    return null;
  }
  return { clientId, clientSecret, redirectUri };
}

/** Одноразовая метка похода к Google: сверяется на возврате, отсекает подброшенный код. */
export function newState(): string {
  return randomBytes(STATE_BYTES).toString("base64url");
}

/** Куда отправить человека выбрать аккаунт Google. */
export function authorizationUrl(
  settings: GoogleSettings,
  state: string,
): string {
  const url = new URL(AUTHORIZE_URL);
  url.search = new URLSearchParams({
    client_id: settings.clientId,
    redirect_uri: settings.redirectUri,
    response_type: "code",
    scope: SCOPE,
    state,
    // Выбор аккаунта каждый раз: в браузере часто открыто несколько, и молча взятый
    // личный вместо рабочего выглядел бы как «меня не пускают».
    prompt: "select_account",
  }).toString();
  return url.toString();
}

/** Кто вошёл, по словам Google. Почта уже подтверждена. */
export interface GoogleIdentity {
  readonly email: string;
}

function decodePayload(idToken: string): Record<string, unknown> | null {
  const parts = idToken.split(".");
  if (parts.length !== 3 || parts[1] === undefined) return null;
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8"),
    );
    return typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * Разобрать `id_token` из ответа Google. null — токен не наш, просрочен или почта не
 * подтверждена: всё это один отказ входа.
 */
export function identityFromIdToken(
  idToken: string,
  clientId: string,
  now: Date,
): GoogleIdentity | null {
  const claims = decodePayload(idToken);
  if (claims === null) return null;

  const { iss, aud, exp, email, email_verified: verified } = claims;
  if (typeof iss !== "string" || !ISSUERS.includes(iss)) return null;
  if (aud !== clientId) return null;
  if (
    typeof exp !== "number" ||
    exp + CLOCK_SKEW_SECONDS < Math.floor(now.getTime() / 1000)
  ) {
    return null;
  }
  // Строго `true`: неподтверждённую почту Google отдаёт тоже, а под ней может стоять
  // любой адрес, который человек себе вписал.
  if (verified !== true) return null;
  if (typeof email !== "string" || email.trim() === "") return null;
  return { email };
}

/**
 * Обменять код с возврата на `id_token`. null — Google отказал или ответил не тем; сбой
 * сети пробрасывается: это не отказ входа, а поломка, и её видно в журнале.
 */
export async function exchangeCode(
  settings: GoogleSettings,
  code: string,
): Promise<string | null> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: settings.clientId,
      client_secret: settings.clientSecret,
      redirect_uri: settings.redirectUri,
      grant_type: "authorization_code",
    }).toString(),
    signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS),
  });
  if (!response.ok) {
    // Тело ответа в журнал не пишем: в нём может оказаться что угодно от Google.
    console.error(
      `Вход через Google: обмен кода отклонён, статус ${String(response.status)}`,
    );
    return null;
  }
  const body: unknown = await response.json();
  if (typeof body !== "object" || body === null || !("id_token" in body)) {
    return null;
  }
  return typeof body.id_token === "string" ? body.id_token : null;
}
