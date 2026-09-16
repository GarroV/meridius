import { describe, expect, test } from "vitest";

import type { Locale } from "@/blocks/core/locale";
import type { Item, LocalizedText, Section } from "@/blocks/data";

import type { FillViewLabels } from "./model";
import type { BuildFillViewInput } from "./view";
import { buildChoiceView, buildFillView, formatWindow } from "./view";

// Подписи диапазона — заведомо не похожие на реальный словарь строки, чтобы в
// сборке было видно, какой именно кусок подставился, а не молчаливое совпадение.
const labels: FillViewLabels = {
  range: (min, max) => `диапазон ${String(min)}-${String(max)}`,
  rangeFrom: (min) => `от ${String(min)}`,
  rangeTo: (max) => `до ${String(max)}`,
};

const LOCALES: readonly Locale[] = ["ru", "en"];

function item(overrides: Partial<Item> & Pick<Item, "id" | "type">): Item {
  return {
    title: { ru: "Пункт", en: "Item" },
    critical: false,
    ...overrides,
  };
}

function section(
  overrides: Partial<Section> & Pick<Section, "id" | "items">,
): Section {
  return {
    title: { ru: "Секция", en: "Section" },
    source: "own",
    ...overrides,
  };
}

function baseInput(
  overrides: Partial<BuildFillViewInput> = {},
): BuildFillViewInput {
  return {
    sections: [],
    checklistTitle: { ru: "Открытие смены", en: "Shift opening" },
    storeName: "Пиццерия на Ленина",
    stationName: "Кухня",
    windowStart: "06:00:00",
    windowEnd: "12:00:00",
    locales: LOCALES,
    labels,
    ...overrides,
  };
}

describe("formatWindow", () => {
  test("обычное окно: секунды отбрасываются, разделитель — тире U+2013", () => {
    // Arrange
    const windowStart = "06:00:00";
    const windowEnd = "12:00:00";

    // Act
    const result = formatWindow(windowStart, windowEnd);

    // Assert
    expect(result).toBe("06:00–12:00");
  });

  test("окно через полночь не требует особой обработки", () => {
    expect(formatWindow("22:00:00", "02:00:00")).toBe("22:00–02:00");
  });

  test("короткая строка возвращается как есть, без дополнения нулями", () => {
    expect(formatWindow("6:0", "12:00:00")).toBe("6:0–12:00");
  });

  test("пустая строка на входе даёт пустую часть, а не выдуманное время", () => {
    expect(formatWindow("", "12:00:00")).toBe("–12:00");
  });

  test("обе границы пустые дают строку из одного разделителя", () => {
    expect(formatWindow("", "")).toBe("–");
  });

  test("строка длиннее HH:MM обрезается до пяти знаков как есть", () => {
    // "мусор" ровно 5 букв — граница обрезки видна на строке длиннее.
    expect(formatWindow("мусорный текст", "12:00:00")).toBe("мусор–12:00");
  });
});

describe("buildFillView: заголовок чек-листа", () => {
  test("выбирается по цепочке языков", () => {
    // Arrange
    const input = baseInput({
      checklistTitle: { ru: "Открытие смены", en: "Shift opening" },
      locales: ["ru", "en"],
    });

    // Act
    const view = buildFillView(input);

    // Assert
    expect(view.checklistTitle).toBe("Открытие смены");
  });

  test("откатывается на следующий язык цепочки, когда на первом текста нет", () => {
    // Arrange: на русском текста нет вовсе — методист завёл пункт только на английском.
    const input = baseInput({
      checklistTitle: { en: "Shift opening" },
      locales: ["ru", "en"],
    });

    // Act
    const view = buildFillView(input);

    // Assert
    expect(view.checklistTitle).toBe("Shift opening");
  });
});

