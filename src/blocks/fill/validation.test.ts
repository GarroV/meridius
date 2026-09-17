import { describe, expect, it } from "vitest";

import type { Answer, Item, Section } from "@/blocks/data";

import {
  FILL_INPUT_LIMITS,
  clampAnswerTimes,
  matchAnswersToSnapshot,
  parseSubmission,
} from "./validation";

const CODE = "abcdefghjk";
const VERSION = "3f1c2c0e-9d3a-4b0e-8a2f-6f1d2c3b4a59";
const AT = 1_757_000_000_000;
// Форму тела проверяет `parseSubmission`, подпись — `ticket.ts`: здесь годится
// любая непустая строка в пределах длины.
const TICKET = `${String(AT)}.подпись`;

function payload(patch: Record<string, unknown> = {}): unknown {
  return {
    code: CODE,
    versionId: VERSION,
    ticket: TICKET,
    answers: [{ itemId: "a", value: true, at: AT }],
    ...patch,
  };
}

function item(id: string, patch: Partial<Item> = {}): Item {
  return {
    id,
    title: { ru: id, en: id },
    type: "bool",
    critical: false,
    ...patch,
  };
}

function snapshot(...items: Item[]): Section[] {
  return [{ id: "s1", title: { ru: "С", en: "S" }, source: "own", items }];
}

describe("проверка входящих данных схемой на границе", () => {
  it("пропускает правильно устроенную отправку", () => {
    const parsed = parseSubmission(payload());

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.code).toBe(CODE);
    expect(parsed.value.answers).toHaveLength(1);
  });

  it("отбивает всё, что не объект", () => {
    for (const input of [null, undefined, 42, "строка", [], true]) {
      expect(parseSubmission(input).ok).toBe(false);
    }
  });

  it("отбивает отсутствующие и не строковые код и версию", () => {
    expect(parseSubmission(payload({ code: undefined })).ok).toBe(false);
    expect(parseSubmission(payload({ code: 5 })).ok).toBe(false);
    expect(parseSubmission(payload({ code: "" })).ok).toBe(false);
    expect(parseSubmission(payload({ versionId: "не uuid" })).ok).toBe(false);
    expect(parseSubmission(payload({ versionId: null })).ok).toBe(false);
  });

  it("отбивает код в чужом формате и запредельной длины", () => {
    expect(parseSubmission(payload({ code: "../../etc" })).ok).toBe(false);
    expect(parseSubmission(payload({ code: "a".repeat(500) })).ok).toBe(false);
  });

  it("отбивает тело без пропуска и с пропуском не строкой", () => {
    // Пропуск заменил «время начала»: тело, которое его не несёт, — это тело не
    // с нашего экрана, и разбирать его дальше незачем.
    for (const ticket of [undefined, "", 42, null, { подпись: true }]) {
      expect(parseSubmission(payload({ ticket })).ok).toBe(false);
    }
  });

  it("отбивает пропуск сверх предела длины", () => {
    const long = "a".repeat(FILL_INPUT_LIMITS.maxTicketLength + 1);

    expect(parseSubmission(payload({ ticket: long })).ok).toBe(false);
  });

  it("отбивает ответы не массивом и сверх предела длины", () => {
    expect(parseSubmission(payload({ answers: { a: true } })).ok).toBe(false);

    const tooMany = Array.from(
      { length: FILL_INPUT_LIMITS.maxAnswers + 1 },
      (_, index) => ({ itemId: `i${String(index)}`, value: true, at: AT }),
    );
    expect(parseSubmission(payload({ answers: tooMany })).ok).toBe(false);
  });

  it("отбивает ответ с чужим типом значения и без обязательных полей", () => {
    expect(
      parseSubmission(payload({ answers: [{ value: true, at: AT }] })).ok,
    ).toBe(false);
    expect(
      parseSubmission(payload({ answers: [{ itemId: "a", at: AT }] })).ok,
    ).toBe(false);
    expect(
      parseSubmission(
        payload({ answers: [{ itemId: "a", value: { уловка: 1 }, at: AT }] }),
      ).ok,
    ).toBe(false);
    expect(
      parseSubmission(payload({ answers: [{ itemId: "a", value: true }] })).ok,
    ).toBe(false);
  });

  it("отбивает длинный текст и длинный комментарий", () => {
    const longText = "я".repeat(FILL_INPUT_LIMITS.maxTextLength + 1);
    const longComment = "я".repeat(FILL_INPUT_LIMITS.maxCommentLength + 1);

    expect(
      parseSubmission(
        payload({ answers: [{ itemId: "a", value: longText, at: AT }] }),
      ).ok,
    ).toBe(false);
    expect(
      parseSubmission(
        payload({
          answers: [{ itemId: "a", value: true, comment: longComment, at: AT }],
        }),
      ).ok,
    ).toBe(false);
  });

  it("не тащит дальше посторонние поля", () => {
    // Лишнее поле в теле не должно доехать до записи в базу.
    const parsed = parseSubmission(
      payload({
        stationId: "чужая-станция",
        answers: [{ itemId: "a", value: true, at: AT, подделка: 1 }],
      }),
    );

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value).not.toHaveProperty("stationId");
    expect(Object.keys(parsed.value.answers[0] ?? {}).sort()).toStrictEqual([
      "at",
      "itemId",
      "value",
    ]);
  });
});

