import { describe, expect, it } from "vitest";

import { DEFAULT_LOCALE } from "./locale";
import {
  STORE_LAST_RESORT_LOCALE,
  storeLocale,
  storeLocales,
} from "./store-locale";

/**
 * Правило владельца (D122): «дефолт - тот язык что задали для пиццерии. отбивки и
 * сервисные сообщения также должны быть на этом языке». Здесь проверяется само правило,
 * а не то, как оно посчитано: порядок звеньев внутри функции может смениться, ответ на
 * вопрос «чей это язык» — нет.
 */
describe("язык поверхности принадлежит пиццерии", () => {
  it("язык пиццерии сильнее языка устройства", () => {
    // Arrange: пиццерия завела русский, устройство просит английский.
    const acceptLanguage = "en-GB,en;q=0.9";

    // Act
    const chain = storeLocales(acceptLanguage, "ru");

    // Assert: поверхность говорит на языке пиццерии.
    expect(chain[0]).toBe("ru");
  });

  it("и в обратную сторону: английская пиццерия против русского устройства", () => {
    expect(storeLocales("ru-RU,ru;q=0.9", "en")[0]).toBe("en");
  });

  it("устройство на третьем языке ничего не меняет: язык всё равно от пиццерии", () => {
    // Казахский телефон в казахстанской пиццерии, где заведён русский.
    expect(storeLocales("kk-KZ,kk;q=0.9", "ru")[0]).toBe("ru");
  });

  it("язык страны вне списка продукта не подставляется как есть", () => {
    // Строка приходит из базы: молча отдать наружу "kk" значило бы искать словарь,
    // которого нет. Тогда решает устройство.
    expect(storeLocales("en-US", "kk")[0]).toBe("en");
  });

  /**
   * T273. У пиццерии поверхностей больше одной, и открывает их не всегда тот, кто
   * читает: наклейку станции печатает методист из своего браузера, а висит она на кухне.
   * Проверка стережёт именно это — что ответ не зависит от того, чьё устройство спросило.
   */
  it("ответ не зависит от того, чьё устройство спросило", () => {
    const answers = [
      storeLocale("en-GB,en;q=0.9", "ru"),
      storeLocale("ru-RU,ru;q=0.9", "ru"),
      storeLocale("de-DE,de;q=0.9", "ru"),
      storeLocale(null, "ru"),
      storeLocale("", "ru"),
    ];

    expect(new Set(answers)).toEqual(new Set(["ru"]));
  });
});

describe("когда пиццерии нет — решает устройство, потом язык продукта", () => {
  it("устройство выбирает язык, раз пиццерия неизвестна", () => {
    expect(storeLocales("ru-RU,ru;q=0.9", null)[0]).toBe("ru");
    expect(storeLocales("en-GB,en;q=0.9", null)[0]).toBe("en");
  });

  it("устройство с несколькими языками: берётся самый желанный по весу q", () => {
    expect(storeLocales("en;q=0.2,ru;q=0.9", null)[0]).toBe("ru");
  });

  it("пустой и отсутствующий заголовок ведут себя одинаково", () => {
    const answers = [
      storeLocales("", null)[0],
      storeLocales(null, null)[0],
      storeLocales(undefined, null)[0],
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
    expect(STORE_LAST_RESORT_LOCALE).toBe(DEFAULT_LOCALE);
    expect(storeLocales("kk-KZ", null)[0]).toBe(DEFAULT_LOCALE);
    expect(storeLocales(null, null)[0]).toBe(DEFAULT_LOCALE);
  });
});

/**
 * Цепочка отдаётся целиком не ради порядка, а ради текстов пунктов: `pickFillText`
 * блока `fill` идёт по ней до первого заведённого перевода. Поэтому у неё два свойства,
 * на которые он опирается, и они не зависят от того, кто из звеньев сегодня первый.
 */
describe("цепочка как опора для текстов, заведённых методистом", () => {
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
      expect(storeLocales(accept, country).length).toBeGreaterThan(0);
    }
  });

  it("без повторов: один язык не проверяется дважды", () => {
    for (const [accept, country] of cases) {
      const chain = storeLocales(accept, country);
      expect(new Set(chain).size).toBe(chain.length);
    }
  });

  it("язык устройства остаётся в цепочке: пункт может быть заведён только на нём", () => {
    // Пиццерия английская, устройство русское: интерфейс английский, но русский из
    // цепочки не выброшен — у пункта может не быть английского текста.
    const chain = storeLocales("ru-RU", "en");
    expect(chain[0]).toBe("en");
    expect(chain).toContain("ru");
  });
});

/**
 * `storeLocale` — то же решение, названное одним словом. Отдельное имя существует, чтобы
 * «первый элемент цепочки и есть язык интерфейса» было записано один раз, а не
 * повторялось как `[0]` на каждом экране. Значит, оно обязано совпадать с цепочкой
 * всегда, а не «сегодня совпадает».
 */
describe("язык интерфейса — первое звено цепочки, и не своё вычисление", () => {
  it("совпадает с началом цепочки на любых входных данных", () => {
    const cases: (readonly [string | null, string | null])[] = [
      ["en-GB,en;q=0.9", "ru"],
      ["ru-RU", "en"],
      ["kk-KZ", null],
      [null, "ru"],
      ["", ""],
    ];

    for (const [accept, country] of cases) {
      expect(storeLocale(accept, country)).toBe(
        storeLocales(accept, country)[0],
      );
    }
  });
});