describe("buildFillView: where", () => {
  test("склеивает пиццерию, станцию и окно через точку с пробелами", () => {
    const input = baseInput({
      storeName: "Пиццерия на Ленина",
      stationName: "Кухня",
      windowStart: "06:00:00",
      windowEnd: "12:00:00",
    });

    const view = buildFillView(input);

    expect(view.where).toBe("Пиццерия на Ленина · Кухня · 06:00–12:00");
  });

  test("пустая часть не попадает в строку и не оставляет лишний разделитель", () => {
    // Arrange: название станции пустое — редкий, но возможный случай.
    const input = baseInput({ storeName: "Пиццерия", stationName: "" });

    // Act
    const view = buildFillView(input);

    // Assert: разделитель между пиццерией и окном ровно один, второго — от пустой станции — нет.
    expect(view.where).toBe("Пиццерия · 06:00–12:00");
  });

  test("пустыми могут быть сразу две части", () => {
    const input = baseInput({ storeName: "", stationName: "" });

    const view = buildFillView(input);

    expect(view.where).toBe(formatWindow(input.windowStart, input.windowEnd));
  });
});

describe("buildFillView: диапазон числового пункта", () => {
  test("обе границы заданы — подпись из labels.range", () => {
    const input = baseInput({
      sections: [
        section({
          id: "s1",
          items: [item({ id: "i1", type: "number", min: 2, max: 6 })],
        }),
      ],
    });

    const view = buildFillView(input);

    expect(view.sections[0]?.items[0]?.hint).toBe("диапазон 2-6");
  });

  test("только нижняя граница — подпись из labels.rangeFrom", () => {
    const input = baseInput({
      sections: [
        section({
          id: "s1",
          items: [item({ id: "i1", type: "number", min: 2 })],
        }),
      ],
    });

    const view = buildFillView(input);

    expect(view.sections[0]?.items[0]?.hint).toBe("от 2");
  });

  test("только верхняя граница — подпись из labels.rangeTo", () => {
    const input = baseInput({
      sections: [
        section({
          id: "s1",
          items: [item({ id: "i1", type: "number", max: 6 })],
        }),
      ],
    });

    const view = buildFillView(input);

    expect(view.sections[0]?.items[0]?.hint).toBe("до 6");
  });

  test("ни одной границы — подписи диапазона нет, hint остаётся null", () => {
    const input = baseInput({
      sections: [
        section({ id: "s1", items: [item({ id: "i1", type: "number" })] }),
      ],
    });

    const view = buildFillView(input);

    expect(view.sections[0]?.items[0]?.hint).toBeNull();
  });

  test("границы у нечислового пункта не превращаются в подпись диапазона", () => {
    // Arrange: min/max на пункте типа bool в модели появиться не должны, но раз
    // они формально возможны в типе Item — сборка обязана их игнорировать.
    const input = baseInput({
      sections: [
        section({
          id: "s1",
          items: [item({ id: "i1", type: "bool", min: 0, max: 1 })],
        }),
      ],
    });

    const view = buildFillView(input);

    expect(view.sections[0]?.items[0]?.hint).toBeNull();
  });
});

describe("buildFillView: подсказка пункта", () => {
  test("hint === null, когда нет ни своей подсказки, ни диапазона", () => {
    const input = baseInput({
      sections: [
        section({ id: "s1", items: [item({ id: "i1", type: "text" })] }),
      ],
    });

    const view = buildFillView(input);

    expect(view.sections[0]?.items[0]?.hint).toBeNull();
  });

  test("только своя подсказка методиста, диапазона нет", () => {
    const input = baseInput({
      sections: [
        section({
          id: "s1",
          items: [
            item({
              id: "i1",
              type: "text",
              hint: { ru: "Проверить дважды", en: "Check twice" },
            }),
          ],
        }),
      ],
    });

    const view = buildFillView(input);

    expect(view.sections[0]?.items[0]?.hint).toBe("Проверить дважды");
  });

  test("своя подсказка и диапазон склеиваются через точку с пробелами", () => {
    const input = baseInput({
      sections: [
        section({
          id: "s1",
          items: [
            item({
              id: "i1",
              type: "number",
              min: 2,
              max: 6,
              hint: { ru: "Термометр в центре", en: "Thermometer at center" },
            }),
          ],
        }),
      ],
    });

    const view = buildFillView(input);

    expect(view.sections[0]?.items[0]?.hint).toBe(
      "Термометр в центре · диапазон 2-6",
    );
  });

  test("пустой текст подсказки на всех языках считается отсутствием подсказки", () => {
    const input = baseInput({
      sections: [
        section({
          id: "s1",
          items: [
            item({
              id: "i1",
              type: "number",
              min: 2,
              max: 6,
              hint: { ru: "", en: "" },
            }),
          ],
        }),
      ],
    });

    const view = buildFillView(input);

    expect(view.sections[0]?.items[0]?.hint).toBe("диапазон 2-6");
  });
});

