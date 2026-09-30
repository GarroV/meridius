// Поход к Google и возврат оттуда (D176). Маршруты `src/app/(public)/admin/login/google/`
// только зовут эти функции: логика и её проверки живут в блоке, а не в каталоге адресов.
//
// Отказ на возврате один на все причины — нет метки, метка не та, Google отказал, почта
// не подтверждена, почта не привязана, учётка снята: иначе экран входа перечислял бы,
// чьи почты здесь заведены.
import { timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";

import { redirectPath } from "@/blocks/core/base-path";

import { sessionSecret } from "./config";
import { findEmailAccount } from "./emails";
import {
  authorizationUrl,
  exchangeCode,
  googleSettings,
  identityFromIdToken,
  newState,
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

function refused(): Response {
  return goTo(
    redirectPath(`${LOGIN_PATH}?${GOOGLE_FAILED_PARAM}=${GOOGLE_FAILED_VALUE}`),
  );
}

/** Начало: метка в куку, человек — к Google. Без реквизитов — обратно на форму входа. */
export async function startGoogleSignIn(): Promise<Response> {
  const settings = googleSettings();
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
  const settings = googleSettings();
  if (settings === null) return goTo(redirectPath(LOGIN_PATH));
  // Секрет — до всего остального: без него вход не может «получиться» молча, без куки.
  const secret = sessionSecret();

  const store = await cookies();
  const expected = store.get(STATE_COOKIE)?.value;
  // Метка одноразовая: снимается при любом исходе, повтор того же возврата не пройдёт.
  store.delete({ name: STATE_COOKIE, path: "/" });

  const code = url.searchParams.get("code");
  if (!sameState(expected, url.searchParams.get("state")) || code === null) {
    return refused();
  }

  let idToken: string | null;
  try {
    idToken = await exchangeCode(settings, code);
  } catch (error) {
    // Google недоступен — человеку тот же отказ с формой входа и паролем под рукой,
    // а поломка остаётся в журнале.
    const reason = error instanceof Error ? error.name : typeof error;
    console.error("Вход через Google: Google не ответил на обмен кода", reason);
    return refused();
  }
  if (idToken === null) return refused();
  const identity = identityFromIdToken(idToken, settings.clientId, new Date());
  if (identity === null) return refused();

  // Время выпуска — до чтения учётки, как у входа паролем (#198): сброс пароля,
  // пришедшийся на этот вход, делает выпущенную сессию негодной, а не наоборот.
  const issuedAt = new Date();
  const account = await findEmailAccount(identity.email);
  if (account === null) return refused();

  await setSessionCookie(account.id, secret, issuedAt);
  return goTo(redirectPath(ADMIN_HOME_PATH));
}

/** Показать ли на экране входа отказ Google. */
export function isGoogleFailure(value: string | string[] | undefined): boolean {
  return value === GOOGLE_FAILED_VALUE;
}
