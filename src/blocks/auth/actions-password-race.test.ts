/**
 * Сброс пароля, пришедшийся на вход прежним паролем (#198).
 *
 * Хэш читается до scrypt, а scrypt идёт десятки миллисекунд. Если в это окно УК сбросит
 * пароль, проверка сойдётся со снимком прежнего хэша, и вход прежним — возможно, утёкшим
 * — паролем пройдёт. Такая сессия не должна пережить сброс: время её выпуска — момент
 * чтения хэша, а не момент после проверки, и отметка смены пароля оказывается позже.
 */
import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { countries, getDb } from "@/blocks/data";

import { loadViewer } from "./accounts";
import { signIn } from "./actions";
import { changePartnerPassword } from "./partners";
import { provisionPartner } from "./provision";
import { SESSION_COOKIE_NAME, readSessionToken } from "./session";

const jar = vi.hoisted(() => new Map<string, string>());
const requestHeaders = vi.hoisted(() => new Map<string, string>());

vi.mock("next/headers", () => ({
  headers: () =>
    Promise.resolve({
      get: (name: string) => requestHeaders.get(name) ?? null,
    }),
  cookies: () =>
    Promise.resolve({
      get: (name: string) => {
        const value = jar.get(name);
        return value === undefined ? undefined : { name, value };
      },
      set: (name: string, value: string) => {
        jar.set(name, value);
      },
    }),
}));

// Что делается «пока считается scrypt»: вклинивается между чтением хэша и выпуском куки.
const during = vi.hoisted(() => ({
  hook: null as (() => Promise<void>) | null,
}));

vi.mock("./password", async (importOriginal) => {
  const original = await importOriginal<typeof import("./password")>();
  return {
    ...original,
    verifyPassword: async (password: string, hash: string) => {
      const matches = await original.verifyPassword(password, hash);
      if (during.hook !== null) await during.hook();
      return matches;
    },
  };
});

const SECRET = "секрет-подписи-сессии-достаточной-длины-1234567890";
const CHEAP = { cost: 1024, blockSize: 8, parallelization: 1 } as const;
const PASSWORD = "прежний-пароль-партнёра";
const SECOND = 1000;

/** Дождаться начала следующей секунды: время выпуска в куке — целые секунды. */
async function nextSecond(): Promise<void> {
  const wait = SECOND - (Date.now() % SECOND) + 5;
  await new Promise((resolve) => setTimeout(resolve, wait));
}

beforeEach(() => {
  process.env["SESSION_SECRET"] = SECRET;
  requestHeaders.set("x-forwarded-for", `192.0.2.${String(Date.now() % 250)}`);
  jar.clear();
  during.hook = null;
});

afterEach(() => {
  delete process.env["SESSION_SECRET"];
  during.hook = null;
});

test("вход прежним паролем, на который пришёлся сброс, сессии не даёт", async () => {
  const countryName = `Страна ${randomUUID().slice(0, 8)}`;
  await getDb().insert(countries).values({ name: countryName });
  const login = `race-${randomUUID().slice(0, 8)}`;
  const created = await provisionPartner(
    {
      tenantName: `Партнёр ${randomUUID().slice(0, 8)}`,
      countryNames: [countryName],
      login,
      password: PASSWORD,
    },
    CHEAP,
  );
  if (!created.ok) throw new Error(`партнёр не заведён: ${created.reason}`);

  during.hook = async () => {
    during.hook = null;
    await nextSecond();
    const changed = await changePartnerPassword(
      created.accountId,
      "новый-длинный-пароль",
      CHEAP,
    );
    expect(changed).toEqual({ ok: true });
  };

  // Проверка сошлась со снимком прежнего хэша — вход засчитан, кука выдана.
  expect(await signIn(login, PASSWORD)).toEqual({ status: "ok" });
  const token = jar.get(SESSION_COOKIE_NAME);
  if (token === undefined) throw new Error("кука не выдана");
  const session = readSessionToken(token, SECRET, new Date());
  if (session === null) throw new Error("кука не читается");

  // Но сессия выпущена до сброса и при чтении не принимается.
  expect(await loadViewer(session)).toBeNull();
});
