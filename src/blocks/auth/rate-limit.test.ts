// Правило отказа и проводка счёта проверяются без базы: здесь важно не то, как строки
// лежат в PostgreSQL (это проверяет `attempt-store.test.ts`), а то, какой приговор
// выносится по занятому месту и у кого место занимается.
//
// Модуль поднимается заново на каждую проверку попытки входа: в нём живёт отметка о
// последней уборке, и без свежего модуля вторая проверка судила бы по следу первой.
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { AttemptCount, AttemptKey } from "./attempt-store";
import { LOGIN_LIMITS, bucketOf, verdictFor } from "./rate-limit";

const store = vi.hoisted(() => ({
  countAttempt: vi.fn(),
  forgetAttempts: vi.fn(),
  sweepExpiredAttempts: vi.fn(),
}));

vi.mock("./attempt-store", () => store);

const CLIENT = "203.0.113.7";
const START = new Date("2026-09-06T10:00:00Z");
const SECOND = 1000;
const SMALL = { maxAttempts: 3, windowSeconds: 60 };
/** Столько корзин у клиентского счёта — то же число, что и в самом модуле. */
const BUCKETS = 10_000;

function later(seconds: number): Date {
  return new Date(START.getTime() + seconds * SECOND);
}

function count(attempts: number, startedAt = START): AttemptCount {
  return { startedAt, attempts };
}

/**
 * Что хранилище вернёт на занятие места: сначала клиентское, потом общее.
 *
 * Общего может не быть вовсе — до него доходит не всякая попытка, и это проверяется
 * отдельно.
 */
function taking(ofClient: AttemptCount, ofEveryone?: AttemptCount): void {
  store.countAttempt.mockReset();
  store.countAttempt.mockResolvedValueOnce(ofClient);
  if (ofEveryone !== undefined) {
    store.countAttempt.mockResolvedValueOnce(ofEveryone);
  }
}

/** Ключи, по которым занимали место, в порядке занятия. */
function keysAsked(): AttemptKey[] {
  return store.countAttempt.mock.calls.map((call) => call[0] as AttemptKey);
}

/**
 * Свежий модуль — как заново поднявшийся процесс. Нужен потому, что отметка о
 * последней уборке живёт в памяти модуля и переживала бы соседнюю проверку.
 */
async function freshModule(): Promise<typeof import("./rate-limit")> {
  vi.resetModules();
  return import("./rate-limit");
}

beforeEach(() => {
  vi.clearAllMocks();
  store.countAttempt.mockResolvedValue(count(1));
  store.forgetAttempts.mockResolvedValue(undefined);
  store.sweepExpiredAttempts.mockResolvedValue(undefined);
});

describe("приговор по занятому месту", () => {
  test("первая попытка проходит", () => {
    expect(verdictFor(count(1), START, SMALL)).toEqual({
      allowed: true,
      retryAfterSeconds: 0,
    });
  });

  test("попытка, попавшая ровно на предел, ещё проходит", () => {
    // Место считается вместе с текущей попыткой: при пределе в три третья — последняя
    // разрешённая. Строгое сравнение отняло бы у человека одну попытку из отмеренных.
    expect(verdictFor(count(SMALL.maxAttempts), START, SMALL).allowed).toBe(
      true,
    );
  });

  test("за пределом отказывает и говорит, через сколько можно повторить", () => {
    const verdict = verdictFor(count(SMALL.maxAttempts + 1), later(20), SMALL);

    expect(verdict.allowed).toBe(false);
    // Окно отсчитывается от первой попытки: 60 секунд минус прошедшие 20.
    expect(verdict.retryAfterSeconds).toBe(40);
  });

  test("кончившееся окно снова пускает", () => {
    expect(
      verdictFor(
        count(SMALL.maxAttempts + 1),
        later(SMALL.windowSeconds),
        SMALL,
      ).allowed,
    ).toBe(true);
  });

  test("окно не продлевается новыми попытками: срок считается от первой", () => {
    const verdict = verdictFor(count(SMALL.maxAttempts + 10), later(59), SMALL);

    expect(verdict.retryAfterSeconds).toBe(1);
  });
});

