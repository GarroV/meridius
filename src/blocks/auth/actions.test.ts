import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { signIn, signOut } from "./actions";
import { hashPassword } from "./password";
import { LOGIN_LIMITS, forgetLoginAttempts } from "./rate-limit";
import { SESSION_COOKIE_NAME, readSessionToken } from "./session";

interface StoredCookie {
  readonly value: string;
  readonly options: Record<string, unknown>;
}

// Кука живёт в запросе, которого в модульном тесте нет: подменяем хранилище Next своим.
const jar = vi.hoisted(
  () => new Map<string, { value: string; options: Record<string, unknown> }>(),
);

// Заголовки запроса: из них берётся адрес клиента для счётчика попыток.
const requestHeaders = vi.hoisted(() => new Map<string, string>());

vi.mock("next/headers", () => ({
  headers: () =>
    Promise.resolve({
      get: (name: string) => requestHeaders.get(name) ?? null,
    }),
  cookies: () =>
    Promise.resolve({
      get: (name: string) => {
        const found = jar.get(name);
        return found === undefined ? undefined : { name, value: found.value };
      },
      set: (name: string, value: string, options: Record<string, unknown>) => {
        jar.set(name, { value, options });
      },
      delete: (target: string | { name: string }) => {
        jar.delete(typeof target === "string" ? target : target.name);
      },
    }),
}));

const PASSWORD = "пароль-методиста";
const SECRET = "секрет-подписи-сессии-достаточной-длины-1234567890";
const SHORT_SECRET = "короткий";
const BROKEN_HASH = "испорченный-хэш";

function sessionCookie(): StoredCookie | undefined {
  return jar.get(SESSION_COOKIE_NAME);
}

async function cheapHash(): Promise<string> {
  return hashPassword(PASSWORD, {
    cost: 1024,
    blockSize: 8,
    parallelization: 1,
  });
}

/** Сколько попыток отправляется разом. Больше, чем весь запас клиента. */
const BURST = 40;

const CLIENT_HEADER = "x-forwarded-for";

// Счёт попыток живёт в общей базе прогона, поэтому ключ клиента у каждой проверки свой:
// иначе соседний файл прогона считал бы наши промахи своими. Так же разведены между
// собой и коды станций в тестах блока `data`.
let CLIENT = "203.0.113.7";
let OTHER = "198.51.100.3";

beforeEach(async () => {
  jar.clear();
  CLIENT = `203.0.113.7-${randomUUID()}`;
  OTHER = `198.51.100.3-${randomUUID()}`;
  // Снимается и общий счёт: он один на всех, и накопленное прошлыми проверками
  // прогона не должно запирать эту.
  await forgetLoginAttempts(CLIENT);
  requestHeaders.clear();
  requestHeaders.set(CLIENT_HEADER, CLIENT);
  process.env["ADMIN_PASSWORD_HASH"] = await cheapHash();
  process.env["SESSION_SECRET"] = SECRET;
});

afterEach(() => {
  delete process.env["ADMIN_PASSWORD_HASH"];
  delete process.env["SESSION_SECRET"];
});

describe("signIn", () => {
  test("на верный пароль ставит подписанную куку и отвечает успехом", async () => {
    await expect(signIn(PASSWORD)).resolves.toEqual({ status: "ok" });

    const cookie = sessionCookie();
    expect(cookie).toBeDefined();
    expect(
      readSessionToken(cookie?.value ?? "", SECRET, new Date()),
    ).not.toBeNull();
  });

  test("кука httpOnly, sameSite lax, на весь сайт и на 30 дней", async () => {
    await signIn(PASSWORD);

    const options = sessionCookie()?.options;
    expect(options?.["httpOnly"]).toBe(true);
    expect(options?.["sameSite"]).toBe("lax");
    expect(options?.["path"]).toBe("/");
    expect(options?.["maxAge"]).toBe(30 * 24 * 60 * 60);
  });

  test("на неверный пароль отвечает отказом и не ставит куку", async () => {
    await expect(signIn("не тот пароль")).resolves.toEqual({
      status: "rejected",
    });

    expect(sessionCookie()).toBeUndefined();
  });

  test("в куке нет ни пароля, ни секрета подписи", async () => {
    await signIn(PASSWORD);

    const value = sessionCookie()?.value ?? "";
    const payload = Buffer.from(
      value.split(".")[0] ?? "",
      "base64url",
    ).toString("utf8");
    expect(value).not.toContain(PASSWORD);
    expect(value).not.toContain(SECRET);
    expect(payload).not.toContain(PASSWORD);
    expect(payload).not.toContain(SECRET);
  });

  test("без ADMIN_PASSWORD_HASH падает и никого не пускает", async () => {
    delete process.env["ADMIN_PASSWORD_HASH"];

    await expect(signIn(PASSWORD)).rejects.toThrow(/ADMIN_PASSWORD_HASH/);
    expect(sessionCookie()).toBeUndefined();
  });

  test("без SESSION_SECRET падает и не ставит куку без подписи", async () => {
    delete process.env["SESSION_SECRET"];

    await expect(signIn(PASSWORD)).rejects.toThrow(/SESSION_SECRET/);
    expect(sessionCookie()).toBeUndefined();
  });

  test("на слишком коротком SESSION_SECRET падает, а не подписывает угадываемым", async () => {
    process.env["SESSION_SECRET"] = SHORT_SECRET;

    await expect(signIn(PASSWORD)).rejects.toThrow(/SESSION_SECRET/);
    expect(sessionCookie()).toBeUndefined();
  });

  test("сообщения об ошибках не выносят наружу ни пароль, ни секрет", async () => {
    delete process.env["ADMIN_PASSWORD_HASH"];
    const withoutHash = await signIn(PASSWORD).catch((reason: unknown) =>
      String(reason),
    );

    process.env["ADMIN_PASSWORD_HASH"] = BROKEN_HASH;
    const withBrokenHash = await signIn(PASSWORD).catch((reason: unknown) =>
      String(reason),
    );

    process.env["ADMIN_PASSWORD_HASH"] = await cheapHash();
    process.env["SESSION_SECRET"] = SHORT_SECRET;
    const withShortSecret = await signIn(PASSWORD).catch((reason: unknown) =>
      String(reason),
    );

    for (const message of [withoutHash, withBrokenHash, withShortSecret]) {
      expect(message).not.toContain(PASSWORD);
      expect(message).not.toContain(SHORT_SECRET);
      expect(message).not.toContain(BROKEN_HASH);
    }
  });
});

