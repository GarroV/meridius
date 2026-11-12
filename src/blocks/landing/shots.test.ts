import { afterEach, describe, expect, it } from "vitest";

import { parseShotSizes, shotKey, shotSrc } from "./shots";

afterEach(() => {
  delete process.env["BASE_PATH"];
});

describe("размеры снимков посадочной", () => {
  it("читает пары положительных целых", () => {
    expect(parseShotSizes('{"fill-en":[390,844],"qr-ru":[1200,800]}')).toEqual({
      "fill-en": [390, 844],
      "qr-ru": [1200, 800],
    });
  });

  it("отбрасывает всё, что не пара положительных целых", () => {
    expect(
      parseShotSizes(
        '{"a":[1,2],"b":[0,5],"c":[1.5,2],"d":"x","e":[1],"f":[1,2,3]}',
      ),
    ).toEqual({ a: [1, 2] });
  });

  it.each(["", "не json", "[]", "null", "42"])(
    "%j — пустой набор, страница не падает",
    (text) => {
      expect(parseShotSizes(text)).toEqual({});
    },
  );
});

describe("адрес снимка", () => {
  it("имя файла — название и язык", () => {
    expect(shotKey("fill", "ru")).toBe("fill-ru");
    expect(shotSrc("fill", "ru")).toBe("/landing/fill-ru.webp");
  });

  it("идёт под базовым путём площадки", () => {
    process.env["BASE_PATH"] = "/qr";
    expect(shotSrc("editor", "en")).toBe("/qr/landing/editor-en.webp");
  });
});
