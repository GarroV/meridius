// Правка разметки в браузере: что делают Enter, Alt+стрелки, вставка списка и
// переключатели пункта. Функции чистые и неизменяющие — экран только зовёт их и кладёт
// новый список в состояние; из-за этого правила поведения проверяются здесь, без браузера,
// а сквозной сценарий проверяет уже связку с клавиатурой.
import { describe, expect, test } from "vitest";

import type { Item, Section } from "@/blocks/data";

import {
  addColumn,
  addItemAfter,
  addSection,
  applyScheduleToSection,
  emptyItem,
  insertItems,
  itemCount,
  insertLibrarySection,
  linkedBlockId,
  moveItem,
  removeColumn,
  removeItem,
  removeSection,
  setColumnNorm,
  setColumnTitle,
  setItemSchedule,
  setItemTitle,
  setSectionTitle,
  unlinkSection,
  updateItem,
} from "./editing";

function item(id: string, title = `Пункт ${id}`): Item {
  return { id, title: { ru: title }, type: "bool", severity: "normal" };
}

function sections(): Section[] {
  return [
    {
      id: "s1",
      title: { ru: "Печь" },
      source: "own",
      items: [item("a"), item("b"), item("c")],
    },
    {
      id: "s2",
      title: { ru: "Холодильники" },
      source: "own",
      items: [item("d")],
    },
  ];
}

const ids = (list: Section[], sectionId: string): string[] =>
  list
    .find((section) => section.id === sectionId)
    ?.items.map((one) => one.id) ?? [];

describe("addItemAfter (Enter создаёт следующий пункт)", () => {
  test("вставляет новый пункт сразу за текущим и называет, куда ставить курсор", () => {
    const before = sections();

    const { sections: after, focusItemId } = addItemAfter(before, "s1", "a");

    expect(ids(after, "s1")).toStrictEqual(["a", focusItemId, "b", "c"]);
    // Enter посреди списка не отправляет методиста в конец: следующий пункт идёт следом.
    expect(focusItemId).not.toBe("a");
    expect(ids(before, "s1")).toStrictEqual(["a", "b", "c"]);
  });

  test("в конце секции добавляет пункт в конец", () => {
    const { sections: after, focusItemId } = addItemAfter(
      sections(),
      "s1",
      "c",
    );

    expect(ids(after, "s1")).toStrictEqual(["a", "b", "c", focusItemId]);
  });

  test("в пустой секции создаёт первый пункт", () => {
    const empty: Section[] = [
      { id: "s3", title: {}, source: "own", items: [] },
    ];

    const { sections: after, focusItemId } = addItemAfter(empty, "s3", null);

    expect(ids(after, "s3")).toStrictEqual([focusItemId]);
  });

  test("новый пункт — обычный «да/нет» обычного уровня", () => {
    // Тип по умолчанию задан требованием блока: критичность выставляется по месту.
    const { sections: after, focusItemId } = addItemAfter(
      sections(),
      "s1",
      "a",
    );
    const created = after[0]?.items.find((one) => one.id === focusItemId);

    expect(created).toMatchObject({
      type: "bool",
      severity: "normal",
      title: {},
    });
  });
});

describe("moveItem (Alt+стрелки переставляют пункт)", () => {
  test("вверх и вниз внутри секции", () => {
    const down = moveItem(sections(), "a", 1);
    expect(ids(down.sections, "s1")).toStrictEqual(["b", "a", "c"]);
    expect(down.moved).toBe(true);

    const up = moveItem(down.sections, "a", -1);
    expect(ids(up.sections, "s1")).toStrictEqual(["a", "b", "c"]);
  });

  test("на границе секции пункт остаётся на месте, а не прыгает в соседнюю", () => {
    // Пункт, уехавший в другую секцию от одного нажатия, — это потерянный пункт:
    // методист смотрит на своё место в списке и не видит, куда он делся.
    const top = moveItem(sections(), "a", -1);
    expect(top.moved).toBe(false);
    expect(ids(top.sections, "s1")).toStrictEqual(["a", "b", "c"]);

    const bottom = moveItem(sections(), "c", 1);
    expect(bottom.moved).toBe(false);
    expect(ids(bottom.sections, "s1")).toStrictEqual(["a", "b", "c"]);
  });

  test("незнакомый пункт ничего не переставляет", () => {
    const result = moveItem(sections(), "нет-такого", 1);

    expect(result.moved).toBe(false);
    expect(result.sections).toStrictEqual(sections());
  });
});

