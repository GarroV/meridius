/**
 * Вход в открытое демо без пароля (D194): `POST /demo/<роль>`. Ядро — ошибка здесь
 * открывает кабинет всем, поэтому вход решается в одном месте, а маршрут только
 * переводит исход в ответ.
 *
 * Правила:
 * - без `DEMO_MODE=1` входа нет вовсе: тот же «нет такого адреса», что и на любой
 *   несуществующий;
 * - роль берётся только из контракта `core/demo.ts`; логина из адреса или формы здесь
 *   нет, поэтому `admin` и чужие учётки через этот вход недоступны;
 * - Origin обязан совпасть с хостом запроса: обработчик маршрута, в отличие от серверного
 *   действия, Next от чужих страниц не стережёт. Нет Origin — отказ: проверка, которая на
 *   пустом входе пропускает, не проверка. Фронт Cloudflare переписывает Origin на адрес
 *   сервера (`front/src/index.js`), так что своё совпадает и за ним;
 * - учётки нет (идёт пересев) — «готовится», а не пятисотка.
 */
import { demoRole } from "@/blocks/core/demo";

import { findLoginAccount } from "./accounts";
import { isDemoMode, sessionSecret } from "./config";
import { setSessionCookie } from "./session-cookie";

export type DemoEntryOutcome =
  | { readonly kind: "not-found" }
  | { readonly kind: "foreign-origin" }
  | { readonly kind: "preparing" }
  | { readonly kind: "entered" };

export interface DemoEntryRequest {
  readonly roleKey: string;
  readonly origin: string | null;
  readonly host: string | null;
  readonly forwardedHost: string | null;
}

export interface DemoEntryDeps {
  readonly findAccount: (
    login: string,
  ) => Promise<{ readonly id: string } | null>;
  readonly setSession: (
    subject: string,
    secret: string,
    issuedAt: Date,
  ) => Promise<void>;
  readonly secret: () => string;
  readonly now: () => Date;
}

const LIVE_DEPS: DemoEntryDeps = {
  findAccount: findLoginAccount,
  setSession: setSessionCookie,
  secret: sessionSecret,
  now: () => new Date(),
};

/** Свой ли это источник: хост из Origin совпадает с хостом запроса (как проверка Next). */
export function isSameOrigin(
  origin: string | null,
  host: string | null,
  forwardedHost: string | null,
): boolean {
  if (origin === null) return false;
  const expected = (forwardedHost ?? host)?.split(",")[0]?.trim();
  if (expected === undefined || expected === "") return false;
  try {
    const url = new URL(origin);
    return (
      url.host === expected &&
      (url.protocol === "https:" || url.protocol === "http:")
    );
  } catch {
    return false;
  }
}

export async function enterDemo(
  request: DemoEntryRequest,
  deps: DemoEntryDeps = LIVE_DEPS,
  env: Record<string, string | undefined> = process.env,
): Promise<DemoEntryOutcome> {
  if (!isDemoMode(env)) return { kind: "not-found" };
  const role = demoRole(request.roleKey);
  if (role === undefined) return { kind: "not-found" };
  if (!isSameOrigin(request.origin, request.host, request.forwardedHost)) {
    return { kind: "foreign-origin" };
  }

  // Время выпуска — до чтения учётки, как у входа паролем (#198).
  const issuedAt = deps.now();
  const account = await deps.findAccount(role.login);
  if (account === null) return { kind: "preparing" };

  await deps.setSession(account.id, deps.secret(), issuedAt);
  return { kind: "entered" };
}
