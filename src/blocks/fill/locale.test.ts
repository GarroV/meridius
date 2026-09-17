import { describe, expect, it } from "vitest";

import {
  FILL_LAST_RESORT_LOCALE,
  fillDocumentLocale,
  pickFillLocales,
  pickFillText,
} from "./locale";

describe("язык экрана заполнения", () => {
  it("берёт язык устройства, когда он поддержан", () => {
    // Arrange
    const acceptLanguage = "ru-RU,ru;q=0.9,en;q=0.8";

    // Act
    const chain = pickFillLocales(acceptLanguage, "en");

    // Assert
    expect(chain[0]).toBe("ru");
  });

  it("телефон на английском получает английский, даже если страна русская", () => {
    expect(pickFillLocales("en-GB,en;q=0.9", "ru")[0]).toBe("en");
  });

  it("откатывается на язык страны, когда язык устройства не поддержан", () => {
    // Казахский телефон в казахстанской пиццерии: своего языка у продукта нет,
    // и показать надо русский (язык страны), а не язык по умолчанию продукта.
    expect(pickFillLocales("kk-KZ,kk;q=0.9", "ru")[0]).toBe("ru");
  });

  it("откатывается на русский, когда нет ни языка устройства, ни языка страны", () => {
    expect(pickFillLocales("kk-KZ", null)[0]).toBe(FILL_LAST_RESORT_LOCALE);
    expect(FILL_LAST_RESORT_LOCALE).toBe("ru");
  });

  it("пустой и отсутствующий заголовок ведут себя одинаково", () => {
    expect(pickFillLocales("", "en")[0]).toBe("en");
    expect(pickFillLocales(null, "en")[0]).toBe("en");
    expect(pickFillLocales(undefined, "en")[0]).toBe("en");
  });

  it("неизвестный язык страны отбрасывается, а не подставляется как есть", () => {
    // В базе стоит ограничение на 'ru'/'en', но строка приходит из данных:
    // молча отдать наружу "kk" значило бы искать словарь, которого нет.
    expect(pickFillLocales("kk-KZ", "kk")).toStrictEqual(["ru"]);
  });

  it("отдаёт всю цепочку без повторов: устройство, страна, русский", () => {
    expect(pickFillLocales("en-US", "ru")).toStrictEqual(["en", "ru"]);
    expect(pickFillLocales("ru", "ru")).toStrictEqual(["ru"]);
    expect(pickFillLocales("kk", "en")).toStrictEqual(["en", "ru"]);
  });

  it("уважает вес q: язык с большим весом идёт первым", () => {
    expect(pickFillLocales("en;q=0.2,ru;q=0.9", "en")[0]).toBe("ru");
  });
});

describe("текст пункта на языке цепочки", () => {
  it("берёт первый язык цепочки, который у текста есть", () => {
    expect(pickFillText({ ru: "Печь", en: "Oven" }, ["en", "ru"])).toBe("Oven");
  });

  it("идёт дальше по цепочке, когда на первом языке текста нет", () => {
    // Методист завёл пункт только по-русски, телефон английский:
    // показать надо русский текст, а не пустую строку.
    expect(pickFillText({ ru: "Печь" }, ["en", "ru"])).toBe("Печь");
  });

  it("пустая строка считается отсутствующим переводом", () => {
    expect(pickFillText({ en: "", ru: "Печь" }, ["en", "ru"])).toBe("Печь");
  });

  it("текст на языке вне цепочки всё равно показывается", () => {
    expect(pickFillText({ kk: "Пеш" }, ["en", "ru"])).toBe("Пеш");
  });

  it("совсем пустой текст даёт пустую строку, а не падение", () => {
    expect(pickFillText({}, ["ru"])).toBe("");
  });
});

/**
 * Язык документа публичного экрана, когда о станции ещё ничего не известно. Он же
 * уезжает заголовком в корневую разметку (`src/proxy.ts`), поэтому ответ обязан быть
 * один: два умолчания на один запрос и дали документ, объявленный английским поверх
 * русского текста (T232).
 */
describe("fillDocumentLocale", () => {
  it("без заголовка — последнее звено цепочки, а не язык продукта", () => {
    expect(fillDocumentLocale(null)).toBe(FILL_LAST_RESORT_LOCALE);
    expect(fillDocumentLocale("")).toBe(FILL_LAST_RESORT_LOCALE);
  });

  it("язык, которого продукт не знает, тоже даёт последнее звено", () => {
    expect(fillDocumentLocale("kk-KZ")).toBe(FILL_LAST_RESORT_LOCALE);
  });

  it("телефон, который назвал свой язык, получает его", () => {
    expect(fillDocumentLocale("en-GB,en;q=0.9")).toBe("en");
    expect(fillDocumentLocale("ru-RU,ru;q=0.9")).toBe("ru");
  });

  it("отвечает ровно то же, что первое звено цепочки без страны", () => {
    for (const header of [null, "kk-KZ", "en-GB", "ru,en;q=0.8"]) {
      expect(fillDocumentLocale(header)).toBe(pickFillLocales(header, null)[0]);
    }
  });
});