describe("insertItems (вставка списка из буфера)", () => {
  test("двадцать пунктов встают за текущим одним действием", () => {
    const pasted = Array.from({ length: 20 }, (_unused, index) =>
      item(`p${String(index)}`),
    );

    const after = insertItems(sections(), "s1", "a", pasted);

    expect(ids(after, "s1")).toStrictEqual([
      "a",
      ...pasted.map((one) => one.id),
      "b",
      "c",
    ]);
  });

  test("вставка в пустой пункт занимает его место, а не оставляет пустую строку", () => {
    // Методист нажал Enter, получил пустую строку и вставил в неё список: пустая
    // строка должна исчезнуть, иначе в чек-листе остаётся дырка на ровном месте.
    const withEmpty: Section[] = [
      { id: "s1", title: {}, source: "own", items: [item("a"), emptyItem()] },
    ];
    const target = withEmpty[0]?.items[1]?.id ?? "";

    const after = insertItems(withEmpty, "s1", target, [
      item("p1"),
      item("p2"),
    ]);

    expect(ids(after, "s1")).toStrictEqual(["a", "p1", "p2"]);
  });

  test("вставка в конец списка, когда пункта-якоря нет", () => {
    const after = insertItems(sections(), "s2", null, [item("p1")]);

    expect(ids(after, "s2")).toStrictEqual(["d", "p1"]);
  });
});

describe("правка пункта", () => {
  test("текст пишется на языке интерфейса и не стирает второй язык", () => {
    const twoLanguages: Section[] = [
      {
        id: "s1",
        title: {},
        source: "own",
        items: [
          {
            id: "a",
            title: { ru: "Печь", en: "Oven" },
            type: "bool",
            severity: "normal",
          },
        ],
      },
    ];

    const after = setItemTitle(twoLanguages, "a", "ru", "Печь и вытяжка");

    expect(after[0]?.items[0]?.title).toStrictEqual({
      ru: "Печь и вытяжка",
      en: "Oven",
    });
  });

  test("тип ответа и критичность меняются по месту", () => {
    const after = updateItem(sections(), "a", {
      type: "number",
      severity: "critical",
      min: 160,
      max: 180,
    });

    expect(after[0]?.items[0]).toMatchObject({
      type: "number",
      severity: "critical",
      min: 160,
      max: 180,
    });
  });

  test("смена типа на «да/нет» убирает границы диапазона", () => {
    // Иначе границы уедут в базу у пункта, где их не видно и не поправить.
    const numeric = updateItem(sections(), "a", {
      type: "number",
      min: 1,
      max: 2,
    });

    const back = updateItem(numeric, "a", { type: "bool" });

    expect(back[0]?.items[0]).not.toHaveProperty("min");
    expect(back[0]?.items[0]).not.toHaveProperty("max");
  });

  test("удаление пункта не трогает соседей", () => {
    const after = removeItem(sections(), "b");

    expect(ids(after, "s1")).toStrictEqual(["a", "c"]);
    expect(ids(after, "s2")).toStrictEqual(["d"]);
  });
});

