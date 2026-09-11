// Сторож T105: имя продукта на экране — MERIDIUS, и оно одно во всех местах.
//
// Решение D057: продукт называется MERIDIUS; меняется только то, что видит человек.
// Решение D058 довело переименование до конца для этого проекта. Сама правка сделана
// раньше — здесь она закрепляется, потому что до сих пор её не держала ни одна проверка:
// бренд лежит в нескольких парах ключей в двух каталогах строк, и вернуть в одну из них
// старое имя можно было молча, не уронив ничего.
//
// Вторая половина решения важна не меньше первой: слово «чек-лист» — это ОДНОВРЕМЕННО
// бренд и предмет. Предмет остаётся: раздел, сущность и крошка называются чек-листом при
// любом имени продукта. Автозамена по строке «Чек-листы» сломала бы половину интерфейса,
// поэтому здесь проверяется и то, что предмет не тронут.
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, test } from "vitest";

import en from "@/messages/en.json";
import ru from "@/messages/ru.json";

import { repositoryRoot } from "./repo-copy";

/** Имя продукта. Не переводится: в русском и английском каталоге оно одно и то же. */
const BRAND = "MERIDIUS";
/** Приглушённая вторая строка бренда. Что с ней будет дальше — открытый вопрос issue #15. */
const BRAND_MUTED = "Dodo";

/** Ключи каталога, которыми бренд и выражается (D057). Всё остальное — предмет, не бренд. */
const BRAND_KEY = "brand";
const MUTED_KEY = "brandMuted";

/** Заголовки вкладки браузера: до ребрендинга там стояло служебное имя репозитория. */
const TAB_TITLE_FILES = [
  path.join("src", "app", "layout.tsx"),
  path.join("src", "app", "s", "[code]", "page.tsx"),
];

type Catalog = Record<string, unknown>;

/** Все значения ключа `key` в дереве каталога, вместе с путём до них. */
function valuesOf(node: unknown, key: string, at = ""): [string, unknown][] {
  if (node === null || typeof node !== "object") return [];

  const found: [string, unknown][] = [];
  for (const [name, value] of Object.entries(node as Catalog)) {
    const where = at === "" ? name : `${at}.${name}`;
    if (name === key) found.push([where, value]);
    else found.push(...valuesOf(value, key, where));
  }
  return found;
}

const CATALOGS = [
  ["ru", ru as Catalog],
  ["en", en as Catalog],
] as const;

describe("имя продукта (T105, D057)", () => {
  test("каждая пара брендовых ключей в обоих языках говорит MERIDIUS", () => {
    const wrong: string[] = [];

    for (const [language, catalog] of CATALOGS) {
      for (const [where, value] of valuesOf(catalog, BRAND_KEY)) {
        if (value !== BRAND)
          wrong.push(`${language}:${where} = ${String(value)}`);
      }
      for (const [where, value] of valuesOf(catalog, MUTED_KEY)) {
        if (value !== BRAND_MUTED)
          wrong.push(`${language}:${where} = ${String(value)}`);
      }
    }

    expect(wrong).toEqual([]);
  });

  test("имя не переводится: русский и английский каталоги называют одни и те же места", () => {
    // Иначе пара ключей, добавленная в один язык и забытая в другом, осталась бы
    // незамеченной: первая проверка на отсутствующем ключе просто ничего не смотрит.
    const places = (catalog: Catalog): string[] =>
      [...valuesOf(catalog, BRAND_KEY), ...valuesOf(catalog, MUTED_KEY)]
        .map(([where]) => where)
        .sort();

    expect(places(en as Catalog)).toEqual(places(ru as Catalog));
  });

  test("сторож видит настоящие ключи, а не пустой каталог", () => {
    // Без этого пустой обход прошёл бы обе проверки выше: нечего сравнивать — нечему падать.
    for (const [language, catalog] of CATALOGS) {
      expect(
        valuesOf(catalog, BRAND_KEY).length,
        `каталог ${language}`,
      ).toBeGreaterThanOrEqual(2);
    }
  });

  test("во вкладке браузера стоит имя продукта, а не имя репозитория", () => {
    const root = repositoryRoot();

    for (const file of TAB_TITLE_FILES) {
      const source = readFileSync(path.join(root, file), "utf8");
      const title = /title:\s*"([^"]*)"/.exec(source)?.[1];

      expect(title, file).toBe(BRAND);
    }
  });

  test("«чек-лист» как предмет ребрендингом не тронут", () => {
    // Половина решения D057, которую легче всего потерять: раздел, сущность и крошка
    // остаются чек-листом при любом имени продукта. Автозамена по строке сломала бы их.
    const sections = (catalog: Catalog): Catalog =>
      (catalog["admin"] as Catalog)["sections"] as Catalog;

    expect(sections(ru as Catalog)["checklists"]).toBe("Чек-листы");
    expect(sections(en as Catalog)["checklists"]).toBe("Checklists");
  });
});
