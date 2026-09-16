// Проверка того, что приходит из браузера. Редактор — единственное место продукта,
// где разметку чек-листа пишет человек, и приходит она JSON-ом из формы: без разбора
// на границе в базу уехало бы что угодно, вплоть до чужих полей внутри JSONB.
import { describe, expect, test } from "vitest";

import {
  EditorInputError,
  LIMITS,
  parseSections,
  parseWindow,
} from "./validation";

/** Минимальная годная секция: от неё тесты отклоняются по одному полю. */
function goodSection(overrides: Record<string, unknown> = {}): unknown {
  return {
    id: "section-1",
    title: { ru: "Печь и оборудование", en: "Oven and equipment" },
    source: "own",
    items: [
      {
        id: "item-1",
        title: { ru: "Включить печь", en: "Turn on the oven" },
        type: "bool",
        severity: "normal",
      },
    ],
    ...overrides,
  };
}

describe("parseSections", () => {
  test("пропускает годную разметку без изменений", () => {
    const sections = parseSections([goodSection()]);

    expect(sections).toStrictEqual([
      {
        id: "section-1",
        title: { ru: "Печь и оборудование", en: "Oven and equipment" },
        source: "own",
        items: [
          {
            id: "item-1",
            title: { ru: "Включить печь", en: "Turn on the oven" },
            type: "bool",
            severity: "normal",
          },
        ],
      },
    ]);
  });

  test("старый признак critical из черновика читается как уровень", () => {
    // Черновики, заведённые до появления уровней, лежат в базе с булевым `critical`
    // и обязаны продолжать открываться правильно (D056).
    const sections = parseSections([
      goodSection({
        items: [
          { id: "item-1", title: { ru: "Газ" }, type: "bool", critical: true },
          {
            id: "item-2",
            title: { ru: "Столы" },
            type: "bool",
            critical: false,
          },
        ],
      }),
    ]);

    expect(sections[0]?.items.map((item) => item.severity)).toStrictEqual([
      "critical",
      "normal",
    ]);
  });

  test("явный уровень сильнее старого признака", () => {
    const sections = parseSections([
      goodSection({
        items: [
          {
            id: "item-1",
            title: { ru: "Газ" },
            type: "bool",
            critical: true,
            severity: "major",
          },
        ],
      }),
    ]);

    expect(sections[0]?.items[0]?.severity).toBe("major");
  });

  test("отбрасывает поля, которых нет в контракте с блоком fill", () => {
    // Контракт sections — единственное, что читает экран заполнения. Лишнее поле,
    // доехавшее до JSONB, живёт там вечно и однажды будет прочитано как значащее.
    const sections = parseSections([
      goodSection({
        colour: "красный",
        items: [
          {
            id: "item-1",
            title: { ru: "Включить печь" },
            type: "bool",
            severity: "normal",
            secret: "шпион",
          },
        ],
      }),
    ]);

    expect(sections[0]).not.toHaveProperty("colour");
    expect(sections[0]?.items[0]).not.toHaveProperty("secret");
  });

  test("оставляет только языки продукта", () => {
    const sections = parseSections([
      goodSection({ title: { ru: "Печь", en: "Oven", de: "Ofen" } }),
    ]);

    expect(sections[0]?.title).toStrictEqual({ ru: "Печь", en: "Oven" });
  });

  test("пункт без названия отбрасывается, а не роняет сохранение", () => {
    // Пустая строка внизу списка — обычное состояние редактора: методист нажал Enter
    // и ещё не напечатал текст. Сохранение по кнопке не должно на ней спотыкаться.
    const sections = parseSections([
      goodSection({
        items: [
          {
            id: "item-1",
            title: { ru: "Включить печь" },
            type: "bool",
            severity: "normal",
          },
          {
            id: "item-2",
            title: { ru: "  " },
            type: "bool",
            severity: "normal",
          },
        ],
      }),
    ]);

    expect(sections[0]?.items.map((item) => item.id)).toStrictEqual(["item-1"]);
  });

  test("секция без пунктов сохраняется: её только что завели", () => {
    const sections = parseSections([goodSection({ items: [] })]);

    expect(sections[0]?.items).toStrictEqual([]);
  });

  test("ссылка на блок библиотеки сохраняется как ссылка", () => {
    const sections = parseSections([
      goodSection({
        source: { blockId: "0f3a1f6e-6c1a-4c2e-9f2a-1f2b3c4d5e6f" },
      }),
    ]);

    expect(sections[0]?.source).toStrictEqual({
      blockId: "0f3a1f6e-6c1a-4c2e-9f2a-1f2b3c4d5e6f",
    });
  });

  test("границы числового пункта приходят строками из формы и становятся числами", () => {
    const sections = parseSections([
      goodSection({
        items: [
          {
            id: "item-1",
            title: { ru: "Температура фритюра" },
            type: "number",
            severity: "critical",
            min: "160",
            max: "180",
          },
        ],
      }),
    ]);

    expect(sections[0]?.items[0]).toMatchObject({
      type: "number",
      severity: "critical",
      min: 160,
      max: 180,
    });
  });

  test("пустые границы числового пункта означают «без границы»", () => {
    const sections = parseSections([
      goodSection({
        items: [
          {
            id: "item-1",
            title: { ru: "Температура фритюра" },
            type: "number",
            severity: "normal",
            min: "",
            max: "",
          },
        ],
      }),
    ]);

    expect(sections[0]?.items[0]).not.toHaveProperty("min");
    expect(sections[0]?.items[0]).not.toHaveProperty("max");
  });

  test("нижняя граница выше верхней отвергается", () => {
    expect(() =>
      parseSections([
        goodSection({
          items: [
            {
              id: "item-1",
              title: { ru: "Температура" },
              type: "number",
              severity: "normal",
              min: 180,
              max: 160,
            },
          ],
        }),
      ]),
    ).toThrow(expect.objectContaining({ code: "badRange" }) as unknown);
  });

  test("неизвестный тип ответа отвергается", () => {
    expect(() =>
      parseSections([
        goodSection({
          items: [
            {
              id: "item-1",
              title: { ru: "Пункт" },
              type: "подпись",
              severity: "normal",
            },
          ],
        }),
      ]),
    ).toThrow(EditorInputError);
  });

  test("не массив — отказ, а не пустой чек-лист", () => {
    // Молча превратить мусор в пустой список значит стереть чек-лист методисту.
    expect(() => parseSections({ sections: [] })).toThrow(
      expect.objectContaining({ code: "badFormat" }) as unknown,
    );
    expect(() => parseSections(null)).toThrow(EditorInputError);
    expect(() => parseSections("[]")).toThrow(EditorInputError);
  });

  test("слишком длинный текст отвергается", () => {
    expect(() =>
      parseSections([
        goodSection({ title: { ru: "я".repeat(LIMITS.textLength + 1) } }),
      ]),
    ).toThrow(expect.objectContaining({ code: "textTooLong" }) as unknown);
  });

  test("больше пунктов, чем помещается в чек-лист, — отказ с внятным кодом", () => {
    // Верхняя граница размера JSONB стоит в базе; до неё отказ должен прийти отсюда,
    // иначе методист увидит ошибку драйвера вместо объяснения.
    const items = Array.from(
      { length: LIMITS.items + 1 },
      (_unused, index) => ({
        id: `item-${String(index)}`,
        title: { ru: `Пункт ${String(index)}` },
        type: "bool",
        severity: "normal",
      }),
    );

    expect(() => parseSections([goodSection({ items })])).toThrow(
      expect.objectContaining({ code: "tooManyItems" }) as unknown,
    );
  });

  test("больше секций, чем разрешено, — отказ", () => {
    const sections = Array.from(
      { length: LIMITS.sections + 1 },
      (_unused, index) => goodSection({ id: `section-${String(index)}` }),
    );

    expect(() => parseSections(sections)).toThrow(
      expect.objectContaining({ code: "tooManySections" }) as unknown,
    );
  });
});