describe("сверка ответов со снимком версии", () => {
  it("пропускает ответы на пункты этой версии", () => {
    const answers: Answer[] = [{ itemId: "a", value: true, at: AT }];

    const checked = matchAnswersToSnapshot(snapshot(item("a")), answers);

    expect(checked).toStrictEqual({ ok: true, value: answers });
  });

  it("отбивает ответ на пункт, которого в версии нет", () => {
    // Иначе в снимок заполнения попадает то, чего сотруднику не показывали.
    const checked = matchAnswersToSnapshot(snapshot(item("a")), [
      { itemId: "чужой", value: true, at: AT },
    ]);

    expect(checked).toStrictEqual({ ok: false, reason: "malformed" });
  });

  it("отбивает два ответа на один пункт", () => {
    const checked = matchAnswersToSnapshot(snapshot(item("a")), [
      { itemId: "a", value: true, at: AT },
      { itemId: "a", value: false, at: AT },
    ]);

    expect(checked).toStrictEqual({ ok: false, reason: "malformed" });
  });

  it("отбивает значение не того типа, что у пункта", () => {
    expect(
      matchAnswersToSnapshot(snapshot(item("a")), [
        { itemId: "a", value: "да", at: AT },
      ]).ok,
    ).toBe(false);
    expect(
      matchAnswersToSnapshot(snapshot(item("n", { type: "number" })), [
        { itemId: "n", value: "3", at: AT },
      ]).ok,
    ).toBe(false);
    expect(
      matchAnswersToSnapshot(snapshot(item("t", { type: "text" })), [
        { itemId: "t", value: true, at: AT },
      ]).ok,
    ).toBe(false);
  });

  it("отбивает пустой список ответов: сохранять нечего", () => {
    expect(matchAnswersToSnapshot(snapshot(item("a")), [])).toStrictEqual({
      ok: false,
      reason: "empty",
    });
  });

  it("не даёт записать проваленный критичный пункт без комментария", () => {
    // Правило продукта держится сервером, а не только кнопкой в браузере:
    // запрос отправляет кто угодно, а обещание «комментарий будет» дано управляющему.
    const checked = matchAnswersToSnapshot(
      snapshot(item("c", { critical: true })),
      [{ itemId: "c", value: false, at: AT }],
    );

    expect(checked).toStrictEqual({ ok: false, reason: "comment-required" });
  });

  it("с комментарием проваленный критичный пункт проходит", () => {
    const checked = matchAnswersToSnapshot(
      snapshot(item("c", { critical: true })),
      [{ itemId: "c", value: false, comment: "вызвал техника", at: AT }],
    );

    expect(checked.ok).toBe(true);
  });

  it("частично заполненный чек-лист принимается", () => {
    // Кнопка в браузере не даёт отправить недозаполненный чек-лист, но сервер
    // отказом не отвечает: отвергнуть почти готовое заполнение значит потерять
    // работу сотрудника, а неполнота и так видна в ленте (принцип 2).
    const checked = matchAnswersToSnapshot(snapshot(item("a"), item("b")), [
      { itemId: "a", value: true, at: AT },
    ]);

    expect(checked.ok).toBe(true);
  });
});

