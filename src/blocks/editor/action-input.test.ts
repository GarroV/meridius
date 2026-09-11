// Разбор формы редактора и сообщение об отказе. Проверяется отдельно от самих действий:
// путь отказа — единственное, что методист видит вместо своей работы, и он обязан
// приходить понятным кодом, а не общим «что-то пошло не так».
import { describe, expect, test } from "vitest";

import {
  checklistInputFrom,
  failureState,
  formText,
  sectionsFrom,
} from "./action-input";
import { EditorInputError, LIMITS } from "./validation";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.append(name, value);
  return data;
}

const GOOD_SECTIONS = JSON.stringify([
  {
    id: "s1",
    title: { ru: "Печь" },
    source: "own",
    items: [
      {
        id: "i1",
        title: { ru: "Включить печь" },
        type: "bool",
        critical: false,
      },
    ],
  },
]);

describe("formText", () => {
  test("поля нет — пустая строка, а не undefined", () => {
    expect(formText(form({}), "title")).toBe("");
  });

  test("файл вместо текста полем не считается", () => {
    const data = new FormData();
    data.append("title", new File(["данные"], "t.txt"));

    expect(formText(data, "title")).toBe("");
  });
});

describe("sectionsFrom", () => {
  test("разбирает разметку из скрытого поля", () => {
    const sections = sectionsFrom(form({ sections: GOOD_SECTIONS }));

    expect(sections[0]?.items[0]?.title).toStrictEqual({ ru: "Включить печь" });
  });

  test("не JSON — отказ с кодом badFormat, а не падение действия", () => {
    expect(() => sectionsFrom(form({ sections: "не json" }))).toThrow(
      EditorInputError,
    );
    expect(() => sectionsFrom(form({ sections: "" }))).toThrow(
      expect.objectContaining({ code: "badFormat" }),
    );
  });
});

describe("checklistInputFrom", () => {
  test("собирает свойства чек-листа, название — на языке интерфейса", () => {
    const input = checklistInputFrom(
      form({
        locale: "en",
        title: "Kitchen opening",
        stationId: "0f3a1f6e-6c1a-4c2e-9f2a-1f2b3c4d5e6f",
        window: "06:00|11:00",
      }),
    );

    expect(input).toStrictEqual({
      stationId: "0f3a1f6e-6c1a-4c2e-9f2a-1f2b3c4d5e6f",
      title: { en: "Kitchen opening" },
      window: { start: "06:00", end: "11:00" },
    });
  });

  test("окно берётся из формы, а не из умолчания", () => {
    // Прямая проверка дефекта T129: пришёл вечер — уехать обязан вечер. Пока окно
    // считалось из состояния React, форма присылала утро при выбранном вечере.
    expect(
      checklistInputFrom(form({ window: "20:00|00:00" })).window,
    ).toStrictEqual({ start: "20:00", end: "00:00" });
  });

  test("поля окна нет вовсе — пустые границы, а не тихое утро", () => {
    // Пустые границы дальше получат внятный отказ. Подставленное здесь окно означало бы
    // чек-лист, заведённый на смену, которой никто не выбирал.
    expect(checklistInputFrom(form({})).window).toStrictEqual({
      start: "",
      end: "",
    });
  });

  test("пустая станция означает «без станции», а не пустую строку в базе", () => {
    expect(checklistInputFrom(form({ stationId: "" })).stationId).toBeNull();
  });
});

describe("failureState", () => {
  test("отказ разбора приходит своим кодом", () => {
    const state = failureState(
      new EditorInputError("emptyWindow", "границы совпали"),
    );

    expect(state).toStrictEqual({ status: "failed", errorCode: "emptyWindow" });
  });

  test("к сообщению о пределе прикладывается сам предел", () => {
    // Иначе на экране получится «не больше {limit} пунктов» — с дыркой вместо числа.
    expect(
      failureState(new EditorInputError("tooManyItems", "много")),
    ).toStrictEqual({
      status: "failed",
      errorCode: "tooManyItems",
      limit: LIMITS.items,
    });
    expect(
      failureState(new EditorInputError("textTooLong", "длинно")),
    ).toStrictEqual({
      status: "failed",
      errorCode: "textTooLong",
      limit: LIMITS.textLength,
    });
  });

  test("непредвиденный сбой не уезжает в браузер подробностями", () => {
    const state = failureState(
      new Error("connect ECONNREFUSED 127.0.0.1:5432"),
    );

    expect(state).toStrictEqual({ status: "failed", errorCode: "unknown" });
    expect(JSON.stringify(state)).not.toContain("ECONNREFUSED");
  });
});