describe("parseWindow", () => {
  test("время из формы дополняется секундами", () => {
    expect(parseWindow("06:00", "11:00")).toStrictEqual({
      start: "06:00:00",
      end: "11:00:00",
    });
  });

  test("окно через полночь — обычное вечернее окно, а не ошибка", () => {
    expect(parseWindow("20:00", "00:00")).toStrictEqual({
      start: "20:00:00",
      end: "00:00:00",
    });
  });

  test("«без ограничения» — это сутки целиком", () => {
    // 24:00 — законное значение time в PostgreSQL, и оно делает условие выбора версии
    // истинным в любую минуту. Равные границы для этого не годятся: их запрещает база.
    expect(parseWindow("00:00", "24:00")).toStrictEqual({
      start: "00:00:00",
      end: "24:00:00",
    });
  });

  test("равные границы отвергаются до базы", () => {
    expect(() => parseWindow("08:00", "08:00")).toThrow(
      expect.objectContaining({ code: "emptyWindow" }) as unknown,
    );
  });

  test("не время — отказ", () => {
    expect(() => parseWindow("утром", "11:00")).toThrow(EditorInputError);
    expect(() => parseWindow("25:00", "11:00")).toThrow(EditorInputError);
    expect(() => parseWindow("06:60", "11:00")).toThrow(EditorInputError);
  });
});