describe("поштучные отметки времени", () => {
  const now = new Date("2026-09-06T09:10:00Z");
  const startedAt = now.getTime() - 3 * 60 * 1000;

  function answer(at: number): Answer {
    return { itemId: "a", value: true, at };
  }

  it("оставляет отметку внутри заполнения как есть", () => {
    const inside = startedAt + 60 * 1000;

    expect(clampAnswerTimes([answer(inside)], startedAt, now)[0]?.at).toBe(
      inside,
    );
  });

  it("отметку раньше начала подтягивает к началу", () => {
    // Часы планшета отстают или отметку назвали телом запроса: карточка
    // заполнения показывает эти времена управляющему, и «отмечено в 1970 году»
    // она показывать не должна.
    expect(clampAnswerTimes([answer(0)], startedAt, now)[0]?.at).toBe(startedAt);
  });

  it("отметку после отправки подтягивает к мигу приёма", () => {
    const future = now.getTime() + 60 * 60 * 1000;

    expect(clampAnswerTimes([answer(future)], startedAt, now)[0]?.at).toBe(
      now.getTime(),
    );
  });

  it("не правит пришедшие ответы на месте", () => {
    // Неизменяемость — правило проекта: наружу выходит новый объект, а тот,
    // что пришёл из тела запроса, дальше не идёт вовсе.
    const source = answer(0);

    const result = clampAnswerTimes([source], startedAt, now);

    expect(source.at).toBe(0);
    expect(result[0]).not.toBe(source);
  });
});

function withValue(value: unknown): unknown {
  return payload({ answers: [{ itemId: "t1", value, at: AT }] });
}

describe("табличный пункт: журнал в теле отправки (T141)", () => {
  const COLUMNS = [
    { id: "c1", title: { ru: "Температура", en: "Temperature" } },
    { id: "c2", title: { ru: "Вес", en: "Weight" } },
  ];

  function tableItem(): Item {
    return item("t1", { type: "table", severity: "normal", columns: COLUMNS });
  }

  it("журнал доезжает строками, а не текстом", () => {
    const parsed = parseSubmission(
      withValue([{ c1: "24", c2: "200" }, { c1: "25" }]),
    );

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.answers[0]?.value).toStrictEqual([
      { c1: "24", c2: "200" },
      { c1: "25" },
    ]);
  });

  it("пустые строки журнала до базы не доезжают", () => {
    const parsed = parseSubmission(
      withValue([{ c1: " 24 " }, {}, { c2: " " }]),
    );

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.answers[0]?.value).toStrictEqual([{ c1: "24" }]);
  });

  it("клетка не строкой — отказ разбора", () => {
    expect(parseSubmission(withValue([{ c1: 24 }])).ok).toBe(false);
  });

  it("журнал против снимка: строки принимаются", () => {
    const parsed = matchAnswersToSnapshot(snapshot(tableItem()), [
      { itemId: "t1", value: [{ c1: "24" }], at: AT },
    ]);

    expect(parsed.ok).toBe(true);
  });

  it("клетка по колонке, которой нет в снимке, — отказ", () => {
    // Снимок главный (принцип 3, D002): правка колонок задним числом не должна
    // дописывать в уже сохранённое заполнение то, чего сотрудник не видел.
    const parsed = matchAnswersToSnapshot(snapshot(tableItem()), [
      { itemId: "t1", value: [{ c9: "24" }], at: AT },
    ]);

    expect(parsed).toStrictEqual({ ok: false, reason: "malformed" });
  });

  it("текст вместо журнала — отказ: тип ответа разошёлся с типом пункта", () => {
    const parsed = matchAnswersToSnapshot(snapshot(tableItem()), [
      { itemId: "t1", value: "24", at: AT },
    ]);

    expect(parsed).toStrictEqual({ ok: false, reason: "malformed" });
  });

  it("журнал вместо «да/нет» — отказ", () => {
    const parsed = matchAnswersToSnapshot(snapshot(item("a")), [
      { itemId: "a", value: [{ c1: "24" }], at: AT },
    ]);

    expect(parsed).toStrictEqual({ ok: false, reason: "malformed" });
  });
});
