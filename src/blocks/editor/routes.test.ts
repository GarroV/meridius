// Адреса, которые редактор строит сам. Проверяется не «строка равна строке», а два
// правила, на которых эти строки держатся.
//
// Первое: путь раздела берётся из `core/admin-sections`, а не пишется буквой. Продукт уже
// заплатил за копии адресов — четыре навигации держали свои списки и разъехались молча
// (#11, T074). Обычный тест на равенство эту разницу не видит: прописанный руками
// `"/admin/library"` даёт ровно тот же результат, пока раздел не переедет. Поэтому сюда
// добавлен структурный сторож, читающий сам исходник.
//
// Второе: опознаватель блока уезжает в адрес закодированным — он приходит из данных,
// а не из кода.
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, test } from "vitest";

import { ADMIN_SECTIONS } from "@/blocks/core/admin-sections";
import { repositoryRoot } from "@/blocks/core/repo-copy";

import { libraryBlockPath } from "./routes";

const BLOCK_ID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";

function routesSource(): string {
  return readFileSync(
    path.join(repositoryRoot(), "src/blocks/editor/routes.ts"),
    "utf8",
  );
}

/**
 * Объяснения из текста убираются: путь раздела законно называть словами в комментарии,
 * и без этого сторож ловил бы собственную документацию (та же ловушка, что в
 * `core/admin-links.test.ts`).
 */
function withoutComments(source: string): string {
  return source
    .replaceAll(/\/\*[\S\s]*?\*\//g, "")
    .split("\n")
    .filter((line) => !/^\s*(?:\/\/|\*)/.test(line))
    .join("\n");
}

describe("адрес вставленного блока библиотеки (T115)", () => {
  test("ведёт в раздел библиотеки и называет открываемый блок", () => {
    expect(libraryBlockPath(BLOCK_ID)).toBe(
      `${ADMIN_SECTIONS.library.path}?block=${BLOCK_ID}`,
    );
  });

  test("путь раздела взят из core/admin-sections, а не написан буквой", () => {
    // Сторож на копию факта: адрес раздела — один на продукт. Перечисляем все разделы,
    // а не только библиотеку: следующий адрес, переписанный сюда руками, разъедется так же.
    //
    // Ищем путь ГДЕ УГОДНО в коде, а не только в кавычках. Первая редакция этого сторожа
    // смотрела на `"/admin/…` — и отрицательный прогон показал, что она пропускает ровно
    // тот способ, которым путь сюда и вернётся: внутри шаблонной строки, где вместо
    // кавычки стоит обратная. Порча прошла молча, тест остался зелёным.
    const code = withoutComments(routesSource());
    const hardcoded = Object.values(ADMIN_SECTIONS)
      .map((section) => section.path)
      .filter((sectionPath) => code.includes(sectionPath));

    expect(hardcoded).toEqual([]);
  });

  test("опознаватель блока кодируется: в адрес он приходит из данных", () => {
    expect(libraryBlockPath("a b&mode=critical")).toBe(
      `${ADMIN_SECTIONS.library.path}?block=a%20b%26mode%3Dcritical`,
    );
  });

  test("сторож читает настоящий исходник, а не пустоту", () => {
    // Без этой проверки предыдущая была бы зелёной и при промахе мимо файла.
    expect(routesSource()).toContain("libraryBlockPath");
  });
});
