// Правка разметки в браузере: что делают Enter, Alt+стрелки, вставка списка и
// переключатели пункта. Функции чистые и неизменяющие — экран только зовёт их и кладёт
// новый список в состояние; из-за этого правила поведения проверяются здесь, без браузера,
// а сквозной сценарий проверяет уже связку с клавиатурой.
import { describe, expect, test } from "vitest";

import type { Item, Section } from "@/blocks/data";

import {
  addItemAfter,
  addSection,
  emptyItem,
  insertItems,
  itemCount,
  insertLibrarySection,
  linkedBlockId,
  moveItem,
  removeItem,
  removeSection,
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
