// Красный прогон до реализации (T174): поле ввода отдавало пустую строку, если у
// пункта нет текста на языке интерфейса, хотя в данных текст есть — на другом языке.
import { describe, expect, test } from "vitest";

import { pickEditorText } from "./localized-text";

describe("pickEditorText", () => {
  test("язык есть — берётся он", () => {
    expect(
      pickEditorText({ ru: "Включить печь", en: "Turn on the oven" }, "ru"),
    ).toBe("Включить печь");
  });

  test("языка нет, есть другой — берётся первый непустой", () => {
    expect(pickEditorText({ en: "Turn on the oven" }, "ru")).toBe(
      "Turn on the oven",
    );
  });

  test("под языком пусто, но есть другой непустой — берётся другой", () => {
    expect(pickEditorText({ ru: "", en: "Turn on the oven" }, "ru")).toBe(
      "Turn on the oven",
    );
  });

  test("пустой объект — пустая строка", () => {
    expect(pickEditorText({}, "ru")).toBe("");
  });

  test("undefined — пустая строка", () => {
    expect(pickEditorText(undefined, "ru")).toBe("");
  });

  test("язык интерфейса сильнее первого ключа объекта", () => {
    // `en` стоит первым ключом, но интерфейс на русском — он и должен победить.
    expect(
      pickEditorText({ en: "Turn on the oven", ru: "Включить печь" }, "ru"),
    ).toBe("Включить печь");
  });
});
