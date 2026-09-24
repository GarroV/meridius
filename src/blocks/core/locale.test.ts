import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import {
  asLocale,
  DEFAULT_LOCALE,
  isLocale,
  LOCALES,
  pickLocale,
  resolveLocale,
} from "./locale";
import { repositoryRoot } from "./repo-copy";
import { withoutComments } from "./source-text";

describe("pickLocale", () => {
  test("возвращает русский на телефоне с русской локалью", () => {
    expect(pickLocale("ru-RU,ru;q=0.9,en-US;q=0.8")).toBe("ru");
  });

  test("возвращает английский на телефоне с английской локалью", () => {
    expect(pickLocale("en-US,en;q=0.9")).toBe("en");
  });

  test("учитывает вес q, а не порядок записи", () => {
    expect(pickLocale("de-DE,ru;q=0.9,en;q=0.4")).toBe("ru");
  });

  test("не различает регистр в коде языка", () => {
    expect(pickLocale("RU-ru")).toBe("ru");
  });

  test("падает на язык по умолчанию, когда ни один язык не поддержан", () => {
    expect(pickLocale("fr-FR,es;q=0.8")).toBe(DEFAULT_LOCALE);
  });

  test("падает на язык по умолчанию на пустом и отсутствующем заголовке", () => {
    expect(pickLocale("")).toBe(DEFAULT_LOCALE);
    expect(pickLocale(null)).toBe(DEFAULT_LOCALE);
    expect(pickLocale(undefined)).toBe(DEFAULT_LOCALE);
  });

  test("игнорирует мусорный вес и не падает на нём", () => {
    expect(pickLocale("ru;q=не-число")).toBe("ru");
  });

  test("на звёздочке отдаёт язык по умолчанию", () => {
    expect(pickLocale("*")).toBe(DEFAULT_LOCALE);
  });
});

describe("asLocale", () => {
  test("пропускает поддержанный язык как есть", () => {
    expect(asLocale("ru")).toBe("ru");
    expect(asLocale("en")).toBe("en");
  });

  // Ради этого приведение и заведено: чужая строка иначе доехала бы до индексации
  // словаря и обернулась бы `undefined` вместо текста — молча.
  test("сводит неизвестную строку к языку по умолчанию, а не отдаёт её дальше", () => {
    expect(asLocale("de")).toBe(DEFAULT_LOCALE);
    expect(asLocale("ru-RU")).toBe(DEFAULT_LOCALE);
    expect(asLocale("")).toBe(DEFAULT_LOCALE);
  });
});

describe("isLocale", () => {
  test("узнаёт языки продукта и не узнаёт чужие", () => {
    expect(LOCALES.every((code) => isLocale(code))).toBe(true);
    expect(isLocale("kk")).toBe(false);
    expect(isLocale("ru-RU")).toBe(false);
  });

  // Зовущие берут язык из базы, заголовка и формы, где его может не быть вовсе.
  // Если бы проверка на это падала, каждая сторона завела бы своё условие рядом —
  // то есть ту же копию, только из `typeof`.
  test("пустое значение — не язык, и на нём не падает", () => {
    expect(isLocale(null)).toBe(false);
    expect(isLocale(undefined)).toBe(false);
    expect(isLocale("")).toBe(false);
  });
});

/**
 * Сторож от возврата второй копии списка языков.
 *
 * Зачем он, если есть компилятор: компилятора на это не хватает, и это проверено
 * экспериментом (T268, issue #133). С третьим языком в `LOCALES` `tsc` называет ровно
 * четыре места, и все четыре — про словари. Про семь мест, где список был написан
 * заново своими буквами, он молчит: каждое из них само по себе типобезопасно, просто
 * знает не тот список. Из-за одного такого места публичный экран заполнения не выбрал
 * бы язык, который завела пиццерия (D122), — отказ, который ничем себя не проявляет.
 *
 * Правило: перечислять языки продукта можно только в `locale.ts`. Один язык в файле —
 * это выбор (умолчание, английское демо), и он разрешён; два и больше — это список,
 * а список у продукта один.
 */
describe("языки продукта перечислены в одном месте", () => {
  test("свой список языков не заводит ни один файл продукта", () => {
    const root = repositoryRoot();
    const sources = readdirSync(join(root, "src"), {
      recursive: true,
      encoding: "utf8",
    })
      .map((entry) => entry.split("\\").join("/"))
      .filter((file) => file.endsWith(".ts") || file.endsWith(".tsx"))
      .filter((file) => !file.includes(".test."));

    // Комментарии снимаются: правило объясняется словами в тех же файлах, где и
    // стережётся, и без этого сторож ловил бы собственное объяснение.
    const offenders = sources
      .filter((file) => file !== "blocks/core/locale.ts")
      .map((file) => ({
        file,
        found: LOCALES.filter((code) =>
          new RegExp(`(["'\`])${code}\\1`).test(
            withoutComments(readFileSync(join(root, "src", file), "utf8")),
          ),
        ),
      }))
      .filter((entry) => entry.found.length > 1)
      .map((entry) => `${entry.file}: ${entry.found.join(", ")}`);

    expect(
      offenders,
      "Языки продукта снова перечислены на месте: эти файлы называют больше одного " +
        "языка буквами вместо LOCALES из src/blocks/core/locale.ts. Компилятор такую " +
        "копию не видит — с третьим языком в LOCALES он назовёт только словари, — " +
        "и продукт молча не заговорит на нём там, где список написан заново.",
    ).toEqual([]);
  });
});

describe("resolveLocale", () => {
  test("выбор человека сильнее заголовка браузера", () => {
    expect(
      resolveLocale({ chosen: "ru", acceptLanguage: "en-US,en;q=0.9" }),
    ).toBe("ru");
  });

  test("без выбора язык берётся из заголовка браузера", () => {
    expect(
      resolveLocale({ chosen: null, acceptLanguage: "ru-RU,ru;q=0.9" }),
    ).toBe("ru");
  });

  test("чужая метка в куке не принимается и не роняет страницу", () => {
    expect(
      resolveLocale({ chosen: "zz", acceptLanguage: "ru-RU,ru;q=0.9" }),
    ).toBe("ru");
  });

  test("без выбора и без заголовка — язык по умолчанию", () => {
    expect(resolveLocale({ chosen: null, acceptLanguage: null })).toBe(
      DEFAULT_LOCALE,
    );
  });
});
