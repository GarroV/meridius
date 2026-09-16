// Приём отметки обхода — вторая публичная точка записи, поэтому проверяется на настоящей
// базе и с той же придирчивостью, что отправка заполнения. Главное здесь — что по коду
// своей станции нельзя дотянуться до чужой и что отметку нельзя поставить задним числом.
import { beforeEach, describe, expect, test } from "vitest";

import type { Section } from "@/blocks/data";
import { getRounds, publishVersion } from "@/blocks/data";
import {
  createChecklist,
  createDraft,
  createStation,
} from "@/blocks/data/testing/fixtures";

import { forgetAllFillHits } from "./rate-limit";
import { markRound, parseRoundMark } from "./rounds";

/** 14.09.2026, 09:40 UTC — внутри окна 08:00–23:00, идёт девятичасовой обход. */
const NOW = new Date("2026-09-14T09:40:00Z");

function roundSections(label: string): Section[] {
  return [
    {
      id: `s-${label}`,
      title: { ru: "Обходы", en: "Rounds" },
      source: "own",
      items: [
        {
          id: `line-${label}`,
          title: { ru: "Линия начинения", en: "Toppings line" },
          type: "bool",
          severity: "critical",
          schedule: [{ from: "08:00", to: "12:00", everyMinutes: 60 }],
        },
        {
          id: `plain-${label}`,
          title: { ru: "Включить печь", en: "Turn on the oven" },
          type: "bool",
          severity: "critical",
        },
      ],
    },
  ];
}

interface Stand {
  code: string;
  versionId: string;
  itemId: string;
  plainItemId: string;
}

async function stand(label: string): Promise<Stand> {
  const station = await createStation();
  const checklistId = await createChecklist({
    stationId: station.stationId,
    windowStart: "08:00:00",
    windowEnd: "23:00:00",
  });
  await createDraft(checklistId, roundSections(label));
  const version = await publishVersion(checklistId);
  return {
    code: station.stationCode,
    versionId: version.id,
    itemId: `line-${label}`,
    plainItemId: `plain-${label}`,
  };
}

describe("parseRoundMark", () => {
  test("принимает исправное тело и отдаёт новый объект без посторонних полей", () => {
    const parsed = parseRoundMark({
      code: "abcdefghij",
      versionId: "11111111-2222-4333-8444-555555555555",
      itemId: "line",
      value: true,
      посторонее: "мусор",
    });

    expect(parsed).toEqual({
      ok: true,
      value: {
        code: "abcdefghij",
        versionId: "11111111-2222-4333-8444-555555555555",
        itemId: "line",
        value: true,
      },
    });
  });

  test("мусор в теле отвергается до похода в базу", () => {
    const bad: unknown[] = [
      null,
      "строка",
      [],
      { code: "abc", versionId: "не-uuid", itemId: "line", value: true },
      {
        code: "с пробелом",
        versionId: "11111111-2222-4333-8444-555555555555",
        itemId: "line",
        value: true,
      },
      {
        code: "abcdefghij",
        versionId: "11111111-2222-4333-8444-555555555555",
        itemId: "",
        value: true,
      },
      {
        code: "abcdefghij",
        versionId: "11111111-2222-4333-8444-555555555555",
        itemId: "line",
        value: { какой: "то объект" },
      },
    ];

    for (const input of bad) {
      expect(parseRoundMark(input).ok, JSON.stringify(input)).toBe(false);
    }
  });
});