describe("buildFillView: min/max в модели пункта", () => {
  test("min и max не попадают в объект, если их нет у пункта", () => {
    const input = baseInput({
      sections: [
        section({ id: "s1", items: [item({ id: "i1", type: "number" })] }),
      ],
    });

    const view = buildFillView(input);
    const built = view.sections[0]?.items[0];

    expect(built).toBeDefined();
    expect(built && "min" in built).toBe(false);
    expect(built && "max" in built).toBe(false);
  });

  test("заданные min и max переносятся в модель как есть", () => {
    const input = baseInput({
      sections: [
        section({
          id: "s1",
          items: [item({ id: "i1", type: "number", min: 2, max: 6 })],
        }),
      ],
    });

    const view = buildFillView(input);

    expect(view.sections[0]?.items[0]?.min).toBe(2);
    expect(view.sections[0]?.items[0]?.max).toBe(6);
  });
});

describe("buildFillView: пункты и секции без названия", () => {
  test("пункт без названия ни на одном языке выпадает из секции", () => {
    const input = baseInput({
      sections: [
        section({
          id: "s1",
          items: [
            item({ id: "with-title", type: "bool" }),
            item({ id: "no-title", type: "bool", title: {} }),
          ],
        }),
      ],
    });

    const view = buildFillView(input);

    expect(view.sections[0]?.items.map((current) => current.id)).toStrictEqual([
      "with-title",
    ]);
  });

  test("секция, где после чистки не осталось пунктов, выпадает целиком", () => {
    const input = baseInput({
      sections: [
        section({
          id: "empty-after-cleanup",
          items: [item({ id: "no-title", type: "bool", title: {} })],
        }),
        section({
          id: "stays",
          items: [item({ id: "stays-item", type: "bool" })],
        }),
      ],
    });

    const view = buildFillView(input);

    expect(view.sections.map((current) => current.id)).toStrictEqual(["stays"]);
  });

  test("totalItems считает только пункты, оставшиеся после чистки", () => {
    const input = baseInput({
      sections: [
        section({
          id: "s1",
          items: [
            item({ id: "a", type: "bool" }),
            item({ id: "b", type: "bool", title: {} }),
          ],
        }),
        section({
          id: "s2",
          items: [
            item({ id: "c", type: "bool" }),
            item({ id: "d", type: "bool" }),
          ],
        }),
      ],
    });

    const view = buildFillView(input);

    expect(view.totalItems).toBe(3);
  });

  test("секция без пунктов в модели не попадает в вывод, даже с названием", () => {
    const input = baseInput({
      sections: [section({ id: "s1", items: [] })],
    });

    const view = buildFillView(input);

    expect(view.sections).toStrictEqual([]);
    expect(view.totalItems).toBe(0);
  });
});

describe("buildFillView: заголовки секций и пунктов на языке цепочки", () => {
  test("секция и пункт получают текст по той же цепочке, что и заголовок чек-листа", () => {
    const sectionTitle: LocalizedText = { en: "Opening" };
    const itemTitle: LocalizedText = { en: "Wash hands" };
    const input = baseInput({
      locales: ["ru", "en"],
      sections: [
        section({
          id: "s1",
          title: sectionTitle,
          items: [item({ id: "i1", type: "bool", title: itemTitle })],
        }),
      ],
    });

    const view = buildFillView(input);

    expect(view.sections[0]?.title).toBe("Opening");
    expect(view.sections[0]?.items[0]?.title).toBe("Wash hands");
  });
});

describe("периодические пункты не попадают в форму заполнения", () => {
  const schedule = [{ from: "08:00", to: "12:00", everyMinutes: 60 }];

  test("пункт с расписанием выпадает: его отмечают обходом, а не отправкой", () => {
    const view = buildFillView(
      baseInput({
        sections: [
          section({
            id: "s",
            items: [
              {
                id: "gas",
                title: { ru: "Выключить газ", en: "Turn off the gas" },
                type: "bool",
              },
              {
                id: "line",
                title: { ru: "Линия начинения", en: "Toppings line" },
                type: "bool",
                schedule,
              },
            ],
          }),
        ],
      }),
    );

    expect(view.sections[0]?.items.map((item) => item.id)).toEqual(["gas"]);
    expect(view.totalItems).toBe(1);
  });

  test("секция из одних обходов выпадает целиком: заголовок без строк ничего не говорит", () => {
    const view = buildFillView(
      baseInput({
        sections: [
          section({
            id: "s",
            items: [
              {
                id: "line",
                title: { ru: "Линия начинения", en: "Toppings line" },
                type: "bool",
                schedule,
              },
            ],
          }),
        ],
      }),
    );

    expect(view.sections).toHaveLength(0);
  });
});

