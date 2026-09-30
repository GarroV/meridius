/**
 * Предел входа держится без очереди клиента (#170, #93).
 *
 * Очередь `inClientTurn` живёт в памяти процесса и пропадает при перезапуске, а у второй
 * копии приложения она своя. Поэтому граница обязана стоять на месте, занятом в базе, а
 * очередь — только избавлять одновременные верные входы от лишнего отказа. Здесь очередь
 * выключена, как её нет у соседней копии: залп неверных паролей всё равно доходит до
 * пароля не больше пяти раз. Замена порядка на «сначала пароль, потом счёт промаха»
 * этот файл роняет, даже если в соседнем всё зелёное благодаря очереди.
 */
import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { ROOT_LOGIN } from "./accounts";
import { signIn } from "./actions";
import { hashPassword } from "./password";
import { LOGIN_LIMITS, forgetLoginAttempts } from "./rate-limit";

const requestHeaders = vi.hoisted(() => new Map<string, string>());

vi.mock("next/headers", () => ({
  headers: () =>
    Promise.resolve({
      get: (name: string) => requestHeaders.get(name) ?? null,
    }),
  // Кука здесь не проверяется: файл считает только проверки пароля.
  cookies: () => Promise.resolve(new Map<string, unknown>()),
}));

// Очередь выключена: каждая попытка идёт сразу, как пришла.
vi.mock("./rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./rate-limit")>()),
  inClientTurn: <T>(_client: string, attempt: () => Promise<T>) => attempt(),
}));

// Сколько раз дело дошло до scrypt: отказ «throttled» после проверки пароля ничего не
// стоит — перебирающий уже получил свою попытку, а на верном пароле его бы и пустили.
const verified = vi.hoisted(() => ({ count: 0 }));

vi.mock("./password", async (importOriginal) => {
  const original = await importOriginal<typeof import("./password")>();
  return {
    ...original,
    verifyPassword: (...args: Parameters<typeof original.verifyPassword>) => {
      verified.count += 1;
      return original.verifyPassword(...args);
    },
  };
});

const PASSWORD = "пароль-методиста";
const SECRET = "секрет-подписи-сессии-достаточной-длины-1234567890";
/** Сколько попыток отправляется разом. Больше, чем весь запас клиента. */
const BURST = 40;

let client = "";

beforeEach(async () => {
  client = `203.0.113.9-${randomUUID()}`;
  await forgetLoginAttempts(client);
  requestHeaders.clear();
  requestHeaders.set("x-forwarded-for", client);
  process.env["ADMIN_PASSWORD_HASH"] = await hashPassword(PASSWORD, {
    cost: 1024,
    blockSize: 8,
    parallelization: 1,
  });
  process.env["SESSION_SECRET"] = SECRET;
  verified.count = 0;
});

afterEach(async () => {
  await forgetLoginAttempts(client);
  delete process.env["ADMIN_PASSWORD_HASH"];
  delete process.env["SESSION_SECRET"];
});

test("без очереди залп неверных паролей доходит до пароля не больше пяти раз", async () => {
  await Promise.all(
    Array.from({ length: BURST }, () => signIn(ROOT_LOGIN, "не тот пароль")),
  );

  expect(verified.count).toBeLessThanOrEqual(
    LOGIN_LIMITS.perClient.maxAttempts,
  );
  expect(verified.count).toBeGreaterThan(0);
});
