// Поле окна смены: то, чем экран говорит серверу, какая смена выбрана. Проверяется
// отдельно, потому что ошибка здесь не видна ни на одном экране — чек-лист заводится
// успешно, просто не на ту смену, и выясняется это на кухне (T129).
import { describe, expect, test } from "vitest";

import {
  WINDOW_PRESETS,
  parseWindowField,
  windowFieldValue,
} from "./window-field";

describe("windowFieldValue", () => {
  test("границы едут одним значением", () => {
    expect(windowFieldValue({ start: "06:00", end: "11:00" })).toBe(
      "06:00|11:00",
    );
  });
});

describe("parseWindowField", () => {
  test("разбирает то, что отправил список", () => {
    expect(parseWindowField("20:00|00:00")).toStrictEqual({
      start: "20:00",
      end: "00:00",
    });
  });

  test("поля нет — пустые границы, а не подставленное окно", () => {
    // Молча подставленное утро — ровно тот дефект, из-за которого поле стало одним:
    // пустое значение обязано дойти до `parseWindow` и получить внятный отказ.
    expect(parseWindowField("")).toStrictEqual({ start: "", end: "" });
  });

  test("половина значения не превращается в окно", () => {
    expect(parseWindowField("20:00")).toStrictEqual({
      start: "20:00",
      end: "",
    });
  });

  test("лишний разделитель не растаскивает границы", () => {
    expect(parseWindowField("20:00|00:00|06:00")).toStrictEqual({
      start: "20:00",
      end: "00:00",
    });
  });
});

describe("готовые окна", () => {
  test("каждое переживает дорогу до сервера и обратно", () => {
    // Список на экране показывает окно этим же значением, поэтому расхождение здесь
    // означало бы, что выбранный пункт после сохранения перестанет быть выбранным.
    for (const preset of WINDOW_PRESETS) {
      expect(parseWindowField(windowFieldValue(preset.value))).toStrictEqual(
        preset.value,
      );
    }
  });

  test("окна различимы: одинаковых значений в списке нет", () => {
    const values = WINDOW_PRESETS.map((preset) =>
      windowFieldValue(preset.value),
    );

    expect(new Set(values).size).toBe(WINDOW_PRESETS.length);
  });
});
