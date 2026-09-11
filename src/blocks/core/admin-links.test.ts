// Сторож T088: переход между экранами не пишется обычным `<a href>`.
//
// Next приставляет базовый путь площадки только к тому, что идёт через его роутер, —
// то есть к `Link` и к `redirect()` (для второго есть `core/base-path.ts`). Обычному
// `<a href="/admin/...">` он не приставляет ничего, и на площадке с путём такая ссылка
// уводит на корень адреса, где живёт чужой продукт. Сценарий ломался ровно так, и из-за
// этого публикацию увели в отдельный туннель (D046).
//
// Проверка структурная, а не поведенческая: поведение держит `e2e/admin-nav.spec.ts`
// (переход без перезагрузки страницы), а здесь ловится ПОЯВЛЕНИЕ нового `<a>` в разметке —
// то, что тест поведения на новом экране заметит только если про него вспомнят.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, test } from "vitest";

import { repositoryRoot } from "./repo-copy";

/** Где ищем: вся разметка продукта. */
const ROOTS = ["src/app", "src/blocks"];

/**
 * `<a>` остаётся законным ровно в двух случаях:
 *   * ссылка наружу или на якорь — роутеру Next там делать нечего;
 *   * `download` у обработчика `route.ts` — файл отдаёт сервер, а `Link` предзагружал бы
 *     обработчик, рисующий наклейку заново на каждое появление ссылки в поле зрения.
 *     Базовый путь такой ссылке не достаётся, и об этом говорит `src/startup-checks.ts`.
 */
const ALLOWED = /\bdownload\b|href=["'](?:https?:|mailto:|tel:|#)/;

const OPENING_TAG = /<a[\s>][^>]*>/g;

/**
 * Комментарии из текста убираются: правило про `<a href>` объясняется словами в самих
 * файлах, и без этого сторож ловил бы собственное объяснение. Убираются целые строки —
 * так `//` внутри строкового литерала (`https://…`) не режет код на середине.
 */
function withoutComments(source: string): string {
  return source
    .replaceAll(/\{?\/\*[\S\s]*?\*\/\}?/g, "")
    .split("\n")
    .filter((line) => !/^\s*(?:\/\/|\*)/.test(line))
    .join("\n");
}

function tsxFiles(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...tsxFiles(full));
    else if (entry.name.endsWith(".tsx")) found.push(full);
  }
  return found;
}

function plainAnchors(): string[] {
  const root = repositoryRoot();
  const offenders: string[] = [];

  for (const dir of ROOTS) {
    for (const file of tsxFiles(path.join(root, dir))) {
      const source = withoutComments(readFileSync(file, "utf8"));
      for (const tag of source.match(OPENING_TAG) ?? []) {
        if (ALLOWED.test(tag)) continue;
        offenders.push(
          `${path.relative(root, file)}: ${tag.replaceAll(/\s+/g, " ")}`,
        );
      }
    }
  }

  return offenders;
}

describe("переходы между экранами (T088)", () => {
  test("в разметке нет обычных <a> на внутренние адреса — только Link", () => {
    expect(plainAnchors()).toEqual([]);
  });

  test("сторож видит саму разметку, а не пустоту", () => {
    // Без этой проверки предыдущая была бы зелёной и при сломанном обходе файлов.
    const root = repositoryRoot();
    const files = ROOTS.flatMap((dir) => tsxFiles(path.join(root, dir)));

    expect(files.length).toBeGreaterThan(20);
    expect(
      files.some((file) =>
        file.endsWith(path.join("core", "ui", "AdminNav.tsx")),
      ),
    ).toBe(true);
  });
});
