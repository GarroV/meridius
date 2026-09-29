// Отказ выпуска пина на базе без таблиц (#162, T319): ровно то, что владелец видел на
// стенде, — миграция не накачена, а экран советовал «попробуйте ещё раз». Здесь таблицы
// действительно нет: действие идёт в настоящий PostgreSQL, но путь поиска подключения
// смотрит в пустую схему, и ошибка приходит от самой базы, а не от заглушки.
//
// Подключение подменено адресом, а не своим пулом: в базу ходит только блок `data`
// (правило границ `db-only-through-data`), и тест не должен его обходить. Адрес задаётся
// до первого `getDb()` — пул заводится лениво и живёт в процессе этого файла.
import { readFileSync } from "node:fs";

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { getDb } from "@/blocks/data";

import { issuePinAction } from "./issue-pin-action";

const BARE_SCHEMA = "device_bare_t319";

vi.mock("@/blocks/auth/guard", () => ({
  requireAdmin: vi.fn(() => Promise.resolve()),
}));

function withBareSearchPath(address: string | undefined): string {
  if (address === undefined || address === "") {
    throw new Error("Нет DATABASE_URL тестового прогона");
  }
  const url = new URL(address);
  url.searchParams.set("options", `-c search_path=${BARE_SCHEMA}`);
  return url.toString();
}

beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", withBareSearchPath(process.env["DATABASE_URL"]));
  await getDb().execute(sql.raw(`create schema if not exists ${BARE_SCHEMA}`));
});

afterAll(async () => {
  await getDb().execute(
    sql.raw(`drop schema if exists ${BARE_SCHEMA} cascade`),
  );
  vi.unstubAllEnvs();
});

type Messages = Record<
  string,
  Record<string, Record<string, Record<string, string>>>
>;

function brokenText(locale: "en" | "ru"): string {
  const file = new URL(`../../../messages/${locale}.json`, import.meta.url);
  const messages = JSON.parse(readFileSync(file, "utf8")) as Messages;
  return messages["device"]?.["issue"]?.["failed"]?.["broken"] ?? "";
}

describe("выпуск пина на базе без таблицы", () => {
  it("называет поломку, а не «попробуйте ещё раз», и пишет причину в журнал сервера", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {
      // журнал проверяется по вызову, в вывод прогона он не нужен
    });

    const outcome = await issuePinAction(crypto.randomUUID());

    expect(outcome).toEqual({ kind: "failed", reason: "broken" });
    expect(log).toHaveBeenCalledTimes(1);
    const logged: unknown = log.mock.calls[0]?.[1];
    expect(String(logged)).toMatch(/device_pairings/);
    log.mockRestore();
  });

  it("текст поломки в обеих локалях не советует повторять", () => {
    expect(brokenText("en")).not.toBe("");
    expect(brokenText("en")).not.toMatch(/try again|press again/i);
    expect(brokenText("ru")).not.toBe("");
    expect(brokenText("ru")).not.toMatch(/ещё раз|попробуйте снова/i);
  });
});