describe("секции", () => {
  test("новая секция добавляется в конец и сразу с пустым пунктом", () => {
    const { sections: after, sectionId } = addSection(sections());

    expect(after).toHaveLength(3);
    expect(after[2]?.id).toBe(sectionId);
    expect(after[2]?.items).toHaveLength(1);
  });

  test("название секции пишется на языке интерфейса", () => {
    const after = setSectionTitle(sections(), "s1", "en", "Oven");

    expect(after[0]?.title).toStrictEqual({ ru: "Печь", en: "Oven" });
  });

  test("удаление секции убирает её целиком", () => {
    const after = removeSection(sections(), "s1");

    expect(after.map((section) => section.id)).toStrictEqual(["s2"]);
  });

  test("вставка блока библиотеки добавляет секцию-ссылку с его пунктами", () => {
    const after = insertLibrarySection(sections(), {
      id: "0f3a1f6e-6c1a-4c2e-9f2a-1f2b3c4d5e6f",
      title: { ru: "Санитария" },
      items: [item("l1")],
    });

    const inserted = after[2];
    expect(inserted?.source).toStrictEqual({
      blockId: "0f3a1f6e-6c1a-4c2e-9f2a-1f2b3c4d5e6f",
    });
    expect(inserted?.title).toStrictEqual({ ru: "Санитария" });
    expect(inserted?.items.map((one) => one.id)).toStrictEqual(["l1"]);
  });

  test("«отвязать» превращает блок в свои пункты с новыми опознавателями", () => {
    // Пункты остаются те же, но чек-лист перестаёт зависеть от блока: правка блока
    // сюда больше не придёт. Опознаватели новые, чтобы два чек-листа не делили пункт.
    const withBlock = insertLibrarySection(sections(), {
      id: "0f3a1f6e-6c1a-4c2e-9f2a-1f2b3c4d5e6f",
      title: { ru: "Санитария" },
      items: [item("l1")],
    });
    const sectionId = withBlock[2]?.id ?? "";

    const after = unlinkSection(withBlock, sectionId);

    expect(after[2]?.source).toBe("own");
    expect(after[2]?.items[0]?.title).toStrictEqual({ ru: "Пункт l1" });
    expect(after[2]?.items[0]?.id).not.toBe("l1");
  });
});

describe("itemCount", () => {
  test("считает пункты по всем секциям", () => {
    expect(itemCount(sections())).toBe(4);
  });
});

describe("linkedBlockId (куда ведёт «Открыть блок», T115)", () => {
  const BLOCK_ID = "0f3a1f6e-6c1a-4c2e-9f2a-1f2b3c4d5e6f";

  function withLibraryBlock(): Section[] {
    return insertLibrarySection(sections(), {
      id: BLOCK_ID,
      title: { ru: "Санитария" },
      items: [item("l1")],
    });
  }

  test("у секции-ссылки отдаёт опознаватель вставленного блока", () => {
    const linked = withLibraryBlock()[2];

    expect(linked === undefined ? null : linkedBlockId(linked)).toBe(BLOCK_ID);
  });

  test("у своей секции отдаёт null — открывать в библиотеке нечего", () => {
    const own = sections()[0];

    expect(own === undefined ? "нет секции" : linkedBlockId(own)).toBeNull();
  });

  test("после отвязки ссылки больше нет", () => {
    // Иначе «Открыть блок» пережил бы отвязку и увёл бы в блок, к которому секция
    // уже не имеет отношения.
    const withBlock = withLibraryBlock();
    const after = unlinkSection(withBlock, withBlock[2]?.id ?? "");
    const unlinked = after[2];

    expect(
      unlinked === undefined ? "нет секции" : linkedBlockId(unlinked),
    ).toBeNull();
  });
});

