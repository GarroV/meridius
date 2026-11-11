// `.env.example` — единственная инструкция по подъёму проекта: его копируют в `.env`.
// Поэтому он проверяется как код: значения в нём должны работать локально и НЕ работать
// на площадке — файл лежит в git, и всякий, кто видел репозиторий, знает этот пароль.
import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { adminPasswordHash, sessionSecret } from "./config";
import { verifyPassword } from "./password";

const EXAMPLE = readFileSync(path.join(process.cwd(), ".env.example"), "utf8");
/** Пароль по умолчанию записан в самом `.env.example`: хэш без пароля бесполезен. */
const DEV_PASSWORD = "dodo-local-dev";
const HASH_VARIABLE = "ADMIN_PASSWORD_HASH";
const SECRET_VARIABLE = "SESSION_SECRET";

function fromExample(name: string): string {
  const found = new RegExp(`^${name}=(.+)$`, "m").exec(EXAMPLE);
  const value = found?.[1];
  if (value === undefined)
    throw new Error(`${name} не заполнен в .env.example`);
  return value;
}

const NODE_ENV = process.env.NODE_ENV;

// NODE_ENV в типах Next помечен «только для чтения»: в тестах он меняется через ту же
// таблицу окружения, что и любая другая переменная.
const environment = process.env as Record<string, string | undefined>;

afterEach(() => {
  Reflect.deleteProperty(process.env, HASH_VARIABLE);
  Reflect.deleteProperty(process.env, SECRET_VARIABLE);
  environment["NODE_ENV"] = NODE_ENV;
});

describe("значения из .env.example", () => {
  test("хэш в примере — это хэш пароля, записанного там же", async () => {
    expect(EXAMPLE).toContain(DEV_PASSWORD);

    await expect(
      verifyPassword(DEV_PASSWORD, fromExample(HASH_VARIABLE)),
    ).resolves.toBe(true);
  });

  test("скопированный в .env пример открывает вход в разработке", async () => {
    process.env[HASH_VARIABLE] = fromExample(HASH_VARIABLE);
    process.env[SECRET_VARIABLE] = fromExample(SECRET_VARIABLE);
    environment["NODE_ENV"] = "development";

    await expect(
      verifyPassword(DEV_PASSWORD, adminPasswordHash()),
    ).resolves.toBe(true);
    expect(sessionSecret()).toBe(fromExample(SECRET_VARIABLE));
  });

  test("на площадке те же значения вход не открывают, а падают с объяснением", () => {
    process.env[HASH_VARIABLE] = fromExample(HASH_VARIABLE);
    process.env[SECRET_VARIABLE] = fromExample(SECRET_VARIABLE);
    environment["NODE_ENV"] = "production";

    expect(() => adminPasswordHash()).toThrow(/\.env\.example/);
    expect(() => sessionSecret()).toThrow(/\.env\.example/);
  });

  test("в примере нет знака $: подстановка загрузчика .env съедает такие значения", () => {
    expect(fromExample(HASH_VARIABLE)).not.toContain("$");
    expect(fromExample(SECRET_VARIABLE)).not.toContain("$");
  });
});
