import { describe, expect, test } from "vitest";

import type { Item, Section } from "@/blocks/data";

import { splitPeriodic } from "./preview-items";

const HOURLY = { from: "08:00", to: "16:00", everyMinutes: 60 };

function item(id: string, extra: Partial<Item> = {}): Item {
  return {
    id,
    title: { ru: `Пункт ${id}` },
    type: "bool",
    severity: "normal",
    ...extra,
  };
}

function section(id: string, items: Item[]): Section {
  return { id, title: { ru: `Секция ${id}` }, source: "own", items };
}

describe("предпросмотр отделяет периодические пункты (T137)", () => {
  test("обычные пункты остаются в форме, периодический в неё не идёт", () => {
    const split = splitPeriodic([
      section("s1", [item("a"), item("b", { schedule: [HOURLY] }), item("c")]),
    ]);

    expect(split.sections[0]?.items.map((one) => one.id)).toStrictEqual([
      "a",
      "c",
    ]);
    expect(split.periodic.map((one) => one.item.id)).toStrictEqual(["b"]);
  });

  test("пустой список отрезков — это обычный пункт, а не периодический", () => {
    const split = splitPeriodic([section("s1", [item("a", { schedule: [] })])]);

    expect(split.sections[0]?.items.map((one) => one.id)).toStrictEqual(["a"]);
    expect(split.periodic).toStrictEqual([]);
  });

  test("секция, где остались одни периодические пункты, из формы пропадает", () => {
    // Иначе сотрудник увидел бы заголовок секции без единой строки под ним:
    // то же правило, что у пунктов без названия в `PreviewScreen#visibleSections`.
    const split = splitPeriodic([
      section("s1", [item("a", { schedule: [HOURLY] })]),
      section("s2", [item("b")]),
    ]);

    expect(split.sections.map((one) => one.id)).toStrictEqual(["s2"]);
    expect(split.periodic.map((one) => one.item.id)).toStrictEqual(["a"]);
  });

  test("периодический пункт несёт название своей секции: панель обхода стоит вне секций", () => {
    const split = splitPeriodic([
      section("s1", [item("a", { schedule: [HOURLY] })]),
    ]);

    expect(split.periodic[0]?.sectionTitle).toStrictEqual({
      ru: "Секция s1",
    });
  });

  test("порядок периодических пунктов — порядок чек-листа, а не порядок секций наоборот", () => {
    const split = splitPeriodic([
      section("s1", [item("a", { schedule: [HOURLY] })]),
      section("s2", [
        item("b", { schedule: [HOURLY] }),
        item("c", { schedule: [HOURLY] }),
      ]),
    ]);

    expect(split.periodic.map((one) => one.item.id)).toStrictEqual([
      "a",
      "b",
      "c",
    ]);
  });

  test("исходные секции не меняются", () => {
    const sections = [
      section("s1", [item("a"), item("b", { schedule: [HOURLY] })]),
    ];
    splitPeriodic(sections);

    expect(sections[0]?.items.map((one) => one.id)).toStrictEqual(["a", "b"]);
  });
});
