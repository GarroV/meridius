// Отличия шаблона между двумя его версиями и перенос выбранных отличий в копию (D155).
// Ядро: ошибка здесь молча портит чек-лист страны — пункт, который методист не выбирал,
// приезжает в копию, или выбранный теряется, а экран при этом говорит «взято».
import { describe, expect, test } from "vitest";

import type { Item, Section } from "@/blocks/data";

import { applyTemplateChanges, diffTemplateVersions } from "./template-diff";

function item(id: string, title: string, extra: Partial<Item> = {}): Item {
  return { id, title: { ru: title }, type: "bool", ...extra };
}

function section(id: string, items: Item[], title = id): Section {
  return { id, title: { ru: title }, source: "own", items };
}

const V3: Section[] = [
  section("open", [item("a", "Свет"), item("b", "Печь"), item("c", "Весы")]),
];

describe("отличия двух версий шаблона", () => {
  test("одинаковые версии — отличий нет", () => {
    expect(diffTemplateVersions(V3, structuredClone(V3))).toEqual([]);
  });

  test("порядок ключей в пункте отличием не считается", () => {
    // Разметка приезжает из JSONB: база переставляет ключи по-своему, и сравнение по
    // строке объявило бы изменённым каждый пункт.
    const reordered: Section[] = [
      section("open", [
        { type: "bool", title: { ru: "Свет" }, id: "a" },
        item("b", "Печь"),
        item("c", "Весы"),
      ]),
    ];
    expect(diffTemplateVersions(V3, reordered)).toEqual([]);
  });

  test("добавленный, изменённый и удалённый пункт названы каждый своим родом", () => {
    const v5: Section[] = [
      section("open", [
        item("a", "Свет и вытяжка"),
        item("b", "Печь"),
        item("d", "Тесто"),
      ]),
    ];

    const changes = diffTemplateVersions(V3, v5);

    expect(changes.map((one) => [one.kind, one.itemId])).toEqual([
      ["changed", "a"],
      ["added", "d"],
      ["removed", "c"],
    ]);
    expect(changes[0]?.before?.title).toEqual({ ru: "Свет" });
    expect(changes[0]?.after?.title).toEqual({ ru: "Свет и вытяжка" });
  });

  test("смена типа или уровня — тоже изменение", () => {
    const v4: Section[] = [
      section("open", [
        item("a", "Свет", { severity: "critical" }),
        item("b", "Печь", { type: "number", min: 180, max: 250 }),
        item("c", "Весы"),
      ]),
    ];
    expect(diffTemplateVersions(V3, v4).map((one) => one.itemId)).toEqual([
      "a",
      "b",
    ]);
  });

  test("пункт, переехавший в другую секцию, — изменение с новой секцией", () => {
    const v4: Section[] = [
      section("open", [item("a", "Свет"), item("b", "Печь")]),
      section("close", [item("c", "Весы")], "Закрытие"),
    ];

    const [change] = diffTemplateVersions(V3, v4);

    expect(change?.kind).toBe("changed");
    expect(change?.itemId).toBe("c");
    expect(change?.sectionId).toBe("close");
    expect(change?.sectionTitle).toEqual({ ru: "Закрытие" });
  });
});

describe("перенос выбранных отличий в копию", () => {
  // Копия страны уже отличается от шаблона: свой пункт «x», переименованная печь.
  const COPY: Section[] = [
    section("open", [
      item("a", "Свет"),
      item("b", "Печь — наша"),
      item("x", "Своё"),
      item("c", "Весы"),
    ]),
  ];
  const V5: Section[] = [
    section("open", [
      item("a", "Свет и вытяжка"),
      item("b", "Печь"),
      item("d", "Тесто"),
    ]),
    section("close", [item("e", "Касса")], "Закрытие"),
  ];

  test("взятое изменение заменяет пункт копии на его месте", () => {
    const changes = diffTemplateVersions(V3, V5);
    const next = applyTemplateChanges(COPY, V5, changes, ["a"]);

    expect(next[0]?.items.map((one) => one.id)).toEqual(["a", "b", "x", "c"]);
    expect(next[0]?.items[0]?.title).toEqual({ ru: "Свет и вытяжка" });
    // Невыбранное не трогается: правка страны остаётся её правкой.
    expect(next[0]?.items[1]?.title).toEqual({ ru: "Печь — наша" });
  });

  test("добавленный пункт встаёт за своим соседом по шаблону", () => {
    const changes = diffTemplateVersions(V3, V5);
    const next = applyTemplateChanges(COPY, V5, changes, ["d"]);

    // В шаблоне «Тесто» идёт за «Печью» — в копии он встаёт за ней же, а не в конец.
    expect(next[0]?.items.map((one) => one.id)).toEqual([
      "a",
      "b",
      "d",
      "x",
      "c",
    ]);
  });

  test("удалённый в шаблоне пункт уходит из копии, только если его выбрали", () => {
    const changes = diffTemplateVersions(V3, V5);

    expect(
      applyTemplateChanges(COPY, V5, changes, [])[0]?.items.map((i) => i.id),
    ).toEqual(["a", "b", "x", "c"]);
    expect(
      applyTemplateChanges(COPY, V5, changes, ["c"])[0]?.items.map((i) => i.id),
    ).toEqual(["a", "b", "x"]);
  });

  test("пункт новой секции шаблона приезжает вместе с секцией", () => {
    const changes = diffTemplateVersions(V3, V5);
    const next = applyTemplateChanges(COPY, V5, changes, ["e"]);

    expect(next.map((one) => one.id)).toEqual(["open", "close"]);
    expect(next[1]?.title).toEqual({ ru: "Закрытие" });
    expect(next[1]?.items.map((one) => one.id)).toEqual(["e"]);
  });

  test("изменённый пункт, который страна у себя удалила, возвращается", () => {
    const withoutA: Section[] = [
      section("open", [item("b", "Печь"), item("c", "Весы")]),
    ];
    const changes = diffTemplateVersions(V3, V5);
    const next = applyTemplateChanges(withoutA, V5, changes, ["a"]);

    expect(next[0]?.items.map((one) => one.id)).toEqual(["a", "b", "c"]);
  });

  test("перенос не меняет исходную копию", () => {
    const before = structuredClone(COPY);
    applyTemplateChanges(COPY, V5, diffTemplateVersions(V3, V5), [
      "a",
      "c",
      "d",
      "e",
    ]);
    expect(COPY).toEqual(before);
  });

  test("опознаватель не из списка отличий ничего не делает", () => {
    // Форма — граница: присланный опознаватель чужого пункта не должен ни удалить его,
    // ни уронить перенос.
    const changes = diffTemplateVersions(V3, V5);
    expect(applyTemplateChanges(COPY, V5, changes, ["x"])).toEqual(COPY);
  });

  test("секция, опустевшая после переноса, уходит", () => {
    const onlyC: Section[] = [
      section("open", [item("a", "Свет")]),
      section("tail", [item("c", "Весы")]),
    ];
    const next = applyTemplateChanges(onlyC, V5, diffTemplateVersions(V3, V5), [
      "c",
    ]);
    expect(next.map((one) => one.id)).toEqual(["open"]);
  });
});