describe("регулярность пункта (T137)", () => {
  const HOURLY = { from: "08:00", to: "16:00", everyMinutes: 60 };
  const EVERY_TWO = { from: "16:00", to: "23:00", everyMinutes: 120 };

  test("чип ставит расписание одному пункту, соседей не трогает", () => {
    const next = setItemSchedule(sections(), "b", {
      schedule: [HOURLY],
      remindEveryMinutes: 20,
    });

    expect(next[0]?.items[1]).toMatchObject({
      schedule: [HOURLY],
      remindEveryMinutes: 20,
    });
    expect(next[0]?.items[0]).not.toHaveProperty("schedule");
    expect(next[0]?.items[2]).not.toHaveProperty("schedule");
  });

  test("«убрать регулярность» снимает и расписание, и частоту", () => {
    // Оставленная частота — поле, которое ни на что не влияет: следующий читатель
    // примет его за работающее, а звонить будет нечему.
    const periodic = setItemSchedule(sections(), "b", {
      schedule: [HOURLY],
      remindEveryMinutes: 20,
    });

    const next = setItemSchedule(periodic, "b", { schedule: [] });

    expect(next[0]?.items[1]).not.toHaveProperty("schedule");
    expect(next[0]?.items[1]).not.toHaveProperty("remindEveryMinutes");
  });

  test("«молчать» снимает частоту, но расписание оставляет", () => {
    const periodic = setItemSchedule(sections(), "b", {
      schedule: [HOURLY],
      remindEveryMinutes: 60,
    });

    const next = setItemSchedule(periodic, "b", { schedule: [HOURLY] });

    expect(next[0]?.items[1]?.schedule).toStrictEqual([HOURLY]);
    expect(next[0]?.items[1]).not.toHaveProperty("remindEveryMinutes");
  });

  test("«применить ко всей секции» кладёт настройку на каждый пункт секции", () => {
    // Секция носителем расписания НЕ становится (D075): это перенос настройки на
    // семь строк, работа редактора, а не новая сущность модели. Поэтому и проверяем
    // пункты, а не поле у секции.
    const next = applyScheduleToSection(sections(), "s1", {
      schedule: [HOURLY, EVERY_TWO],
      remindEveryMinutes: 10,
    });

    for (const one of next[0]?.items ?? []) {
      expect(one).toMatchObject({
        schedule: [HOURLY, EVERY_TWO],
        remindEveryMinutes: 10,
      });
    }
    expect(next[0]?.items).toHaveLength(3);
  });

  test("«применить ко всей секции» не выходит за свою секцию", () => {
    const next = applyScheduleToSection(sections(), "s1", {
      schedule: [HOURLY],
    });

    for (const one of next[1]?.items ?? []) {
      expect(one).not.toHaveProperty("schedule");
    }
  });

  test("расписание не хранится у секции: у секции появиться нечему", () => {
    const next = applyScheduleToSection(sections(), "s1", {
      schedule: [HOURLY],
    });

    expect(next[0]).not.toHaveProperty("schedule");
  });

  test("смена типа ответа расписание НЕ стирает", () => {
    // `updateItem` пересобирал нечисловой пункт заново из перечисленных полей, и
    // `schedule` в этот список не входил: методист переключал «число» на «да/нет»
    // и терял обход молча. Тот же класс дефекта, что разбор, отбрасывавший расписание.
    const periodic = setItemSchedule(sections(), "b", {
      schedule: [HOURLY],
      remindEveryMinutes: 20,
    });

    const asNumber = updateItem(periodic, "b", { type: "number" });
    const backToBool = updateItem(asNumber, "b", { type: "bool" });

    expect(backToBool[0]?.items[1]).toMatchObject({
      schedule: [HOURLY],
      remindEveryMinutes: 20,
    });
  });

  test("смена типа не стирает и подсказку — прежнее поведение осталось", () => {
    // Контрольная: правка `updateItem` не имела права поменять то, что уже работало.
    const withHint = updateItem(sections(), "b", {
      hint: { ru: "У задней стенки" },
    });

    const next = updateItem(withHint, "b", { type: "text" });

    expect(next[0]?.items[1]?.hint).toStrictEqual({ ru: "У задней стенки" });
  });

  test("исходный список не меняется: функции чистые", () => {
    const before = sections();

    setItemSchedule(before, "b", { schedule: [HOURLY] });
    applyScheduleToSection(before, "s1", { schedule: [HOURLY] });

    expect(before[0]?.items[1]).not.toHaveProperty("schedule");
    expect(before[0]?.items[0]).not.toHaveProperty("schedule");
  });
});