describe("buildChoiceView", () => {
  const options = [
    {
      checklistId: "c-morning",
      title: { ru: "Открытие смены", en: "Opening" },
      window: "06:00–12:00",
    },
    {
      checklistId: "c-round",
      title: { ru: "Обход менеджера", en: "Manager round" },
      window: "08:00–23:00",
    },
  ];

  test("шапка без окна: у каждого чек-листа в списке оно своё", () => {
    const view = buildChoiceView({
      options,
      storeName: "Пиццерия на Ленина",
      stationName: "Прилавок",
      locales: ["ru"],
    });
    expect(view.where).toBe("Пиццерия на Ленина · Прилавок");
  });

  test("названия берутся на языке экрана, окна остаются как есть", () => {
    const view = buildChoiceView({
      options,
      storeName: "Store",
      stationName: "Counter",
      locales: ["en", "ru"],
    });
    expect(view.options).toEqual([
      { checklistId: "c-morning", title: "Opening", window: "06:00–12:00" },
      { checklistId: "c-round", title: "Manager round", window: "08:00–23:00" },
    ]);
  });

  test("порядок не пересортировывается: он пришёл снизу и обязан повторяться", () => {
    const view = buildChoiceView({
      options: [...options].reverse(),
      storeName: "Store",
      stationName: "Counter",
      locales: ["ru"],
    });
    expect(view.options.map((o) => o.checklistId)).toEqual([
      "c-round",
      "c-morning",
    ]);
  });

  test("название, которого нет на языке экрана, берётся любым имеющимся, а не пропадает", () => {
    const view = buildChoiceView({
      options: [
        { checklistId: "c", title: { ru: "Обход" }, window: "08:00–23:00" },
      ],
      storeName: "Store",
      stationName: "Counter",
      locales: ["en"],
    });
    expect(view.options[0]?.title).toBe("Обход");
  });
});

describe("buildFillView: колонки табличного пункта (T141)", () => {
  const COLUMNS = [
    {
      id: "c1",
      title: { ru: "Температура теста", en: "Dough temperature" },
      norm: { ru: "24…26 °C", en: "24…26 °C" },
    },
    { id: "c2", title: { ru: "Вес, г", en: "Weight, g" } },
  ];

  function tableView(locales: readonly Locale[] = LOCALES) {
    const view = buildFillView(
      baseInput({
        locales,
        sections: [
          section({
            id: "s1",
            items: [
              item({
                id: "t1",
                type: "table",
                title: { ru: "Журнал замесов", en: "Mixing log" },
                columns: COLUMNS,
              }),
            ],
          }),
        ],
      }),
    );
    return view.sections[0]?.items[0];
  }

  test("колонки доезжают до экрана в своём порядке и на языке цепочки", () => {
    expect(tableView()?.columns).toStrictEqual([
      { id: "c1", title: "Температура теста", norm: "24…26 °C" },
      { id: "c2", title: "Вес, г", norm: null },
    ]);
  });

  test("на втором языке подписи берутся из него же", () => {
    expect(tableView(["en", "ru"])?.columns?.[0]?.title).toBe(
      "Dough temperature",
    );
  });

  test("нетабличный пункт колонок не получает", () => {
    const view = buildFillView(
      baseInput({
        sections: [section({ id: "s1", items: [item({ id: "b1", type: "bool" })] })],
      }),
    );

    expect(view.sections[0]?.items[0]).not.toHaveProperty("columns");
  });

  test("табличный пункт без колонок доезжает пустым списком, а не падает", () => {
    const view = buildFillView(
      baseInput({
        sections: [
          section({ id: "s1", items: [item({ id: "t1", type: "table" })] }),
        ],
      }),
    );

    expect(view.sections[0]?.items[0]?.columns).toStrictEqual([]);
  });
});
