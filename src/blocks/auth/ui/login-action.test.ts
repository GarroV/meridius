import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { hashPassword } from "../password";
import { LOGIN_LIMITS, forgetLoginFailures } from "../rate-limit";
import { ADMIN_HOME_PATH, LOGIN_PATH } from "../routes";
import { SESSION_COOKIE_NAME } from "../session";
import { submitLogin } from "./login-action";
import { submitSignOut } from "./sign-out-action";

const jar = vi.hoisted(() => new Map<string, string>());

// Ключ клиента у каждой проверки свой: счёт неудач живёт в общей базе прогона, и
// соседний файл не должен считать наши промахи своими.
const client = vi.hoisted(() => ({ address: "203.0.113.7" }));

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve({ get: () => client.address }),
  cookies: () =>
    Promise.resolve({
      get: (name: string) => {
        const value = jar.get(name);
        return value === undefined ? undefined : { name, value };
      },
      set: (name: string, value: string) => {
        jar.set(name, value);
      },
      delete: (target: string | { name: string }) => {
        jar.delete(typeof target === "string" ? target : target.name);
      },
    }),
}));

// Тексты берутся из словаря next-intl; здесь важно, что действие подставляет в них
// минуты ожидания, а не то, как звучит русская фраза, — это проверяют сквозные сценарии.
vi.mock("next-intl/server", () => ({
  getTranslations: () =>
    Promise.resolve(
      (key: string, values?: Record<string, unknown>) =>
        `${key}:${String(values?.["minutes"])}`,
    ),
}));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`NEXT_REDIRECT ${path}`);
  },
}));

const PASSWORD = "пароль-методиста";
const INITIAL = { failed: false, message: null };
const REFUSED = { failed: true, message: null };

function formWith(password: FormDataEntryValue): FormData {
  const form = new FormData();
  form.append("password", password);
  return form;
}

beforeEach(async () => {
  jar.clear();
  client.address = `203.0.113.7-${randomUUID()}`;
  // Снимается и общий счёт: он один на всех, и накопленное прошлыми проверками
  // прогона не должно запирать эту.
  await forgetLoginFailures(client.address);
  process.env["ADMIN_PASSWORD_HASH"] = await hashPassword(PASSWORD, {
    cost: 1024,
    blockSize: 8,
    parallelization: 1,
  });
  process.env["SESSION_SECRET"] =
    "секрет-подписи-сессии-достаточной-длины-1234567890";
});

afterEach(() => {
  delete process.env["ADMIN_PASSWORD_HASH"];
  delete process.env["SESSION_SECRET"];
});

describe("submitLogin", () => {
  test("на верный пароль уводит в админку", async () => {
    await expect(submitLogin(INITIAL, formWith(PASSWORD))).rejects.toThrow(
      `NEXT_REDIRECT ${ADMIN_HOME_PATH}`,
    );

    expect(jar.get(SESSION_COOKIE_NAME)).toBeDefined();
  });

  test("на неверный пароль отвечает отказом и остаётся на форме", async () => {
    await expect(submitLogin(INITIAL, formWith("не тот"))).resolves.toEqual(
      REFUSED,
    );

    expect(jar.get(SESSION_COOKIE_NAME)).toBeUndefined();
  });

  test("пустое поле — тот же отказ, без подробностей", async () => {
    await expect(submitLogin(INITIAL, formWith(""))).resolves.toEqual(REFUSED);
  });

  test("поля вообще нет — отказ, а не пятисотка", async () => {
    await expect(submitLogin(INITIAL, new FormData())).resolves.toEqual(
      REFUSED,
    );
  });

  test("вместо строки пришёл файл — отказ на границе, до проверки пароля", async () => {
    const file = new File([PASSWORD], "password.txt", { type: "text/plain" });

    await expect(submitLogin(INITIAL, formWith(file))).resolves.toEqual(
      REFUSED,
    );
    expect(jar.get(SESSION_COOKIE_NAME)).toBeUndefined();
  });

  test("слишком длинное поле отсекается, а не считается scrypt-ом", async () => {
    const started = performance.now();

    await expect(
      submitLogin(INITIAL, formWith("я".repeat(100_000))),
    ).resolves.toEqual(REFUSED);

    expect(performance.now() - started).toBeLessThan(50);
  });
});

describe("отказ по частоте попыток", () => {
  test("вместо общего «неверный пароль» показывает, когда можно повторить", async () => {
    for (
      let attempt = 0;
      attempt < LOGIN_LIMITS.perClient.maxFailures;
      attempt++
    ) {
      await submitLogin(INITIAL, formWith("не тот"));
    }

    const state = await submitLogin(INITIAL, formWith(PASSWORD));

    // 15 минут окна: сообщение называет именно их, а не «попробуйте позже».
    expect(state).toEqual({ failed: true, message: "throttled:15" });
    expect(jar.get(SESSION_COOKIE_NAME)).toBeUndefined();
  });
});

describe("submitSignOut", () => {
  test("убирает куку и возвращает на форму входа", async () => {
    await submitLogin(INITIAL, formWith(PASSWORD)).catch(() => {
      // Успешный вход уводит редиректом — здесь важна только поставленная кука.
    });
    expect(jar.get(SESSION_COOKIE_NAME)).toBeDefined();

    await expect(submitSignOut()).rejects.toThrow(
      `NEXT_REDIRECT ${LOGIN_PATH}`,
    );

    expect(jar.get(SESSION_COOKIE_NAME)).toBeUndefined();
  });
});
