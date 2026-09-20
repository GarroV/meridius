import { describe, expect, it } from "vitest";

import { DEFAULT_LOCALE } from "@/blocks/core/locale";

import {
  FILL_LAST_RESORT_LOCALE,
  pickFillLocales,
  pickFillText,
} from "./locale";

/**
 * Правило владельца (D122): «дефолт - тот язык что задали для пиццерии. отбивки и
 * сервисные сообщения также должны быть на этом языке». Здесь проверяется само правило,
 * а не то, как оно посчитано: порядок звеньев внутри функции может смениться, ответ на
 * вопрос «чей это язык» — нет.
 */
describe("язык экрана заполнения принадлежит пиццерии", () => {
  it("язык пиццерии сильнее языка телефона", () => {
    // Arrange: пиццерия завела русский, телефон сотрудника просит английский.
    const acceptLanguage = "en-GB,en;q=0.9";

    // Act
    const chain = pickFillLocales(acceptLanguage, "ru");

    // Assert: экран говорит на языке пиццерии.
    expect(chain[0]).toBe("ru");
  });

  it("и в обратную сторону: английская пиццерия против русского телефона", () => {
    expect(pickFillLocales("ru-RU,ru;q=0.9", "en")[0]).toBe("en");
  });

  it("телефон на третьем языке ничего не меняет: язык всё равно от пиццерии", () => {
    // Казахский телефон в казахстанской пиццерии, где заведён русский.
    expect(pickFillLocales("kk-KZ,kk;q=0.9", "ru")[0]).toBe("ru");
  });

  it("язык страны вне списка продукта не подставляется как есть", () => {
    // Строка приходит из базы: молча отдать наружу "kk" значило бы искать словарь,
    // которого нет. Тогда решает телефон.
    expect(pickFillLocales("en-US", "kk")[0]).toBe("en");
  });
});

describe("когда пиццерии нет — решает телефон, потом язык продукта", () => {
  it("телефон выбирает язык, раз пиццерия неизвестна", () => {
    expect(pickFillLocales("ru-RU,ru;q=0.9", null)[0]).toBe("ru");
    expect(pickFillLocales("en-GB,en;q=0.9", null)[0]).toBe("en");
  });

  it("телефон с несколькими языками: берётся самый желанный по весу q", () => {
    expect(pickFillLocales("en;q=0.2,ru;q=0.9", null)[0]).toBe("ru");
  });

  it("пустой и отсутствующий заголовок ведут себя одинаково", () => {
    const answers = [
      pickFillLocales("", null)[0],
      pickFillLocales(null, null)[0],
      pickFillLocales(undefined, null)[0],
    ];
    expect(new Set(answers).size).toBe(1);
  });

  /**
   * Вторая половина #129. Чек-лист и страница входа приходили по-английски, а «этот код
   * не работает» — по-русски: у экрана заполнения было СВОЁ умолчание рядом с умолчанием
   * продукта. Проверяется именно это — что умолчание одно, — а не буква «en»: буква
   * меняется вместе с языком продукта, а требование остаётся.
   */
  it("запасной язык — тот же, что у всего остального продукта, а не второй рядом", () => {
    expect(FILL_LAST_RESORT_LOCALE).toBe(DEFAULT_LOCALE);
    expect(pickFillLocales("kk-KZ", null)[0]).toBe(DEFAULT_LOCALE);
    expect(pickFillLocales(null, null)[0]).toBe(DEFAULT_LOCALE);
  });
});

/**
 * Цепочка отдаётся целиком не ради порядка, а ради текстов пунктов: `pickFillText` идёт
 * по ней до первого заведённого перевода. Поэтому у неё два свойства, на которые он
 * опирается, и они не зависят от того, кто из звеньев сегодня первый.
 */
describe("цепочка как опора для текстов пунктов", () => {
  const cases: (readonly [string | null, string | null])[] = [
    ["ru-RU", "en"],
    ["en-US", "ru"],
    ["kk-KZ", "ru"],
    ["kk-KZ", "kk"],
    [null, null],
    ["", "en"],
    ["ru,en;q=0.8", "ru"],
  ];

  it("всегда непустая: сотруднику есть на чём прочитать экран", () => {
    for (const [accept, country] of cases) {
      expect(pickFillLocales(accept, country).length).toBeGreaterThan(0);
    }
  });

  it("без повторов: один язык не проверяется дважды", () => {
    for (const [accept, country] of cases) {
      const chain = pickFillLocales(accept, country);
      expect(new Set(chain).size).toBe(chain.length);
    }
  });

  it("язык телефона остаётся в цепочке вторым: пункт может быть заведён только на нём", () => {
    // Пиццерия английская, телефон русский, у пункта есть только русский текст:
    // показать надо его, а не пустую строку.
    const chain = pickFillLocales("ru-RU", "en");
    expect(pickFillText({ ru: "Печь" }, chain)).toBe("Печь");
    expect(chain[0]).toBe("en");
  });
});

describe("текст пункта на языке цепочки", () => {
  it("берёт первый язык цепочки, который у текста есть", () => {
    expect(pickFillText({ ru: "Печь", en: "Oven" }, ["en", "ru"])).toBe("Oven");
  });

  it("идёт дальше по цепочке, когда на первом языке текста нет", () => {
    // Методист завёл пункт только по-русски, экран английский:
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
