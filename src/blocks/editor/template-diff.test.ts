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

function withSchedule(everyMinutes: number): Section[] {
  return [
    section("open", [
      item("a", "Обход зала", {
        schedule: [{ from: "06:00", to: "11:00", everyMinutes }],
      }),
    ]),
  ];
}

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

  test("расписание обхода — массив внутри пункта, а не объект: то же расписание не отличие, другое — отличие", () => {
    // `canonical()` разбирает и объекты, и массивы (JSONB отдаёт и то, и другое) —
    // расписание обхода (T317) ровно такой массив внутри пункта.
    // Тот же список расписания, но другой массив (другая ссылка) — отличий нет.
    expect(diffTemplateVersions(withSchedule(30), withSchedule(30))).toEqual(
      [],
    );
    // Изменился шаг внутри расписания — это отличие пункта "a".
    expect(
      diffTemplateVersions(withSchedule(30), withSchedule(15)).map(
        (one) => one.itemId,
      ),
    ).toEqual(["a"]);
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

  test("секция, которая не при делах, остаётся какой была — перенос её не трогает", () => {
    // Копия страны держит две секции; отличие целится только в "open" — "close"
    // обязана вернуться неизменной, а не пересобранной заново.
    const before = [section("open", [item("a", "Свет")])];
    const after = [section("open", [item("a", "Свет и вытяжка")])];
    const changes = diffTemplateVersions(before, after);

    const copy = [
      section("open", [item("a", "Свет")]),
      section("close", [item("z", "Прочее")], "Закрытие"),
    ];
    const next = applyTemplateChanges(copy, after, changes, ["a"]);

    expect(next[0]?.items[0]?.title).toEqual({ ru: "Свет и вытяжка" });
    expect(next[1]).toEqual(copy[1]);
  });

  test("предшественник по шаблону не найден — ищем следующего, а не найдя ни одного, встаём в начало", () => {
    const before = [
      section("open", [item("a", "А"), item("b", "Б"), item("c", "В")]),
    ];
    const after = [
      section("open", [
        item("a", "А"),
        item("b", "Б"),
        item("c", "В"),
        item("d", "Г"),
      ]),
    ];
    const changes = diffTemplateVersions(before, after);

    // Копия не хранит ни "b", ни "c" (страна их удалила): искать место "d" приходится
    // мимо обоих кандидатов подряд, до найденного "a".
    const missingSomePredecessors = [
      section("open", [item("a", "А"), item("x", "Своё")]),
    ];
    expect(
      applyTemplateChanges(missingSomePredecessors, after, changes, [
        "d",
      ])[0]?.items.map((one) => one.id),
    ).toEqual(["a", "d", "x"]);

    // Ни один из предшественников ("a", "b", "c") в копии не сохранился — "d" встаёт
    // в самое начало секции.
    const missingAllPredecessors = [section("open", [item("x", "Своё")])];
    expect(
      applyTemplateChanges(missingAllPredecessors, after, changes, [
        "d",
      ])[0]?.items.map((one) => one.id),
    ).toEqual(["d", "x"]);
  });

  test("новая секция без единого предшественника в копии встаёт по своему месту в шаблоне — первой или последней", () => {
    const before = [section("keep", [item("k", "Есть")])];

    // "w" — первая секция шаблона; в копии её нет вовсе.
    const afterFirst = [
      section("w", [item("wi", "Новое")], "Первая новая"),
      section("keep", [item("k", "Есть")]),
    ];
    const copyWithoutFirst = [section("keep", [item("k", "Есть")])];
    const changesFirst = diffTemplateVersions(before, afterFirst);
    expect(
      applyTemplateChanges(copyWithoutFirst, afterFirst, changesFirst, [
        "wi",
      ]).map((one) => one.id),
    ).toEqual(["w", "keep"]);

    // "z" — третья секция шаблона; ни "keep", ни средняя "mid" в копии не сохранились.
    const afterLast = [
      section("keep", [item("k", "Есть")]),
      section("mid", [item("mi", "Средняя")], "Средняя"),
      section("z", [item("zi", "Хвост")], "Хвостовая"),
    ];
    const copyWithNeither = [section("misc", [item("m", "Своё")], "Чужая")];
    const changesLast = diffTemplateVersions(before, afterLast);
    expect(
      applyTemplateChanges(copyWithNeither, afterLast, changesLast, ["zi"]).map(
        (one) => one.id,
      ),
    ).toEqual(["misc", "z"]);
  });
});
