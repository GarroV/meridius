// Поход к Google и возврат оттуда (D176). Маршруты `src/app/(public)/admin/login/google/`
// только зовут эти функции: логика и её проверки живут в блоке, а не в каталоге адресов.
//
// Отказ на возврате один на все причины — нет метки, метка не та, Google отказал, почта
// не подтверждена, почта не привязана, учётка снята: иначе экран входа перечислял бы,
// чьи почты здесь заведены.
import { timingSafeEqual } from "node:crypto";

import { cookies, headers } from "next/headers";

import { redirectPath } from "@/blocks/core/base-path";

import { sessionSecret } from "./config";
import { findEmailAccount } from "./emails";
import {
  authorizationUrl,
  FRONT_MARKER_HEADER,
  exchangeCode,
  googleSettings,
  identityFromIdToken,
  newState,
  type GoogleSettings,
} from "./google";
import { ADMIN_HOME_PATH, LOGIN_PATH } from "./routes";
import { setSessionCookie } from "./session-cookie";

const STATE_COOKIE = "meridius_google_state";
/** Десять минут на выбор аккаунта: дольше метка не живёт. */
const STATE_MAX_AGE_SECONDS = 600;
/** Параметр экрана входа, по которому он показывает отказ Google. */
export const GOOGLE_FAILED_PARAM = "google";
const GOOGLE_FAILED_VALUE = "failed";
const SEE_OTHER = 303;

/** Перенаправление относительным адресом: за прокси свой адрес сервер знает неверно. */
function goTo(location: string): Response {
  return new Response(null, { status: SEE_OTHER, headers: { location } });
}

/** Реквизиты для этого запроса: пришедшему через фронт — адрес возврата фронта. */
async function settingsForRequest(): Promise<GoogleSettings | null> {
  const viaFront = (await headers()).get(FRONT_MARKER_HEADER) === "1";
  return googleSettings(viaFront);
}

/**
 * Причина отказа возврата — только для журнала. Человеку отказ один на все причины
 * (иначе экран входа перечислял бы, чьи почты здесь заведены), а по жалобе «Google не
 * пускает» без причины в журнале не понять, на каком шаге оборвалось (#238). В строку
 * журнала идёт одно слово из этого списка: ни почты, ни кода, ни токена, ни метки, ни
 * текста ответа Google.
 */
type RefusalReason =
  | "state-mismatch"
  | "no-code"
  | "google-error"
  | "exchange-failed"
  | "no-id-token"
  | "bad-id-token"
  | "email-unbound";

function refused(reason: RefusalReason): Response {
  console.warn(`Вход через Google: отказ, причина ${reason}`);
  return goTo(
    redirectPath(`${LOGIN_PATH}?${GOOGLE_FAILED_PARAM}=${GOOGLE_FAILED_VALUE}`),
  );
}

/**
 * Сбой, который стоит повторить: Google не ответил за отведённое время или сеть
 * оборвалась (`fetch` бросает `TypeError`). Разбор тела и прочее не повторяется.
 */
function isTransient(error: unknown): boolean {
  return (
    error instanceof TypeError ||
    (error instanceof Error && error.name === "TimeoutError")
  );
}

/**
 * Обмен кода с одним повтором при тайм-ауте или сетевой ошибке: короткий сбой по пути к
 * Google не должен стоить человеку нового круга по экранам Google. Второй сбой пробрасывается.
 */
async function exchangeWithRetry(
  settings: GoogleSettings,
  code: string,
): Promise<string | null> {
  try {
    return await exchangeCode(settings, code);
  } catch (error) {
    if (!isTransient(error)) throw error;
    console.warn("Вход через Google: обмен кода не удался, повтор");
    return exchangeCode(settings, code);
  }
}

/** Начало: метка в куку, человек — к Google. Без реквизитов — обратно на форму входа. */
export async function startGoogleSignIn(): Promise<Response> {
  const settings = await settingsForRequest();
  if (settings === null) return goTo(redirectPath(LOGIN_PATH));

  const state = newState();
  (await cookies()).set(STATE_COOKIE, state, {
    httpOnly: true,
    // lax: возврат от Google — переход верхнего уровня, кука с ним едет.
    sameSite: "lax",
    path: "/",
    maxAge: STATE_MAX_AGE_SECONDS,
    secure: process.env.NODE_ENV === "production",
  });
  return goTo(authorizationUrl(settings, state));
}

function sameState(expected: string | undefined, got: string | null): boolean {
  if (expected === undefined || got === null) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(got);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Возврат от Google: сверка метки, обмен кода, почта → учётка, сессия. */
export async function finishGoogleSignIn(url: URL): Promise<Response> {
  const settings = await settingsForRequest();
  if (settings === null) return goTo(redirectPath(LOGIN_PATH));
  // Секрет — до всего остального: без него вход не может «получиться» молча, без куки.
  const secret = sessionSecret();

  const store = await cookies();
  const expected = store.get(STATE_COOKIE)?.value;
  // Метка одноразовая: снимается при любом исходе, повтор того же возврата не пройдёт.
  store.delete({ name: STATE_COOKIE, path: "/" });

  // Значение `error` в журнал не идёт: оно приходит из адреса, то есть от кого угодно.
  if (url.searchParams.has("error")) return refused("google-error");
  if (!sameState(expected, url.searchParams.get("state"))) {
    return refused("state-mismatch");
  }
  const code = url.searchParams.get("code");
  if (code === null) return refused("no-code");

  let idToken: string | null;
  try {
    idToken = await exchangeWithRetry(settings, code);
  } catch (error) {
    // Google недоступен — человеку тот же отказ с формой входа и паролем под рукой,
    // а поломка остаётся в журнале.
    const reason = error instanceof Error ? error.name : typeof error;
    console.error("Вход через Google: Google не ответил на обмен кода", reason);
    return refused("exchange-failed");
  }
  if (idToken === null) return refused("no-id-token");
  const identity = identityFromIdToken(idToken, settings.clientId, new Date());
  if (identity === null) return refused("bad-id-token");

  // Время выпуска — до чтения учётки, как у входа паролем (#198): сброс пароля,
  // пришедшийся на этот вход, делает выпущенную сессию негодной, а не наоборот.
  const issuedAt = new Date();
  const account = await findEmailAccount(identity.email);
  if (account === null) return refused("email-unbound");

  await setSessionCookie(account.id, secret, issuedAt);
  return goTo(redirectPath(ADMIN_HOME_PATH));
}

/** Показать ли на экране входа отказ Google. */
export function isGoogleFailure(value: string | string[] | undefined): boolean {
  return value === GOOGLE_FAILED_VALUE;
}
