// Предел попыток привязки — единственное, что стоит между четырьмя цифрами и чужой
// станцией. Сбой здесь молчит: ограничитель, переставший ограничивать, выглядит ровно
// как работающий, и заметить это можно только специально.
//
// Счёт живёт в базе (#144), а база у прогона общая для всех файлов, идущих параллельно.
// Поэтому у каждой проверки СВОЙ бюджет — те же пределы под своим именем: общий счёт
// «на всех» иначе съедался бы соседними файлами, и тест падал бы по очереди запуска,
// а не по делу. Настоящие бюджеты проверяются тем, что свои собираются из них же.
import { randomUUID } from "node:crypto";

import { describe, expect, test, vi } from "vitest";

import {
  ISSUE_BUDGET,
  PAIR_BUDGET,
  checkIssueAllowed,
  checkPairAllowed,
  pairClientKey,
} from "./rate-limit";
import type { Budget } from "./rate-limit";

const SECOND = 1000;
const NOW = new Date();

function own(budget: Budget): Budget {
  return { ...budget, name: `${budget.name}-${randomUUID()}` };
}

function later(seconds: number): Date {
  return new Date(NOW.getTime() + seconds * SECOND);
}

async function spendPair(
  budget: Budget,
  client: string | null,
  times: number,
  at: Date = NOW,
): Promise<void> {
  for (let attempt = 0; attempt < times; attempt++) {
    await checkPairAllowed(client, at, budget);
  }
}

describe("пределы названы вслух", () => {
  test("ввод кода: 10 с клиента и 60 на всех за пять минут; выпуск: 10 на учётку", () => {
    // Числа и есть защита: ослабленный предел проходит все проверки ниже, потому что
    // они берут числа из бюджета. Здесь они прибиты.
    expect(PAIR_BUDGET.perClient).toEqual({
      maxAttempts: 10,
      windowSeconds: 300,
    });
    expect(PAIR_BUDGET.everyone).toEqual({
      maxAttempts: 60,
      windowSeconds: 300,
    });
    expect(ISSUE_BUDGET.perClient).toEqual({
      maxAttempts: 10,
      windowSeconds: 300,
    });
    expect(ISSUE_BUDGET.name).not.toBe(PAIR_BUDGET.name);
  });
});

describe("ввод кода на /pair", () => {
  test("обычный ввод проходит: человек у планшета набирает код и ошибается пару раз", async () => {
    const budget = own(PAIR_BUDGET);
    for (let attempt = 0; attempt < 3; attempt++) {
      expect((await checkPairAllowed("10.0.0.1", NOW, budget)).allowed).toBe(
        true,
      );
    }
  });

  test("одиннадцатая попытка с одного адреса отказывает и говорит, когда повторить", async () => {
    const budget = own(PAIR_BUDGET);
    await spendPair(budget, "10.0.0.2", 10);

    const verdict = await checkPairAllowed("10.0.0.2", NOW, budget);

    expect(verdict.allowed).toBe(false);
    expect(verdict.retryAfterSeconds).toBeGreaterThan(0);
    expect(verdict.retryAfterSeconds).toBeLessThanOrEqual(300);
  });

  test("выбранный бюджет одного адреса не закрывает вход соседнему", async () => {
    const budget = own(PAIR_BUDGET);
    await spendPair(budget, "10.0.0.3", 11);

    expect((await checkPairAllowed("10.0.0.4", NOW, budget)).allowed).toBe(
      true,
    );
  });

  test("ОБЩИЙ предел держит, когда клиентов различить нечем", async () => {
    // Площадка может не объявить посредника — тогда адрес неизвестен и предел на
    // клиента не применяется вовсе. Если бы держал только он, перебор ходил бы без
    // заслона: десять тысяч кодов за минуты. Держать обязан общий счёт.
    const budget = own(PAIR_BUDGET);
    for (let attempt = 0; attempt < 60; attempt++) {
      expect((await checkPairAllowed(null, NOW, budget)).allowed).toBe(true);
    }

    expect((await checkPairAllowed(null, NOW, budget)).allowed).toBe(false);
  });

  test("общий предел держит и перебор с нового адреса на каждой попытке", async () => {
    const budget = own(PAIR_BUDGET);
    for (let attempt = 0; attempt < 60; attempt++) {
      await checkPairAllowed(`198.51.100.${String(attempt)}`, NOW, budget);
    }

    expect(
      (await checkPairAllowed("198.51.100.250", NOW, budget)).allowed,
    ).toBe(false);
  });

  test("залп одновременных попыток не проходит мимо счёта", async () => {
    // Счёт занимает место и называет его одним запросом. Прочитай-потом-запиши пустил
    // бы одновременные попытки все разом: каждая прочла бы «ещё не отказ».
    const budget = own(PAIR_BUDGET);
    const verdicts = await Promise.all(
      Array.from({ length: 25 }, () =>
        checkPairAllowed("10.0.0.9", NOW, budget),
      ),
    );

    expect(verdicts.filter((verdict) => verdict.allowed)).toHaveLength(10);
  });

  test("окно истекает — попытки снова проходят, привязка не запирается навсегда", async () => {
    const budget = own(PAIR_BUDGET);
    await spendPair(budget, "10.0.0.5", 11);
    expect((await checkPairAllowed("10.0.0.5", NOW, budget)).allowed).toBe(
      false,
    );

    expect(
      (await checkPairAllowed("10.0.0.5", later(301), budget)).allowed,
    ).toBe(true);
  });

  test("залп отказов окно не продлевает: срок отказа кончается от первой попытки", async () => {
    const budget = own(PAIR_BUDGET);
    await spendPair(budget, "10.0.0.6", 11);
    await spendPair(budget, "10.0.0.6", 30, later(200));

    const verdict = await checkPairAllowed("10.0.0.6", later(250), budget);
    expect(verdict.allowed).toBe(false);
    expect(verdict.retryAfterSeconds).toBe(50);
  });
});