describe("колонки табличного пункта (T141)", () => {
  /** Пункт-журнал с одной заполненной колонкой: от него тесты отклоняются. */
  function tableSections(): Section[] {
    return [
      {
        id: "s1",
        title: { ru: "Замес теста" },
        source: "own",
        items: [
          {
            id: "a",
            title: { ru: "Журнал замесов" },
            type: "table",
            severity: "normal",
            columns: [{ id: "c1", title: { ru: "Температура теста" } }],
          },
          item("b"),
        ],
      },
    ];
  }

  test("смена типа на «таблица» заводит первую колонку: курсору есть куда встать", () => {
    const next = updateItem(sections(), "a", { type: "table" });

    expect(next[0]?.items[0]?.columns).toHaveLength(1);
    expect(next[0]?.items[0]?.columns?.[0]?.title).toStrictEqual({});
  });

  test("смена типа на «таблица» у пункта с колонками их не пересобирает", () => {
    const next = updateItem(tableSections(), "a", { type: "table" });

    expect(next[0]?.items[0]?.columns).toStrictEqual([
      { id: "c1", title: { ru: "Температура теста" } },
    ]);
  });

  test("уход с типа «таблица» снимает колонки: невидимое поле в базу не уезжает", () => {
    const next = updateItem(tableSections(), "a", { type: "bool" });

    expect(next[0]?.items[0]).not.toHaveProperty("columns");
  });

  test("смена типа не трогает расписание и прочие поля пункта", () => {
    // Перечисление полей заново молча теряло всё, что появилось у пункта позже
    // (так смена типа однажды стёрла расписание обхода, T137).
    const next = updateItem(tableSections(), "a", { type: "table" });

    expect(next[0]?.items[0]?.title).toStrictEqual({ ru: "Журнал замесов" });
  });

  test("добавленная колонка встаёт в конец и возвращает свой опознаватель", () => {
    const { sections: next, focusColumnId } = addColumn(tableSections(), "a");
    const columns = next[0]?.items[0]?.columns ?? [];

    expect(columns).toHaveLength(2);
    expect(columns[1]?.id).toBe(focusColumnId);
    expect(columns[0]?.id).toBe("c1");
  });

  test("колонка добавляется только своему пункту", () => {
    const { sections: next } = addColumn(tableSections(), "a");

    expect(next[0]?.items[1]).not.toHaveProperty("columns");
  });

  test("название колонки правится на одном языке, второй остаётся", () => {
    const base = updateItem(tableSections(), "a", {
      columns: [
        { id: "c1", title: { ru: "Температура теста", en: "Dough temp" } },
      ],
    });

    const next = setColumnTitle(base, "a", "c1", "ru", "Температура, °C");

    expect(next[0]?.items[0]?.columns?.[0]?.title).toStrictEqual({
      ru: "Температура, °C",
      en: "Dough temp",
    });
  });

  test("норма правится отдельно от названия", () => {
    const next = setColumnNorm(tableSections(), "a", "c1", "ru", "24…26 °C");

    expect(next[0]?.items[0]?.columns?.[0]?.norm).toStrictEqual({
      ru: "24…26 °C",
    });
  });

  test("удаление колонки оставляет остальные в прежнем порядке", () => {
    const { sections: two } = addColumn(tableSections(), "a");
    const added = two[0]?.items[0]?.columns?.[1]?.id ?? "";

    const next = removeColumn(two, "a", "c1");

    expect(next[0]?.items[0]?.columns?.map((column) => column.id)).toStrictEqual(
      [added],
    );
  });

  test("удаление последней колонки оставляет пустой список, а не роняет пункт", () => {
    const next = removeColumn(tableSections(), "a", "c1");

    expect(next[0]?.items[0]?.columns).toStrictEqual([]);
  });
});
