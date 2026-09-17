"use server";

import { cookies, headers } from "next/headers";

import { adminPasswordHash, sessionSecret } from "./config";
import { verifyPassword } from "./password";
import { forgetLoginAttempts, reserveLoginAttempt } from "./rate-limit";
import {
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
 * Проверяет пароль и, если он верен, ставит сессионную куку на 30 дней.
 *
 * На неверный пароль отвечает отказом без подробностей о том, что именно не так:
 * учётная запись одна, и «нет такого пользователя» рассказывать некому.
 */
export async function signIn(password: string): Promise<SignInResult> {
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

  const matches = await verifyPassword(password, adminPasswordHash());
  if (!matches) {
    // Считать промах отдельно нечего: попытка уже сосчитана до проверки пароля.
    return { status: "rejected" };
  }

  await forgetLoginAttempts(client);

  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, createSessionToken(secret, new Date()), {
    // httpOnly: куку не достать из JavaScript, XSS не уносит сессию.
    httpOnly: true,
    // lax: форма входа отправляется со своего же сайта, межсайтовые запросы куку не носят.
    sameSite: "lax",
    path: COOKIE_PATH,
    maxAge: SESSION_MAX_AGE_SECONDS,
    // На площадке — только по HTTPS. На localhost браузер считает соединение доверенным.
    secure: process.env.NODE_ENV === "production",
  });

  return { status: "ok" };
}

/** Завершает сессию: кука убирается, следующий запрос к `/admin/*` увидит форму входа. */
export async function signOut(): Promise<void> {
  const store = await cookies();
  store.delete({ name: SESSION_COOKIE_NAME, path: COOKIE_PATH });
}