describe("счёт общий у всех копий приложения", () => {
  test("перезапуск процесса не снимает отказ", async () => {
    const budget = own(PAIR_BUDGET);
    await spendPair(budget, "10.0.1.1", 10);

    // Модуль поднимается заново — как поднялся бы заново процесс или вторая копия.
    vi.resetModules();
    const restarted = await import("./rate-limit");

    expect(
      (await restarted.checkPairAllowed("10.0.1.1", NOW, budget)).allowed,
    ).toBe(false);
  });

  test("вторая копия не удваивает предел: две копии делят одно окно", async () => {
    const budget = own(PAIR_BUDGET);
    vi.resetModules();
    const first = await import("./rate-limit");
    vi.resetModules();
    const second = await import("./rate-limit");

    const verdicts = [];
    for (let attempt = 0; attempt < 10; attempt++) {
      const copy = attempt % 2 === 0 ? first : second;
      verdicts.push(await copy.checkPairAllowed("10.0.1.2", NOW, budget));
    }
    expect(verdicts.every((verdict) => verdict.allowed)).toBe(true);

    expect(
      (await first.checkPairAllowed("10.0.1.2", NOW, budget)).allowed,
    ).toBe(false);
    expect(
      (await second.checkPairAllowed("10.0.1.2", NOW, budget)).allowed,
    ).toBe(false);
  });
});

describe("выпуск кода в кабинете — отдельный бюджет", () => {
  test("одиннадцатый код подряд с одной учётки отказывает, соседняя учётка выпускает", async () => {
    const budget = own(ISSUE_BUDGET);
    const account = randomUUID();
    for (let attempt = 0; attempt < 10; attempt++) {
      expect((await checkIssueAllowed(account, NOW, budget)).allowed).toBe(
        true,
      );
    }

    expect((await checkIssueAllowed(account, NOW, budget)).allowed).toBe(false);
    expect((await checkIssueAllowed(randomUUID(), NOW, budget)).allowed).toBe(
      true,
    );
  });

  test("перебор, выбравший бюджет /pair, не запирает управляющему выпуск кода", async () => {
    // Разбор #144: общий бюджет ввода выбирается кем угодно из интернета. Будь выпуск
    // на том же счёте, управляющий пришёл бы привязать планшет и не получил бы кода.
    const pair = own(PAIR_BUDGET);
    const issue: Budget = { ...ISSUE_BUDGET, name: pair.name };
    await spendPair(pair, null, 61);
    expect((await checkPairAllowed(null, NOW, pair)).allowed).toBe(false);

    expect((await checkIssueAllowed(randomUUID(), NOW, issue)).allowed).toBe(
      true,
    );
  });

  test("выбранный выпуск не трогает ввод: планшет с выданным кодом привязывается", async () => {
    const issue = own(ISSUE_BUDGET);
    const pair: Budget = { ...PAIR_BUDGET, name: issue.name };
    const account = randomUUID();
    for (let attempt = 0; attempt < 11; attempt++) {
      await checkIssueAllowed(account, NOW, issue);
    }
    expect((await checkIssueAllowed(account, NOW, issue)).allowed).toBe(false);

    expect((await checkPairAllowed(account, NOW, pair)).allowed).toBe(true);
  });
});

describe("опознание клиента", () => {
  test("без объявленного посредника клиент не опознаётся — и это не ошибка", () => {
    // Возврат `null` означает «различить нечем», и тогда работает только общий предел.
    // Выдумать здесь ключ было бы хуже отсутствия: все попытки склеились бы в одного
    // клиента, и первый же перебор закрыл бы вход всем настоящим планшетам сразу.
    expect(pairClientKey(null, {})).toBeNull();
  });
});
