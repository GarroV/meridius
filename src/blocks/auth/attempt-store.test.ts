// Хранилище счёта попыток проверяется на настоящей базе: весь его смысл — SQL,
// который считает неудачи одним запросом и не даёт двум попыткам посчитаться как одна.
//
// Ключи здесь у каждой проверки свои (как коды станций в тестах блока `data`): счёт
// живёт в общей базе прогона, и соседний файл не должен видеть чужие неудачи.
import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { getDb, loginFailures } from "@/blocks/data";

import {
  countFailure,
  forgetFailures,
  readFailureWindows,
  sweepExpiredFailures,
} from "./attempt-store";

const SCOPE = "проверка";
// Время отсчитывается от настоящего «сейчас», а не от записанной в тесте даты, и это
// не украшение: уборка кончившихся окон ходит по ВРЕМЕНИ, а не по ключам, поэтому
// соседний файл прогона, засчитывая свою неудачу, сметает всё старше пятнадцати минут.
// Проверка с датой из прошлого зеленела в одиночку и падала в общем прогоне (найдено
// на этом самом файле).
const NOW = new Date();
const MINUTE = 60 * 1000;

function later(minutes: number): Date {
  return new Date(NOW.getTime() + minutes * MINUTE);
}

/** Своя строка на каждую проверку. */
function key(): string {
  return `203.0.113.7-${randomUUID()}`;
}

async function windowOf(client: string) {
  const [window] = await readFailureWindows([[SCOPE, client]]);
  return window;
}

describe("счёт неудач", () => {
  test("неизвестный ключ окна не имеет", async () => {
    expect(await windowOf(key())).toBeUndefined();
  });

  test("неудачи копятся, а окно остаётся тем, что открыла первая", async () => {
    const client = key();

    await countFailure(SCOPE, client, NOW, later(-15));
    await countFailure(SCOPE, client, later(5), later(-10));

    expect(await windowOf(client)).toEqual({ startedAt: NOW, failures: 2 });
  });

  test("неудача после кончившегося окна открывает новое", async () => {
    const client = key();
    await countFailure(SCOPE, client, NOW, later(-15));

    // Граница устаревания дошла до начала окна: прежний счёт не продолжается.
    await countFailure(SCOPE, client, later(15), NOW);

    expect(await windowOf(client)).toEqual({
      startedAt: later(15),
      failures: 1,
    });
  });

  test("счёт снимается по ключу и соседей не трогает", async () => {
    const client = key();
    const neighbour = key();
    await countFailure(SCOPE, client, NOW, later(-15));
    await countFailure(SCOPE, neighbour, NOW, later(-15));

    await forgetFailures(SCOPE, client);

    expect(await windowOf(client)).toBeUndefined();
    expect(await windowOf(neighbour)).toEqual({ startedAt: NOW, failures: 1 });
  });

  test("область счёта входит в ключ: у клиента и у общего счёта строки разные", async () => {
    const client = key();

    await countFailure("клиент", client, NOW, later(-15));
    await countFailure("все", client, NOW, later(-15));
    await forgetFailures("клиент", client);

    const [ofClient, ofEveryone] = await readFailureWindows([
      ["клиент", client],
      ["все", client],
    ]);
    expect(ofClient).toBeUndefined();
    expect(ofEveryone).toEqual({ startedAt: NOW, failures: 1 });
  });

  test("кончившиеся окна сметаются, живые остаются", async () => {
    const old = key();
    const fresh = key();
    await countFailure(SCOPE, old, later(-30), later(-45));
    await countFailure(SCOPE, fresh, NOW, later(-15));

    // Граница уборки берётся заведомо старше живых окон соседей по прогону: уборка
    // ходит по времени и чужие строки снесла бы вместе со своими.
    await sweepExpiredFailures(later(-20));

    expect(await windowOf(old)).toBeUndefined();
    expect(await windowOf(fresh)).toBeDefined();
  });
});

describe("что попадает в базу", () => {
  test("вместо ключа клиента хранится его отпечаток", async () => {
    const client = key();

    await countFailure(SCOPE, client, NOW, later(-15));

    // Адрес клиента приходит подделываемым заголовком и человеку принадлежит:
    // в базе продукта его быть не должно (D001).
    const rows = await getDb()
      .select({ attemptKey: loginFailures.attemptKey })
      .from(loginFailures);
    const stored = rows.map((row) => row.attemptKey);
    expect(stored).not.toContain(client);
    expect(stored.every((value) => /^[\da-f]{64}$/.test(value))).toBe(true);
  });

  test("отпечаток у одного и того же ключа один и тот же", async () => {
    const client = key();

    await countFailure(SCOPE, client, NOW, later(-15));
    await countFailure(SCOPE, client, later(1), later(-14));

    const print = await getDb()
      .select({ failures: loginFailures.failures })
      .from(loginFailures)
      .where(eq(loginFailures.failures, 2));
    expect(print.length).toBeGreaterThan(0);
  });
});
