// `.env.example` — единственная инструкция по подъёму проекта: его копируют в `.env`.
// Значение секрета планшета в нём обязано работать локально и НЕ работать на площадке:
// файл лежит в git, и всякий, кто видел репозиторий, подписал бы этим ключом куку
// любого планшета — то есть открыл бы себе чек-листы любой станции.
import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { deviceSessionSecret } from "./config";

const EXAMPLE = readFileSync(path.join(process.cwd(), ".env.example"), "utf8");
const SECRET_VARIABLE = "DEVICE_SESSION_SECRET";
const ADMIN_SECRET_VARIABLE = "SESSION_SECRET";

function fromExample(name: string): string {
  const found = new RegExp(`^${name}=(.+)$`, "m").exec(EXAMPLE);
  const value = found?.[1];
  if (value === undefined)
    throw new Error(`${name} не заполнен в .env.example`);
  return value;
}

const NODE_ENV = process.env.NODE_ENV;
const OUTER_SECRET = process.env[SECRET_VARIABLE];
const OUTER_ADMIN_SECRET = process.env[ADMIN_SECRET_VARIABLE];

// NODE_ENV в типах Next помечен «только для чтения»: в тестах он меняется через ту же
// таблицу окружения, что и любая другая переменная.
const environment = process.env as Record<string, string | undefined>;

afterEach(() => {
  environment[SECRET_VARIABLE] = OUTER_SECRET;
  environment[ADMIN_SECRET_VARIABLE] = OUTER_ADMIN_SECRET;
  environment["NODE_ENV"] = NODE_ENV;
});

describe("секрет куки планшета", () => {
  test("скопированный в .env пример работает в разработке", () => {
    environment[SECRET_VARIABLE] = fromExample(SECRET_VARIABLE);
    environment[ADMIN_SECRET_VARIABLE] = fromExample(ADMIN_SECRET_VARIABLE);
    environment["NODE_ENV"] = "development";

    expect(deviceSessionSecret()).toBe(fromExample(SECRET_VARIABLE));
  });

  test("на площадке то же значение отказывает, а не подписывает куки", () => {
    environment[SECRET_VARIABLE] = fromExample(SECRET_VARIABLE);
    environment["NODE_ENV"] = "production";

    expect(() => deviceSessionSecret()).toThrow(/.env.example/);
  });

  test("не задан — отказ, а не молчаливое «планшет не узнан»", () => {
    Reflect.deleteProperty(process.env, SECRET_VARIABLE);

    expect(() => deviceSessionSecret()).toThrow(/не задана/);
  });

  test("короткий секрет не берётся: подпись подбирается", () => {
    environment[SECRET_VARIABLE] = "коротко";

    expect(() => deviceSessionSecret()).toThrow(/короче/);
  });

  test("совпал с админским — отказ: разница в доверии стёрлась бы молча", () => {
    const shared = "одинаковый-секрет-длиной-больше-тридцати-двух-знаков";
    environment[SECRET_VARIABLE] = shared;
    environment[ADMIN_SECRET_VARIABLE] = shared;

    expect(() => deviceSessionSecret()).toThrow(/SESSION_SECRET/);
  });
});