describe("markRound", () => {
  beforeEach(() => {
    forgetAllFillHits();
  });

  test("отмечает обход и отвечает временем с сервера и часом, за который зачтено", async () => {
    const target = await stand("отметка");

    const outcome = await markRound(
      {
        code: target.code,
        versionId: target.versionId,
        itemId: target.itemId,
        value: true,
      },
      NOW,
    );

    expect(outcome).toEqual({
      kind: "marked",
      atLocalTime: "09:40",
      intervalLocalTime: "09:00",
    });
  });

  test("отметка видна в состоянии обходов сразу: экран показывает записанное", async () => {
    const target = await stand("видна");

    await markRound(
      {
        code: target.code,
        versionId: target.versionId,
        itemId: target.itemId,
        value: true,
      },
      NOW,
    );

    const rounds = await getRounds(target.versionId, NOW);
    expect(rounds?.items[0]?.current?.state).toBe("done");
  });

  test("по коду своей станции нельзя отметить обход на чужой", async () => {
    const mine = await stand("своя");
    const other = await stand("чужая");

    const outcome = await markRound(
      {
        code: mine.code,
        versionId: other.versionId,
        itemId: other.itemId,
        value: true,
      },
      NOW,
    );

    expect(outcome).toEqual({
      kind: "refused",
      reason: "unknown-code",
      retryAfterSeconds: 0,
    });
    // И на чужой станции ничего не появилось.
    const rounds = await getRounds(other.versionId, NOW);
    expect(rounds?.items[0]?.current?.marks).toHaveLength(0);
  });

  test("неизвестный код даёт тот же отказ, что чужая версия: перебор не различает их", async () => {
    const target = await stand("неизвестный");

    const outcome = await markRound(
      {
        code: "zzzzzzzzzz",
        versionId: target.versionId,
        itemId: target.itemId,
        value: true,
      },
      NOW,
    );

    expect(outcome).toMatchObject({
      kind: "refused",
      reason: "unknown-code",
    });
  });

  test("непериодический пункт обходом не отмечается", async () => {
    const target = await stand("непериодический");

    const outcome = await markRound(
      {
        code: target.code,
        versionId: target.versionId,
        itemId: target.plainItemId,
        value: true,
      },
      NOW,
    );

    expect(outcome).toMatchObject({ kind: "refused", reason: "no-round" });
  });

  test("вне окна чек-листа обхода не ждут", async () => {
    const target = await stand("вне окна");

    const outcome = await markRound(
      {
        code: target.code,
        versionId: target.versionId,
        itemId: target.itemId,
        value: true,
      },
      new Date("2026-09-14T23:30:00Z"),
    );

    expect(outcome).toMatchObject({ kind: "refused", reason: "no-round" });
  });

  test("когда сетка на сегодня кончилась, отметку не принимают", async () => {
    const target = await stand("сетка кончилась");

    const outcome = await markRound(
      {
        code: target.code,
        versionId: target.versionId,
        itemId: target.itemId,
        value: true,
      },
      new Date("2026-09-14T12:30:00Z"),
    );

    expect(outcome).toMatchObject({ kind: "refused", reason: "no-round" });
  });

  test("значение не того типа не проходит: «да/нет» числом не отмечают", async () => {
    const target = await stand("тип значения");

    const outcome = await markRound(
      {
        code: target.code,
        versionId: target.versionId,
        itemId: target.itemId,
        value: 42,
      },
      NOW,
    );

    expect(outcome).toMatchObject({ kind: "refused", reason: "malformed" });
  });

  test("провал критичного обхода без комментария не принимается: обещание держит сервер", async () => {
    const target = await stand("комментарий");

    const outcome = await markRound(
      {
        code: target.code,
        versionId: target.versionId,
        itemId: target.itemId,
        value: false,
      },
      NOW,
    );

    expect(outcome).toMatchObject({
      kind: "refused",
      reason: "comment-required",
    });
  });

  test("провал с комментарием принимается", async () => {
    const target = await stand("с комментарием");

    const outcome = await markRound(
      {
        code: target.code,
        versionId: target.versionId,
        itemId: target.itemId,
        value: false,
        comment: "подтаяло, переложили",
      },
      NOW,
    );

    expect(outcome).toMatchObject({ kind: "marked" });
  });

  test("повторный обход в тот же час принимается: переделали — это тоже обход", async () => {
    const target = await stand("повтор");
    const body = {
      code: target.code,
      versionId: target.versionId,
      itemId: target.itemId,
      value: true,
    };

    await markRound(body, NOW);
    const second = await markRound(body, new Date("2026-09-14T09:50:00Z"));

    expect(second).toMatchObject({ kind: "marked", atLocalTime: "09:50" });
    const rounds = await getRounds(target.versionId, NOW);
    expect(rounds?.items[0]?.current?.marks).toHaveLength(2);
  });

  test("поток отметок с одного кода упирается в предел частоты", async () => {
    const target = await stand("частота");
    const body = {
      code: target.code,
      versionId: target.versionId,
      itemId: target.itemId,
      value: true,
    };

    let refused: Awaited<ReturnType<typeof markRound>> | null = null;
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const outcome = await markRound(body, NOW);
      if (outcome.kind === "refused") {
        refused = outcome;
        break;
      }
    }

    expect(refused).toMatchObject({ kind: "refused", reason: "rate-limited" });
    expect(
      refused?.kind === "refused" ? refused.retryAfterSeconds : 0,
    ).toBeGreaterThan(0);
  });
});