describe("расписание периодической проверки (T137)", () => {
  // Разбор пункта собирал его заново из перечисленных полей — и `schedule` в этот
  // список не входил. То есть боевой пакет, залитый импортом вместе с расписаниями,
  // терял их молча при первом же «Сохранить черновик»: отказа нет, экран прежний,
  // обходы просто перестают существовать. Это и есть главный смысл задачи —
  // расписание обязано пережить дорогу через редактор.
  function withSchedule(item: Record<string, unknown>): unknown[] {
    return [
      {
        id: "section-1",
        title: { ru: "Обход" },
        source: "own",
        items: [
          {
            id: "item-1",
            title: { ru: "Проверить сроки годности" },
            type: "bool",
            severity: "critical",
            ...item,
          },
        ],
      },
    ];
  }

  const HOURLY = { from: "08:00", to: "16:00", everyMinutes: 60 };
  const EVERY_TWO = { from: "16:00", to: "23:00", everyMinutes: 120 };

  test("расписание доезжает до базы, а не отбрасывается разбором", () => {
    const [section] = parseSections(withSchedule({ schedule: [HOURLY] }));

    expect(section?.items[0]?.schedule).toStrictEqual([HOURLY]);
  });

  test("два отрезка переживают разбор оба и в своём порядке", () => {
    // Неравномерная сетка — это второй отрезок, а не второй чек-лист (D075).
    const [section] = parseSections(
      withSchedule({ schedule: [HOURLY, EVERY_TWO] }),
    );

    expect(section?.items[0]?.schedule).toStrictEqual([HOURLY, EVERY_TWO]);
  });

  test("пункт без расписания поля не получает: обычный пункт остаётся обычным", () => {
    const [section] = parseSections(withSchedule({}));

    expect(section?.items[0]).not.toHaveProperty("schedule");
  });

  test("пустой список отрезков полем не становится", () => {
    // Иначе «убрал регулярность» оставлял бы за собой пустой `schedule: []`,
    // а `isPeriodic` считает пункт обычным и по нему, и по отсутствию поля —
    // два способа записать одно состояние расходятся молча.
    const [section] = parseSections(withSchedule({ schedule: [] }));

    expect(section?.items[0]).not.toHaveProperty("schedule");
  });

  test("сломанный отрезок отказывает на границе, а не уезжает в версию", () => {
    // Версии неизменяемы (принцип 3, D002): расписание, уехавшее сломанным,
    // там уже не починить.
    expect(() =>
      parseSections(
        withSchedule({
          schedule: [{ from: "08:00", to: "08:00", everyMinutes: 60 }],
        }),
      ),
    ).toThrow(EditorInputError);
  });

  test("шаг ноль или отрицательный не принимается", () => {
    expect(() =>
      parseSections(
        withSchedule({ schedule: [{ ...HOURLY, everyMinutes: 0 }] }),
      ),
    ).toThrow(EditorInputError);
  });

  test("не список вместо расписания — отказ", () => {
    expect(() =>
      parseSections(withSchedule({ schedule: "каждый час" })),
    ).toThrow(EditorInputError);
  });

  test("частота напоминания при просрочке доезжает до базы (D068)", () => {
    const [section] = parseSections(
      withSchedule({ schedule: [HOURLY], remindEveryMinutes: 20 }),
    );

    expect(section?.items[0]?.remindEveryMinutes).toBe(20);
  });

  test("«молчать» — это отсутствие поля, а не ноль", () => {
    const [section] = parseSections(withSchedule({ schedule: [HOURLY] }));

    expect(section?.items[0]).not.toHaveProperty("remindEveryMinutes");
  });

  test("частота не из списка 10/20/60 не принимается", () => {
    // Список закрыт решением владельца (D068). Открытое число здесь означало бы
    // «каждые 3 минуты» на планшете, который стоит в зале.
    expect(() =>
      parseSections(
        withSchedule({ schedule: [HOURLY], remindEveryMinutes: 3 }),
      ),
    ).toThrow(EditorInputError);
  });

  test("частота без расписания не хранится: звонить нечему", () => {
    const [section] = parseSections(withSchedule({ remindEveryMinutes: 20 }));

    expect(section?.items[0]).not.toHaveProperty("remindEveryMinutes");
  });
});