describe("кто занимает место на попытке входа", () => {
  test("место занимается в двух областях: у клиента и у всех", async () => {
    const auth = await freshModule();

    await auth.reserveLoginAttempt(CLIENT, START);

    const asked = keysAsked();
    expect(asked).toHaveLength(2);
    expect(new Set(asked.map(([scope]) => scope)).size).toBe(2);
    // Клиент опознаётся корзиной, а не адресом: адрес приходит подделываемым
    // заголовком, и строка на каждый увиденный адрес растила бы таблицу без края.
    expect(asked[0]?.[1]).toBe(bucketOf(CLIENT));
    expect(asked[0]?.[1]).not.toBe(CLIENT);
  });

  test("место занимается раньше приговора, а не после него", async () => {
    // Суть T217: попытка, которой откажут, всё равно сосчитана. Иначе решение
    // принималось бы по счёту, в котором пришедшие разом попытки друг друга не видят.
    taking(count(LOGIN_LIMITS.perClient.maxAttempts + 1));
    const auth = await freshModule();

    const verdict = await auth.reserveLoginAttempt(CLIENT, START);

    expect(verdict.allowed).toBe(false);
    expect(store.countAttempt).toHaveBeenCalled();
  });

  test("клиентский предел запирает этого клиента", async () => {
    taking(count(LOGIN_LIMITS.perClient.maxAttempts + 1));
    const auth = await freshModule();

    await expect(auth.reserveLoginAttempt(CLIENT, START)).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: LOGIN_LIMITS.perClient.windowSeconds,
    });
  });

  test("клиент за своим пределом не тратит общий счёт", async () => {
    // Иначе один стучащийся запирал бы кабинет всем подряд, просто отправляя побольше
    // запросов со своего адреса: его же отклонённые попытки съедали бы общий потолок.
    taking(count(LOGIN_LIMITS.perClient.maxAttempts + 1));
    const auth = await freshModule();

    await auth.reserveLoginAttempt(CLIENT, START);

    expect(store.countAttempt).toHaveBeenCalledTimes(1);
  });

  test("общий потолок запирает и того, кто сам не ошибался", async () => {
    taking(count(1), count(LOGIN_LIMITS.everyone.maxAttempts + 1));
    const auth = await freshModule();

    await expect(
      auth.reserveLoginAttempt(CLIENT, START),
    ).resolves.toMatchObject({
      allowed: false,
      retryAfterSeconds: LOGIN_LIMITS.everyone.windowSeconds,
    });
  });

  test("пока оба счёта под пределом, попытка проходит", async () => {
    taking(
      count(LOGIN_LIMITS.perClient.maxAttempts),
      count(LOGIN_LIMITS.everyone.maxAttempts),
    );
    const auth = await freshModule();

    await expect(
      auth.reserveLoginAttempt(CLIENT, START),
    ).resolves.toMatchObject({ allowed: true });
  });

  test("границей устаревания каждой области идёт её собственное окно", async () => {
    const auth = await freshModule();

    await auth.reserveLoginAttempt(CLIENT, START);

    const edges = store.countAttempt.mock.calls.map((call) => call[2] as Date);
    expect(edges[0]).toEqual(later(-LOGIN_LIMITS.perClient.windowSeconds));
    expect(edges[1]).toEqual(later(-LOGIN_LIMITS.everyone.windowSeconds));
  });

  test("отказ базы — отказ во входе, а не проход мимо счёта", async () => {
    // Впустить, не сумев посчитать, значит снять ограничитель ровно тогда, когда по
    // продукту стучат.
    store.countAttempt.mockReset();
    store.countAttempt.mockRejectedValue(new Error("база недоступна"));
    const auth = await freshModule();

    await expect(auth.reserveLoginAttempt(CLIENT, START)).rejects.toThrow(
      "база недоступна",
    );
  });
});

describe("уборка кончившихся окон", () => {
  test("идёт заодно с попыткой входа и метит самое длинное окно", async () => {
    const auth = await freshModule();

    await auth.reserveLoginAttempt(CLIENT, START);

    expect(store.sweepExpiredAttempts).toHaveBeenCalledWith(
      later(-LOGIN_LIMITS.everyone.windowSeconds),
    );
  });

  test("не чаще раза в минуту: залп не превращает её в работу на перебирающего", async () => {
    const auth = await freshModule();

    await auth.reserveLoginAttempt(CLIENT, START);
    await auth.reserveLoginAttempt(CLIENT, later(59));

    expect(store.sweepExpiredAttempts).toHaveBeenCalledTimes(1);
  });

  test("через минуту подметает снова", async () => {
    const auth = await freshModule();

    await auth.reserveLoginAttempt(CLIENT, START);
    await auth.reserveLoginAttempt(CLIENT, later(61));

    expect(store.sweepExpiredAttempts).toHaveBeenCalledTimes(2);
  });
});

describe("удачный вход", () => {
  test("снимает и клиентский счёт, и общий", async () => {
    const auth = await freshModule();

    await auth.forgetLoginAttempts(CLIENT);

    expect(store.forgetAttempts).toHaveBeenCalledTimes(2);
    const keys = store.forgetAttempts.mock.calls.map(
      (call) => call[0] as AttemptKey,
    );
    expect(keys.map(([, key]) => key)).toContain(bucketOf(CLIENT));
    expect(new Set(keys.map(([scope]) => scope)).size).toBe(2);
  });
});

describe("корзина клиента", () => {
  test("одна и та же у одного адреса и лежит в пределах числа корзин", () => {
    expect(bucketOf(CLIENT)).toBe(bucketOf(CLIENT));
    expect(Number(bucketOf(CLIENT))).toBeGreaterThanOrEqual(0);
    expect(Number(bucketOf(CLIENT))).toBeLessThan(BUCKETS);
  });

  test("соседние адреса расходятся по корзинам, а не ложатся рядом", () => {
    // Корзина берётся от хэша, а не от самого адреса: адреса в сети идут подряд, и
    // остаток от них посадил бы целую подсеть в одну корзину.
    const neighbours = new Set(
      Array.from({ length: 16 }, (_, last) =>
        bucketOf(`203.0.113.${String(last)}`),
      ),
    );

    expect(neighbours.size).toBeGreaterThan(8);
  });
});
