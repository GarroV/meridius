// Префикс публичного маршрута заполнения — один факт на весь продукт.
//
// До этого сторожа «/s/» было записано дважды: в `src/security-headers.ts` (политика
// заголовков для публичных страниц) и в `src/blocks/qr/scan-url.ts` (адрес, который
// уезжает в QR-код станции). Ни один из двух не был канончиком: корневой файл лежит вне
// границ блоков, а `qr` строит адрес чужого блока — маршрут принадлежит `fill` (#29, T120).
//
// Почему сторож, а не тест на равенство: две одинаковые строки дают одинаковый результат
// ровно до дня, когда маршрут переедет, — и тогда разъедутся молча. Тот же класс, за
// который продукт уже заплатил четырьмя копиями адресов кабинета (#11, T074).
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, test } from "vitest";

import { repositoryRoot } from "@/blocks/core/repo-copy";
import { withoutComments } from "@/blocks/core/source-text";

import { PUBLIC_FILL_PREFIX } from "./public-routes";

/** Файл, которому literal `"/s/"` принадлежит по праву. */
const CANONICAL = "src/blocks/core/public-routes.ts";

/**
 * Единственное законное исключение: `config.matcher` в `src/proxy.ts`.
 *
 * Next читает этот объект статически, на сборке, — подставить туда переменную нельзя,
 * маршрут просто перестанет попадать в middleware. Исключение не оставлено дырой: ниже
 * идёт проверка, требующая, чтобы matcher называл ровно канонический префикс. При переезде
 * маршрута она покраснеет, и строка в matcher будет поправлена вместе с ним.
 */
const MATCHER_EXCEPTION = /matcher:\s*\[/;

/** Где искать: исходники продукта, без тестов — тест вправе называть адрес буквой. */
const SEARCHED_ROOTS = ["src"];

function sourceFiles(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      found.push(...sourceFiles(full));
      continue;
    }
    if (!/\.tsx?$/.test(entry.name)) continue;
    if (/\.test\.tsx?$/.test(entry.name)) continue;
    found.push(full);
  }
  return found;
}

describe("префикс публичного заполнения (T120)", () => {
  test("объявлен один раз и равен /s/", () => {
    expect(PUBLIC_FILL_PREFIX).toBe("/s/");
  });

  test("нигде в продукте не записан буквой второй раз", () => {
    const root = repositoryRoot();
    const offenders: string[] = [];

    for (const searched of SEARCHED_ROOTS) {
      for (const file of sourceFiles(path.join(root, searched))) {
        const relative = path.relative(root, file);
        if (relative === CANONICAL) continue;

        const code = withoutComments(readFileSync(file, "utf8"));
        code.split("\n").forEach((line, index) => {
          if (MATCHER_EXCEPTION.test(line)) return;
          if (/["'`]\/s\//.test(line)) {
            offenders.push(`${relative}:${String(index + 1)}: ${line.trim()}`);
          }
        });
      }
    }

    expect(offenders).toEqual([]);
  });

  test("matcher middleware называет именно канонический префикс", () => {
    const proxy = readFileSync(
      path.join(repositoryRoot(), "src/proxy.ts"),
      "utf8",
    );
    const matcher = /matcher:\s*\[(?<list>[^\]]*)]/.exec(withoutComments(proxy))
      ?.groups?.["list"];

    expect(matcher, "config.matcher в src/proxy.ts не найден").toBeDefined();
    expect(matcher).toContain(`"${PUBLIC_FILL_PREFIX}:path*"`);
  });
});
