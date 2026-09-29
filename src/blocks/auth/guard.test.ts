import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { accounts, getDb, tenants } from "@/blocks/data";

import { hasAdminSession, requireAdmin, requireHq } from "./guard";
import { LOGIN_PATH } from "./routes";
import {
  ROOT_SUBJECT,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
} from "./session";

const jar = vi.hoisted(() => new Map<string, string>());

vi.mock("next/headers", () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) => {
        const value = jar.get(name);
        return value === undefined ? undefined : { name, value };
      },
      set: () => {
        // Ставить куку в тесте охраны маршрутов нечему: только чтение.
      },
      delete: () => {
        // То же: удаление проверяется в тесте действий входа.
      },
    }),
}));

// Настоящий redirect() бросает исключение и не возвращает управление — подмена делает то же,
// иначе тест «страница не отдала данные» проходил бы на коде, который просто идёт дальше.
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`NEXT_REDIRECT ${path}`);
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

const SECRET = "секрет-подписи-сессии-достаточной-длины-1234567890";

beforeEach(() => {
  jar.clear();
  process.env["SESSION_SECRET"] = SECRET;
});

afterEach(() => {
  delete process.env["SESSION_SECRET"];
});

describe("requireAdmin", () => {
  test("без куки уводит на форму входа", async () => {
    await expect(requireAdmin()).rejects.toThrow(`NEXT_REDIRECT ${LOGIN_PATH}`);
    expect(LOGIN_PATH).toBe("/admin/login");
  });

  test("с действующей сессией пропускает дальше", async () => {
    jar.set(
      SESSION_COOKIE_NAME,
      createSessionToken(ROOT_SUBJECT, SECRET, new Date()),
    );

    await expect(requireAdmin()).resolves.toMatchObject({ tenantKind: "hq" });
  });

  test("с просроченной сессией уводит на форму входа", async () => {
    const longAgo = new Date(
      Date.now() - (SESSION_MAX_AGE_SECONDS + 60) * 1000,
    );
    jar.set(
      SESSION_COOKIE_NAME,
      createSessionToken(ROOT_SUBJECT, SECRET, longAgo),
    );

    await expect(requireAdmin()).rejects.toThrow("NEXT_REDIRECT");
  });

  test("с подделанной кукой уводит на форму входа", async () => {
    jar.set(
      SESSION_COOKIE_NAME,
      createSessionToken(
        ROOT_SUBJECT,
        "подобранный-секрет-злоумышленника",
        new Date(),
      ),
    );

    await expect(requireAdmin()).rejects.toThrow("NEXT_REDIRECT");
  });

  test("на мусоре в куке уводит на форму входа, а не падает пятисоткой", async () => {
    jar.set(SESSION_COOKIE_NAME, "-- не кука --");

    await expect(requireAdmin()).rejects.toThrow("NEXT_REDIRECT");
  });

  test("без SESSION_SECRET не пускает никого: падает, а не считает сессию годной", async () => {
    delete process.env["SESSION_SECRET"];
    jar.set(
      SESSION_COOKIE_NAME,
      createSessionToken(ROOT_SUBJECT, SECRET, new Date()),
    );

    await expect(requireAdmin()).rejects.toThrow(/SESSION_SECRET/);
  });
});

async function partnerSubject(disabled = false): Promise<string> {
  const [tenant] = await getDb()
    .insert(tenants)
    .values({ kind: "partner", name: `Партнёр ${randomUUID().slice(0, 8)}` })
    .returning({ id: tenants.id });
  if (tenant === undefined) throw new Error("тенант не вставился");
  const [row] = await getDb()
    .insert(accounts)
    .values({
      tenantId: tenant.id,
      login: `g-${randomUUID().slice(0, 12)}`,
      passwordHash: "scrypt.2.1.1.c29sdA.a2V5",
      disabledAt: disabled ? new Date() : null,
    })
    .returning({ id: accounts.id });
  if (row === undefined) throw new Error("учётка не вставилась");
  return row.id;
}

describe("учётная запись за сессией", () => {
  test("сессия партнёра отдаёт тенант партнёра, а не УК", async () => {
    jar.set(
      SESSION_COOKIE_NAME,
      createSessionToken(await partnerSubject(), SECRET, new Date()),
    );
    await expect(requireAdmin()).resolves.toMatchObject({
      tenantKind: "partner",
    });
  });

  test("сессия снятой учётки уводит на вход, хотя подпись верна", async () => {
    jar.set(
      SESSION_COOKIE_NAME,
      createSessionToken(await partnerSubject(true), SECRET, new Date()),
    );
    await expect(requireAdmin()).rejects.toThrow("NEXT_REDIRECT");
    await expect(hasAdminSession()).resolves.toBe(false);
  });

  test("сессия удалённой учётки уводит на вход", async () => {
    jar.set(
      SESSION_COOKIE_NAME,
      createSessionToken(randomUUID(), SECRET, new Date()),
    );
    await expect(requireAdmin()).rejects.toThrow("NEXT_REDIRECT");
  });
});

describe("requireHq", () => {
  test("УК пропускает", async () => {
    jar.set(
      SESSION_COOKIE_NAME,
      createSessionToken(ROOT_SUBJECT, SECRET, new Date()),
    );
    await expect(requireHq()).resolves.toMatchObject({ tenantKind: "hq" });
  });

  test("партнёру отказывает тем же ответом, что и несуществующему адресу", async () => {
    jar.set(
      SESSION_COOKIE_NAME,
      createSessionToken(await partnerSubject(), SECRET, new Date()),
    );
    await expect(requireHq()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  test("без сессии уводит на вход", async () => {
    await expect(requireHq()).rejects.toThrow("NEXT_REDIRECT");
  });
});

describe("hasAdminSession", () => {
  test("отвечает true только на действующую сессию", async () => {
    await expect(hasAdminSession()).resolves.toBe(false);

    jar.set(
      SESSION_COOKIE_NAME,
      createSessionToken(ROOT_SUBJECT, SECRET, new Date()),
    );

    await expect(hasAdminSession()).resolves.toBe(true);
  });
});
