import { describe, expect, it } from "vitest";

import type { Item, Section } from "@/blocks/data";

import {
  emptyDraft,
  gradingItemsById,
  gradingSections,
  rangeVerdict,
  summarizeFill,
  toAnswers,
} from "./answers";
import type { FillDraft } from "./answers";
import type { FillScreenView } from "./model";

const AT = 1_757_000_000_000;

function item(id: string, patch: Partial<Item> = {}): Item {
  return {
    id,
    title: { ru: id, en: id },
    type: "bool",
    ...patch,
  };
}

function sections(...items: Item[]): Section[] {
  return [
    { id: "s1", title: { ru: "Секция", en: "Section" }, source: "own", items },
  ];
}

function answered(
  draft: FillDraft,
  id: string,
  value: boolean | number | string,
  comment = "",
): FillDraft {
  return { ...draft, [id]: { value, comment, at: AT } };
}

describe("счёт заполнения", () => {
  it("пустой чек-лист: считать нечего, отправлять нечего", () => {
    const summary = summarizeFill([], emptyDraft());

    expect(summary).toMatchObject({ total: 0, answered: 0, remaining: 0 });
    expect(summary.canSubmit).toBe(false);
  });

  it("считает отвеченные пункты и остаток", () => {
    // Arrange
    const list = sections(item("a"), item("b"), item("c"));
    const draft = answered(emptyDraft(), "a", true);

    // Act
    const summary = summarizeFill(list, draft);

    // Assert
    expect(summary.total).toBe(3);
    expect(summary.answered).toBe(1);
    expect(summary.remaining).toBe(2);
    expect(summary.canSubmit).toBe(false);
  });

  it("«нет» — такой же ответ, как «да»: пункт закрыт", () => {
    const summary = summarizeFill(sections(item("a")), {
      a: { value: false, comment: "", at: AT },
    });

    expect(summary.answered).toBe(1);
    expect(summary.remaining).toBe(0);
    expect(summary.canSubmit).toBe(true);
  });

  it("числовой пункт закрыт числом, а пустая строка его не закрывает", () => {
    const list = sections(item("n", { type: "number", min: 2, max: 4 }));

    expect(summarizeFill(list, answered(emptyDraft(), "n", 3)).remaining).toBe(
      0,
    );
    expect(summarizeFill(list, answered(emptyDraft(), "n", "")).remaining).toBe(
      1,
    );
  });

  it("число вне диапазона отправку не блокирует", () => {
    // Критерий готовности 4: число показывает попадание в диапазон, но не запрещает отправку.
    const list = sections(item("n", { type: "number", min: 2, max: 4 }));

    const summary = summarizeFill(list, answered(emptyDraft(), "n", 9));

    expect(summary.failedItemIds).toStrictEqual(["n"]);
    expect(summary.canSubmit).toBe(true);
  });

  it("текстовый пункт закрывается непустым текстом", () => {
    const list = sections(item("t", { type: "text" }));

    expect(
      summarizeFill(list, answered(emptyDraft(), "t", "  ")).remaining,
    ).toBe(1);
    expect(
      summarizeFill(list, answered(emptyDraft(), "t", "порядок")).remaining,
    ).toBe(0);
  });

  it("текстовый пункт провалить нельзя: это описание, а не оценка", () => {
    const list = sections(item("t", { type: "text", critical: true }));

    const summary = summarizeFill(list, answered(emptyDraft(), "t", "что-то"));

    expect(summary.failedItemIds).toStrictEqual([]);
    expect(summary.canSubmit).toBe(true);
  });
});

describe("проваленный критичный пункт требует комментарий", () => {
  it("не даёт отправить, пока комментария нет", () => {
    // Arrange
    const list = sections(item("c", { critical: true }));
    const draft = answered(emptyDraft(), "c", false);

    // Act
    const summary = summarizeFill(list, draft);

    // Assert
    expect(summary.remaining).toBe(0);
    expect(summary.needsCommentItemIds).toStrictEqual(["c"]);
    expect(summary.canSubmit).toBe(false);
  });

  it("пробелы комментарием не считаются", () => {
    const list = sections(item("c", { critical: true }));

    const summary = summarizeFill(
      list,
      answered(emptyDraft(), "c", false, " "),
    );

    expect(summary.canSubmit).toBe(false);
  });

  it("важный пункт тоже требует объяснения провала", () => {
    const list = sections(item("m", { severity: "major" }));

    const summary = summarizeFill(list, answered(emptyDraft(), "m", false));

    expect(summary.needsCommentItemIds).toStrictEqual(["m"]);
    expect(summary.canSubmit).toBe(false);
  });

  it("обычный пункт провалить можно молча", () => {
    const list = sections(item("n", { severity: "normal" }));

    const summary = summarizeFill(list, answered(emptyDraft(), "n", false));

    expect(summary.needsCommentItemIds).toStrictEqual([]);
    expect(summary.canSubmit).toBe(true);
  });

  it("с комментарием отправка открывается", () => {
    const list = sections(item("c", { critical: true }));

    const summary = summarizeFill(
      list,
      answered(emptyDraft(), "c", false, "порвался уплотнитель"),
    );

    expect(summary.needsCommentItemIds).toStrictEqual([]);
    expect(summary.canSubmit).toBe(true);
  });

  it("некритичный проваленный пункт комментария не требует", () => {
    const list = sections(item("p"));

    const summary = summarizeFill(list, answered(emptyDraft(), "p", false));

    expect(summary.failedItemIds).toStrictEqual(["p"]);
    expect(summary.needsCommentItemIds).toStrictEqual([]);
    expect(summary.canSubmit).toBe(true);
  });

  it("критичное число вне диапазона тоже требует комментарий", () => {
    const list = sections(
      item("n", { type: "number", severity: "critical", min: 2, max: 4 }),
    );

    expect(
      summarizeFill(list, answered(emptyDraft(), "n", 9)).needsCommentItemIds,
    ).toStrictEqual(["n"]);
    expect(
      summarizeFill(list, answered(emptyDraft(), "n", 3)).needsCommentItemIds,
    ).toStrictEqual([]);
  });
});

