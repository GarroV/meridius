// Что в открытом демо закрыто, а что нет (D194). Два явных списка на ВСЕ серверные
// действия и обработчики маршрутов продукта: новое действие, не названное ни в одном,
// краснит этот файл — иначе оно молча окажется открытым в демо, где учётки общие, а
// посетитель анонимен. Закрытое обязано само спрашивать `demoLocked()`: список без
// проверки в теле действия — табличка «не входить» на открытой двери.
//
// Сторож читает исходники, а не список, написанный рядом с ними: тот же приём, что у
// `core/public-routes.test.ts`.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, test } from "vitest";

import { repositoryRoot } from "@/blocks/core/repo-copy";
import { withoutComments } from "@/blocks/core/source-text";

import { DEMO_LOCKED_ACTIONS, DEMO_OPEN_ACTIONS } from "./demo-locks";

const SRC = "src";
const ROUTE_METHODS = "GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS";
const USE_SERVER = /^\s*["']use server["']\s*;?/;
const GUARD_CALL = /\bdemoLocked\(/;

interface Entry {
  /** `путь#имя` — ключ списков; путь от `src/`. */
  readonly key: string;
  readonly body: string;
}

function files(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...files(full));
    else found.push(full);
  }
  return found;
}

function productSources(): { rel: string; text: string }[] {
  const root = repositoryRoot();
  return files(path.join(root, SRC))
    .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file))
    .map((file) => ({
      rel: path.relative(path.join(root, SRC), file).split(path.sep).join("/"),
      text: withoutComments(readFileSync(file, "utf8")),
    }));
}

/** Тело экспорта: от его начала до следующего `export` на нулевом отступе. */
function bodyOf(text: string, start: number): string {
  const rest = text.slice(start + 1);
  const next = rest.search(/\nexport /);
  return next === -1 ? rest : rest.slice(0, next);
}

/** Тип в `"use server"`-файле — не действие: его стирает компилятор. */
const TYPE_EXPORT = /^export\s+(?:type|interface)\b/;

function serverActions(): { entries: Entry[]; offenders: string[] } {
  const entries: Entry[] = [];
  const offenders: string[] = [];
  for (const { rel, text } of productSources()) {
    if (!USE_SERVER.test(text)) continue;
    for (const match of text.matchAll(/^export\s[^\n]*/gm)) {
      const line = match[0];
      if (TYPE_EXPORT.test(line)) continue;
      const named =
        /^export\s+async\s+function\s+(\w+)/.exec(line) ??
        /^export\s+const\s+(\w+)\s*=\s*async\b/.exec(line);
      const name = named?.[1];
      if (name === undefined) {
        // Next не даёт экспортировать из такого файла ничего, кроме асинхронных функций;
        // а то, что даёт, браузер вправе вызвать. Незнакомая форма — на разбор человеком.
        offenders.push(`${rel}: «${line.trim()}»`);
        continue;
      }
      entries.push({
        key: `${rel}#${name}`,
        body: bodyOf(text, match.index),
      });
    }
  }
  return { entries, offenders };
}

function routeHandlers(): Entry[] {
  const entries: Entry[] = [];
  const exported = new RegExp(
    `^export\\s+(?:async\\s+)?function\\s+(${ROUTE_METHODS})\\b|^export\\s+const\\s+(${ROUTE_METHODS})\\b`,
    "gm",
  );
  for (const { rel, text } of productSources()) {
    if (!/(^|\/)route\.tsx?$/.test(rel)) continue;
    for (const match of text.matchAll(exported)) {
      const method = match[1] ?? match[2];
      entries.push({
        key: `${rel}#${method ?? ""}`,
        body: bodyOf(text, match.index),
      });
    }
  }
  return entries;
}

const SERVER = serverActions();
const ALL: readonly Entry[] = [...SERVER.entries, ...routeHandlers()];
const OPEN: ReadonlySet<string> = new Set(DEMO_OPEN_ACTIONS);
const LOCKED: ReadonlySet<string> = new Set(DEMO_LOCKED_ACTIONS);

describe("списки открытого и закрытого в демо", () => {
  test("сторож видит действия и обработчики: пустой список находок — это поломка сторожа", () => {
    expect(SERVER.entries.length).toBeGreaterThan(20);
    expect(ALL.some((entry) => entry.key.endsWith("route.ts#POST"))).toBe(true);
  });

  test("в файлах «use server» нет ничего, кроме асинхронных функций и типов", () => {
    expect(SERVER.offenders).toEqual([]);
  });

  test("каждое действие и каждый обработчик назван ровно в одном списке", () => {
    const unlisted = ALL.filter(
      (entry) => !OPEN.has(entry.key) && !LOCKED.has(entry.key),
    ).map((entry) => entry.key);
    expect(
      unlisted,
      `Не названы ни в OPEN, ни в LOCKED (src/blocks/auth/demo-locks.ts): ${unlisted.join(", ")}. ` +
        "Решите: открыто в демо или закрыто, и впишите в один список.",
    ).toEqual([]);

    const both = [...OPEN].filter((key) => LOCKED.has(key));
    expect(both, `В обоих списках сразу: ${both.join(", ")}`).toEqual([]);
  });

  test("в списках нет имён, которых в коде больше нет", () => {
    const real = new Set(ALL.map((entry) => entry.key));
    const stale = [...OPEN, ...LOCKED].filter((key) => !real.has(key));
    expect(
      stale,
      `Названы в списках, но такого действия нет: ${stale.join(", ")}`,
    ).toEqual([]);
  });

  test("каждое закрытое действие само спрашивает demoLocked()", () => {
    const silent = ALL.filter(
      (entry) => LOCKED.has(entry.key) && !GUARD_CALL.test(entry.body),
    ).map((entry) => entry.key);
    expect(
      silent,
      `Записаны в LOCKED, но в теле нет вызова demoLocked(): ${silent.join(", ")}. ` +
        "Закрытое только на бумаге открыто на деле.",
    ).toEqual([]);
  });

  test("открытое демо-вход и выход из него не закрыты", () => {
    expect(OPEN.has("app/(public)/demo/[role]/route.ts#POST")).toBe(true);
    expect(OPEN.has("blocks/auth/actions.ts#signOut")).toBe(true);
  });

  test("всё, что меняет доступ или выходит наружу, в LOCKED", () => {
    for (const key of [
      "blocks/auth/ui/partners-action.ts#submitCreatePartner",
      "blocks/auth/ui/partners-action.ts#submitChangePassword",
      "blocks/auth/ui/partners-action.ts#submitResetPassword",
      "blocks/auth/ui/partners-action.ts#submitDisableAccount",
      "blocks/auth/ui/partners-action.ts#submitBindEmail",
      "blocks/auth/ui/partners-action.ts#submitCreateHqMember",
      "app/(public)/admin/login/google/route.ts#GET",
      "app/(public)/admin/login/google/callback/route.ts#GET",
    ]) {
      expect(LOCKED.has(key), key).toBe(true);
    }
  });
});
