// Хранилище счёта попыток проверяется на настоящей базе: весь его смысл — SQL, который
// занимает место в счёте одним запросом и не даёт двум попыткам занять одно место.
//
// Ключи здесь у каждой проверки свои (как коды станций в тестах блока `data`): счёт
// живёт в общей базе прогона, и соседний файл не должен видеть чужие попытки.
//
// Время отсчитывается от настоящего «сейчас», а не от записанной в тесте даты, и это
// не украшение: уборка кончившихся окон ходит по ВРЕМЕНИ, а не по ключам, поэтому
// соседний файл прогона сметает всё старше пятнадцати минут. Проверка с датой из
// прошлого зеленела в одиночку и падала в общем прогоне (найдено на этом самом файле).
import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { getDb, loginAttempts } from "@/blocks/data";

import {
  ATTEMPTS_CEILING,
  countAttempt,
  fingerprintOf,
  forgetAttempts,
  sweepExpiredAttempts,
} from "./attempt-store";
import type { AttemptKey } from "./attempt-store";

const SCOPE = "проверка";
const NOW = new Date();
const MINUTE = 60 * 1000;
/** Столько попыток отправляется разом: больше, чем любой предел входа. */
const BURST = 40;

function later(minutes: number): Date {
  return new Date(NOW.getTime() + minutes * MINUTE);
}

/** Свой ключ на каждую проверку. */
function key(scope = SCOPE): AttemptKey {
  return [scope, randomUUID()];
}

/** Строка этого ключа прямо из таблицы, мимо самого хранилища. */
async function rowOf(attemptKey: AttemptKey) {
  const [row] = await getDb()
    .select()
    .from(loginAttempts)
    .where(eq(loginAttempts.attemptKey, fingerprintOf(attemptKey)));
  return row;
}

describe("занятие места в счёте", () => {
  test("первая попытка получает первый номер и открывает окно", async () => {
    const count = await countAttempt(key(), NOW, later(-15));

    expect(count).toEqual({ startedAt: NOW, attempts: 1 });
  });

  test("следующая попытка получает следующий номер, окно не сдвигается", async () => {
    const client = key();

    await countAttempt(client, NOW, later(-15));
    const second = await countAttempt(client, later(5), later(-10));

    expect(second).toEqual({ startedAt: NOW, attempts: 2 });
  });

  test("попытка после кончившегося окна открывает новое", async () => {
    const client = key();
    await countAttempt(client, NOW, later(-15));

    // Граница устаревания дошла до начала окна: прежний счёт не продолжается.
    const afterWindow = await countAttempt(client, later(15), NOW);

    expect(afterWindow).toEqual({ startedAt: later(15), attempts: 1 });
  });

  test("одновременные попытки получают разные номера", async () => {
    // Это и есть T217: приговор выносится по занятому месту, поэтому залп не может
    // получить одно и то же «ещё не отказ» на всех.
    const client = key();

    const burst = await Promise.all(
      Array.from({ length: BURST }, () => countAttempt(client, NOW, later(-15))),
    );

    const numbers = burst.map((count) => count.attempts).sort((a, b) => a - b);
    expect(numbers).toEqual(
      Array.from({ length: BURST }, (_, index) => index + 1),
    );
  });

  test("счёт не растёт выше потолка", async () => {
    const client = key();
    await countAttempt(client, NOW, later(-15));
    // Дойти до потолка настоящими попытками нельзя, поэтому строка подводится к нему
    // прямо в базе: проверяется ровно то, что дальше число не растёт.
    await getDb()
      .update(loginAttempts)
      .set({ attempts: ATTEMPTS_CEILING })
      .where(eq(loginAttempts.attemptKey, fingerprintOf(client)));

    const next = await countAttempt(client, later(1), later(-14));

    expect(next.attempts).toBe(ATTEMPTS_CEILING);
  });
});

describe("снятие и уборка", () => {
  test("счёт снимается по ключу и соседей не трогает", async () => {
    const client = key();
    const neighbour = key();
    await countAttempt(client, NOW, later(-15));
    await countAttempt(neighbour, NOW, later(-15));

    await forgetAttempts(client);

    expect(await rowOf(client)).toBeUndefined();
    expect((await rowOf(neighbour))?.attempts).toBe(1);
  });

  test("область счёта входит в ключ: клиентский и общий счёт не смешиваются", async () => {
    const shared = randomUUID();

    await countAttempt(["клиент", shared], NOW, later(-15));
    const ofEveryone = await countAttempt(["все", shared], NOW, later(-15));

    expect(ofEveryone.attempts).toBe(1);
  });

  test("кончившиеся окна сметаются, живые остаются", async () => {
    const old = key();
    const fresh = key();
    await countAttempt(old, later(-30), later(-45));
    await countAttempt(fresh, NOW, later(-15));

    // Граница уборки берётся заведомо старше живых окон соседей по прогону: уборка
    // ходит по времени и чужие строки снесла бы вместе со своими.
    await sweepExpiredAttempts(later(-20));

    expect(await rowOf(old)).toBeUndefined();
    expect(await rowOf(fresh)).toBeDefined();
  });
});

describe("что попадает в базу", () => {
  test("вместо ключа хранится его отпечаток", async () => {
    const client = key();

    await countAttempt(client, NOW, later(-15));

    // Ключ клиента приходит подделываемым заголовком и человеку принадлежит: в базе
    // продукта его быть не должно (D001).
    const stored = (
      await getDb()
        .select({ attemptKey: loginAttempts.attemptKey })
        .from(loginAttempts)
    ).map((row) => row.attemptKey);
    expect(stored).not.toContain(client[1]);
    expect(stored).toContain(fingerprintOf(client));
    expect(stored.every((value) => /^[\da-f]{64}$/.test(value))).toBe(true);
  });

  test("отпечаток у пары «область — ключ» свой", () => {
    const value = randomUUID();

    expect(fingerprintOf(["клиент", value])).not.toBe(
      fingerprintOf(["все", value]),
    );
    expect(fingerprintOf(["клиент", value])).toBe(
      fingerprintOf(["клиент", value]),
    );
  });
});