/** Тратит весь запас попыток текущего клиента: считаются они, а не одни промахи. */
async function exhaust(): Promise<void> {
  for (
    let attempt = 0;
    attempt < LOGIN_LIMITS.perClient.maxAttempts;
    attempt++
  ) {
    await signIn("не тот пароль");
  }
}

describe("ограничение частоты попыток", () => {
  test("после предела попыток отказывает даже верному паролю", async () => {
    await exhaust();

    await expect(signIn(PASSWORD)).resolves.toMatchObject({
      status: "throttled",
    });
    expect(sessionCookie()).toBeUndefined();
  });

  test("отказ называет, через сколько можно повторить", async () => {
    await exhaust();

    const result = await signIn(PASSWORD);

    expect(result).toEqual({
      status: "throttled",
      retryAfterSeconds: LOGIN_LIMITS.perClient.windowSeconds,
    });
  });

  test("перебор с одного адреса не закрывает вход с другого", async () => {
    await exhaust();

    requestHeaders.set(CLIENT_HEADER, OTHER);

    await expect(signIn(PASSWORD)).resolves.toEqual({ status: "ok" });
  });

  test("удачный вход обнуляет счёт попыток", async () => {
    for (
      let attempt = 0;
      attempt < LOGIN_LIMITS.perClient.maxAttempts - 1;
      attempt++
    ) {
      await signIn("не тот пароль");
    }

    await expect(signIn(PASSWORD)).resolves.toEqual({ status: "ok" });
    await signIn("не тот пароль");

    await expect(signIn(PASSWORD)).resolves.toEqual({ status: "ok" });
  });

  test("залп одновременных попыток не обходит предел", async () => {
    // Разбор T217: решение «пускать» принималось отдельно от записи попытки, поэтому
    // запросы, пришедшие разом, читали одно и то же «ещё не отказ» и проходили все.
    // Предел «5 на клиента» снимался одновременностью, а пароль кабинета — единственная
    // граница продукта (ролей нет, D014).
    for (
      let attempt = 0;
      attempt < LOGIN_LIMITS.perClient.maxAttempts - 1;
      attempt++
    ) {
      await signIn("не тот пароль");
    }

    // Запас клиента исчерпан до последней попытки: пройти обязана ровно одна из залпа.
    const burst = await Promise.all(
      Array.from({ length: BURST }, () => signIn("не тот пароль")),
    );

    const passed = burst.filter((result) => result.status !== "throttled");
    expect(passed).toHaveLength(1);
  });

  test("в списке адресов берётся первый — тот, что ближе к клиенту", async () => {
    requestHeaders.set(CLIENT_HEADER, `${CLIENT}, 10.0.0.1, 10.0.0.2`);
    await exhaust();

    requestHeaders.set(CLIENT_HEADER, CLIENT);

    await expect(signIn(PASSWORD)).resolves.toMatchObject({
      status: "throttled",
    });
  });
});

describe("signOut", () => {
  test("убирает куку сессии", async () => {
    await signIn(PASSWORD);
    expect(sessionCookie()).toBeDefined();

    await signOut();

    expect(sessionCookie()).toBeUndefined();
  });

  test("на выходе без сессии не падает", async () => {
    await expect(signOut()).resolves.toBeUndefined();
  });
});
