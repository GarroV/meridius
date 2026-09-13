// Адреса, которые лента строит сама. Проверяется не «строка равна строке», а правило:
// адрес раздела кабинета — один факт на весь продукт, и живёт он в
// `core/admin-sections`, откуда его читает и боковое меню.
//
// Продукт уже заплатил за копии этих адресов: четыре навигации держали свои списки,
// разъехались молча, и работающие разделы месяц показывались надписью «Раздел ещё не
// готов» (#11, T074). Обычный тест на равенство разницы не видит — прописанный руками
// `"/admin/qr"` даёт тот же результат, пока раздел не переедет. Поэтому рядом стоит
// структурный сторож, читающий сами исходники блока: он ловит не расхождение, а саму
// копию, ещё до того как она успеет разъехаться.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, test } from "vitest";

import { ADMIN_SECTIONS } from "@/blocks/core/admin-sections";
import { repositoryRoot } from "@/blocks/core/repo-copy";

import { checklistHref } from "./checklist-link";
import { FEED_PATH, submissionPath } from "./routes";

const SUBMISSION_ID = "11111111-2222-4333-8444-555555555555";

/** Каталоги блока: его код и его маршруты — по контракту блока оба принадлежат ленте. */
const BLOCK_DIRECTORIES = ["src/blocks/feed", "src/app/admin/feed"];

function sourceFiles(directory: string): string[] {
  const absolute = path.join(repositoryRoot(), directory);
  return readdirSync(absolute, { recursive: true, withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        /\.tsx?$/.test(entry.name) &&
        // Тесты и сквозные сценарии называют адрес буквой намеренно: проверка,
        // сверяющая адрес с тем же модулем, из которого он взят, сверяет его сама
        // с собой и остаётся зелёной при любом разъезде.
        !/\.test\.tsx?$/.test(entry.name),
    )
    .map((entry) => path.join(entry.parentPath, entry.name));
}

/**
 * Объяснения из текста убираются: назвать адрес раздела словами в комментарии
 * законно, и без этого сторож ловил бы собственную документацию (та же ловушка, что
 * в `editor/routes.test.ts`).
 */
function withoutComments(source: string): string {
  return source
    .replaceAll(/\/\*[\S\s]*?\*\//g, "")
    .split("\n")
    .filter((line) => !/^\s*(?:\/\/|\*)/.test(line))
    .join("\n");
}

describe("адреса ленты", () => {
  test("адрес раздела взят из core/admin-sections, а не написан буквой", () => {
    // Сверка идёт с чужим модулем, а не с локальной строкой этого же файла.
    expect(FEED_PATH).toBe(ADMIN_SECTIONS.feed.path);
  });

  test("адрес карточки собран из адреса раздела и кодирует опознаватель", () => {
    expect(submissionPath(SUBMISSION_ID)).toBe(`${FEED_PATH}/${SUBMISSION_ID}`);
    // Опознаватель приходит из данных, а не из кода: в адрес он уезжает закодированным.
    expect(submissionPath("a b&period=week")).toBe(
      `${FEED_PATH}/a%20b%26period%3Dweek`,
    );
  });

  test("ссылка на чек-лист ведёт в раздел чек-листов из справочника разделов", () => {
    expect(checklistHref(SUBMISSION_ID)).toBe(
      `${ADMIN_SECTIONS.checklists.path}/${SUBMISSION_ID}`,
    );
  });
});

describe("сторож на копию адреса раздела (T118)", () => {
  test("ни один файл блока не держит адрес раздела своей строкой", () => {
    // Ищем путь ГДЕ УГОДНО в коде, а не только в кавычках: в блок он вернётся
    // именно так, как уже возвращался — внутри шаблонной строки, где вместо кавычки
    // стоит обратная (отрицательный прогон сторожа редактора, T115).
    const paths = Object.values(ADMIN_SECTIONS).map((section) => section.path);
    const hardcoded = BLOCK_DIRECTORIES.flatMap(sourceFiles)
      .filter((file) => {
        const code = withoutComments(readFileSync(file, "utf8"));
        return paths.some((sectionPath) => code.includes(sectionPath));
      })
      .map((file) => path.relative(repositoryRoot(), file));

    expect(hardcoded).toEqual([]);
  });
});