describe("попадание числа в диапазон", () => {
  it("говорит «в диапазоне» и «вне диапазона», когда границы заданы", () => {
    const bounded = item("n", { type: "number", min: 2, max: 4 });

    expect(rangeVerdict(bounded, 3)).toBe("within");
    expect(rangeVerdict(bounded, 9)).toBe("outside");
    expect(rangeVerdict(bounded, 2)).toBe("within");
    expect(rangeVerdict(bounded, 4)).toBe("within");
  });

  it("молчит, когда границ нет или значение не число", () => {
    expect(rangeVerdict(item("n", { type: "number" }), 3)).toBe("unbounded");
    expect(rangeVerdict(item("n", { type: "number", min: 2 }), null)).toBe(
      "unbounded",
    );
    expect(rangeVerdict(item("b"), 3)).toBe("unbounded");
  });
});

describe("что уходит на сервер", () => {
  it("отдаёт только отвеченные пункты в порядке чек-листа", () => {
    // Arrange
    const list = sections(item("a"), item("b"), item("c"));
    const draft = answered(answered(emptyDraft(), "c", true), "a", false);

    // Act
    const result = toAnswers(list, draft);

    // Assert
    expect(result.map((answer) => answer.itemId)).toStrictEqual(["a", "c"]);
    expect(result[0]).toStrictEqual({ itemId: "a", value: false, at: AT });
  });

  it("комментарий уходит только непустой и без крайних пробелов", () => {
    const list = sections(item("a", { critical: true }), item("b"));
    const draft = answered(
      answered(emptyDraft(), "a", false, "  дверь  "),
      "b",
      true,
      "   ",
    );

    const result = toAnswers(list, draft);

    expect(result[0]?.comment).toBe("дверь");
    expect(result[1]).not.toHaveProperty("comment");
  });

  it("не тащит ответы на пункты, которых в чек-листе нет", () => {
    // В браузере пункт мог исчезнуть между отрисовками; в базу такой ответ не уходит.
    const list = sections(item("a"));
    const draft = answered(answered(emptyDraft(), "a", true), "чужой", true);

    expect(toAnswers(list, draft).map((answer) => answer.itemId)).toStrictEqual(
      ["a"],
    );
  });
});

describe("модель экрана обратно в пункты для счёта", () => {
  const view: FillScreenView = {
    checklistTitle: "Открытие кухни",
    where: "Пиццерия · Станция · 06:00–12:00",
    totalItems: 2,
    sections: [
      {
        id: "s1",
        title: "Печь",
        items: [
          {
            id: "a",
            title: "Включить",
            type: "bool",
            severity: "critical",
            hint: null,
          },
          {
            id: "n",
            title: "Температура",
            type: "number",
            severity: "normal",
            min: 2,
            max: 4,
            hint: "2…4",
          },
        ],
      },
    ],
  };

  it("сохраняет всё, от чего зависит счёт: тип, критичность, границы", () => {
    const [section] = gradingSections(view);

    expect(section?.items[0]).toStrictEqual({
      id: "a",
      title: {},
      type: "bool",
      severity: "critical",
    });
    expect(section?.items[1]).toMatchObject({ type: "number", min: 2, max: 4 });
  });

  it("этими пунктами считается заполнение так же, как настоящими", () => {
    const summary = summarizeFill(gradingSections(view), {
      a: { value: false, comment: "", at: AT },
    });

    expect(summary.total).toBe(2);
    expect(summary.needsCommentItemIds).toStrictEqual(["a"]);
  });

  it("отдаёт пункты по идентификатору", () => {
    expect(gradingItemsById(view).get("n")).toMatchObject({ min: 2, max: 4 });
    expect(gradingItemsById(view).has("нет такого")).toBe(false);
  });
});
