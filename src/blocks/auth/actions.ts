"use server";

import { randomUUID } from "node:crypto";

import { cookies, headers } from "next/headers";

import { ROOT_LOGIN, findLoginAccount, normalizeLogin } from "./accounts";
import { adminPasswordHash, sessionSecret } from "./config";
import { hashPassword, verifyPassword } from "./password";
import { forgetLoginAttempts, reserveLoginAttempt } from "./rate-limit";
import {
  ROOT_SUBJECT,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
} from "./session";

const COOKIE_PATH = "/";
const FORWARDED_FOR = "x-forwarded-for";
const REAL_IP = "x-real-ip";
/** Когда прокси не назвал адрес (прямое соединение) — все такие клиенты считаются вместе. */
const UNKNOWN_CLIENT = "неизвестный";

/**
 * Чем отличается один стучащийся от другого.
 *
 * Адрес берётся из заголовков обратного прокси, а их подделывает кто угодно, поэтому
 * это не защита, а способ не запирать честного администратора из-за чужого перебора.
 * От подделки держит общий предел в `rate-limit.ts`, он адреса не различает.
 */
async function clientKey(): Promise<string> {
  const list = await headers();

  // В x-forwarded-for первый адрес — самый дальний от сервера, то есть сам клиент.
  const forwarded = list.get(FORWARDED_FOR)?.split(",")[0]?.trim();
  if (forwarded !== undefined && forwarded !== "") return forwarded;

  const real = list.get(REAL_IP)?.trim();
  return real === undefined || real === "" ? UNKNOWN_CLIENT : real;
}

/**
 * Чем кончился вход. Отдельным случаем — отказ по частоте: форме надо сказать человеку,
 * когда можно повторить, а «неверный пароль» на это ответа не даёт.
 */
export type SignInResult =
  | { readonly status: "ok" }
  | { readonly status: "rejected" }
  | { readonly status: "throttled"; readonly retryAfterSeconds: number };

/**
 * Хэш, по которому проверяется пароль неизвестного логина: случайный пароль, рабочие
 * параметры scrypt. Неизвестный логин обязан стоить серверу ту же работу, что и
 * известный, иначе время ответа перечисляет учётки. Считается один раз на процесс.
 */
let decoyHash: Promise<string> | undefined;

function decoy(): Promise<string> {
  decoyHash ??= hashPassword(randomUUID());
  return decoyHash;
}

interface Candidate {
  /** Кому выпускать куку; null — логин неизвестен, и пускать некого. */
  readonly subject: string | null;
  readonly hash: string;
}

async function candidateFor(login: string | null): Promise<Candidate> {
  if (login === ROOT_LOGIN) {
    return { subject: ROOT_SUBJECT, hash: adminPasswordHash() };
  }
  const account = login === null ? null : await findLoginAccount(login);
  if (account === null) return { subject: null, hash: await decoy() };
  return { subject: account.id, hash: account.passwordHash };
}

/**
 * Проверяет логин и пароль и, если они верны, ставит сессионную куку на 30 дней.
 *
 * `admin` — учётка УК из окружения площадки; остальные логины — строки `accounts`
 * (D145). На неизвестный логин и на неверный пароль ответ один и тот же, без
 * подробностей, и работа сервера одна и та же: scrypt считается всегда.
 */
export async function signIn(
  rawLogin: string,
  password: string,
): Promise<SignInResult> {
  // Секрет подписи читается до проверки пароля: без него вход не может «получиться»
  // молча, без куки. Это отказ настройки площадки, а не неверный пароль.
  const secret = sessionSecret();

  const client = await clientKey();
  const now = new Date();

  // Место в счёте занимается до scrypt, и занимается оно САМОЙ попыткой, а не её
  // исходом: перебирающий не должен получать ни лишних попыток, ни даже той работы,
  // которую сервер тратит на проверку пароля.
  const verdict = await reserveLoginAttempt(client, now);
  if (!verdict.allowed) {
    return {
      status: "throttled",
      retryAfterSeconds: verdict.retryAfterSeconds,
    };
  }

  const candidate = await candidateFor(normalizeLogin(rawLogin));
  const matches = await verifyPassword(password, candidate.hash);
  if (!matches || candidate.subject === null) {
    // Считать промах отдельно нечего: попытка уже сосчитана до проверки пароля.
    return { status: "rejected" };
  }

  await forgetLoginAttempts(client);

  const store = await cookies();
  store.set(
    SESSION_COOKIE_NAME,
    createSessionToken(candidate.subject, secret, new Date()),
    {
      // httpOnly: куку не достать из JavaScript, XSS не уносит сессию.
      httpOnly: true,
      // lax: форма входа отправляется со своего же сайта, межсайтовые запросы куку не носят.
      sameSite: "lax",
      path: COOKIE_PATH,
      maxAge: SESSION_MAX_AGE_SECONDS,
      // На площадке — только по HTTPS. На localhost браузер считает соединение доверенным.
      secure: process.env.NODE_ENV === "production",
    },
  );

  return { status: "ok" };
}

/** Завершает сессию: кука убирается, следующий запрос к `/admin/*` увидит форму входа. */
export async function signOut(): Promise<void> {
  const store = await cookies();
  store.delete({ name: SESSION_COOKIE_NAME, path: COOKIE_PATH });
}
