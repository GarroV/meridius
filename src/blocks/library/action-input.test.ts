import { describe, expect, test } from "vitest";

import { blockInputFrom, failureState, formText } from "./action-input";
import { EditorInputError } from "./parsing";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

const ITEM = {
  id: "item-1",
  title: { ru: "Проверить маркировку" },
  type: "bool",
  severity: "normal",
};

describe("разбор формы блока", () => {
  test("название заводится на языке интерфейса", () => {
    const input = blockInputFrom(
      form({ locale: "en", title: "Refrigerators", items: "[]" }),
    );

    expect(input.title).toStrictEqual({ en: "Refrigerators" });
  });

  test("пункты приходят строкой JSON и разбираются как пункты чек-листа", () => {
    const input = blockInputFrom(
      form({
        locale: "ru",
        title: "Холодильники",
        items: JSON.stringify([ITEM]),
      }),
    );

    expect(input.items).toStrictEqual([
      {
        id: "item-1",
        title: { ru: "Проверить маркировку" },
        type: "bool",
        severity: "normal",
      },
    ]);
  });

  test("пункт без названия пропускается: это пустая строка внизу списка", () => {
    const empty = { ...ITEM, id: "item-2", title: {} };

    const input = blockInputFrom(
      form({
        locale: "ru",
        title: "Холодильники",
        items: JSON.stringify([ITEM, empty]),
      }),
    );

    expect(input.items).toHaveLength(1);
  });

  test("не JSON — отказ, а не пустой блок: пункты стёрлись бы молча", () => {
    expect(() =>
      blockInputFrom(form({ locale: "ru", title: "Х", items: "не json" })),
    ).toThrow(EditorInputError);
  });

  test("не список — тоже отказ", () => {
    expect(() =>
      blockInputFrom(form({ locale: "ru", title: "Х", items: '{"items":1}' })),
    ).toThrow(EditorInputError);
  });

  test("отсутствующее поле формы читается пустой строкой, а не падает", () => {
    expect(formText(new FormData(), "title")).toBe("");
  });
});

describe("отказ для экрана", () => {
  test("известный код доезжает до экрана вместе с пределом", () => {
    expect(
      failureState(new EditorInputError("textTooLong", "длинно")),
    ).toStrictEqual({ status: "failed", errorCode: "textTooLong", limit: 500 });
  });

  test("код без предела приходит без него", () => {
    expect(
      failureState(new EditorInputError("emptyTitle", "пусто")),
    ).toStrictEqual({ status: "failed", errorCode: "emptyTitle" });
  });

  test("непредусмотренный сбой не утекает подробностями в браузер", () => {
    expect(
      failureState(new Error("connect ECONNREFUSED 10.0.0.1:5432")),
    ).toStrictEqual({
      status: "failed",
      errorCode: "unknown",
    });
  });
});
