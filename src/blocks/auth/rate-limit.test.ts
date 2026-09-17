// Правило отказа и проводка счёта проверяются без базы: здесь важно не то, как строки
// лежат в PostgreSQL (это проверяет `attempt-store.test.ts`), а то, какой приговор
// выносится по записанному окну и кому неудача засчитывается.
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { FailureWindow } from "./attempt-store";
import {
  LOGIN_LIMITS,
  checkLoginAllowed,
  forgetLoginFailures,
  registerLoginFailure,
  verdictFor,
} from "./rate-limit";

const store = vi.hoisted(() => ({
  readFailureWindows: vi.fn(),
  countFailure: vi.fn(),
  forgetFailures: vi.fn(),
  sweepExpiredFailures: vi.fn(),
  forgetAllFailures: vi.fn(),
}));

vi.mock("./attempt-store", () => store);

const CLIENT = "203.0.113.7";
const START = new Date("2026-09-06T10:00:00Z");
const SECOND = 1000;
const SMALL = { maxFailures: 3, windowSeconds: 60 };

function later(seconds: number): Date {
  return new Date(START.getTime() + seconds * SECOND);
}

function window(failures: number, startedAt = START): FailureWindow {
  return { startedAt, failures };
}

/** Что хранилище отдаст на следующий вопрос: окно клиента и окно общего счёта. */
function stored(
  ofClient: FailureWindow | undefined,
  ofEveryone: FailureWindow | undefined,
): void {
  store.readFailureWindows.mockResolvedValue([ofClient, ofEveryone]);
}

beforeEach(() => {
  vi.clearAllMocks();
  store.readFailureWindows.mockResolvedValue([undefined, undefined]);
  store.countFailure.mockResolvedValue(undefined);
  store.forgetFailures.mockResolvedValue(undefined);
  store.sweepExpiredFailures.mockResolvedValue(undefined);
});

describe("приговор по окну", () => {
  test("окна нет — попытка проходит", () => {
    expect(verdictFor(undefined, START, SMALL)).toEqual({
      allowed: true,
      retryAfterSeconds: 0,
    });
  });

  test("до предела попытки проходят", () => {
    expect(
      verdictFor(window(SMALL.maxFailures - 1), START, SMALL).allowed,
    ).toBe(true);
  });

  test("на пределе отказывает и говорит, через сколько можно повторить", () => {
    const verdict = verdictFor(window(SMALL.maxFailures), later(20), SMALL);

    expect(verdict.allowed).toBe(false);
    // Окно отсчитывается от первой неудачи: 60 секунд минус прошедшие 20.
    expect(verdict.retryAfterSeconds).toBe(40);
  });

  test("кончившееся окно снова пускает", () => {
    expect(
      verdictFor(window(SMALL.maxFailures), later(SMALL.windowSeconds), SMALL)
        .allowed,
    ).toBe(true);
  });

  test("окно не продлевается новыми неудачами: срок считается от первой", () => {
    const verdict = verdictFor(
      window(SMALL.maxFailures + 10),
      later(59),
      SMALL,
    );

    expect(verdict.retryAfterSeconds).toBe(1);
  });
});

describe("кого спрашивают на попытке входа", () => {
  test("клиентский предел запирает этого клиента", async () => {
    stored(window(LOGIN_LIMITS.perClient.maxFailures), undefined);

    await expect(checkLoginAllowed(CLIENT, START)).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: LOGIN_LIMITS.perClient.windowSeconds,
    });
  });

  test("общий потолок запирает и того, кто сам не ошибался", async () => {
    stored(undefined, window(LOGIN_LIMITS.everyone.maxFailures));

    await expect(checkLoginAllowed(CLIENT, START)).resolves.toMatchObject({
      allowed: false,
    });
  });

  test("отказ называет больший из двух сроков", async () => {
    stored(
      window(LOGIN_LIMITS.perClient.maxFailures, later(-60)),
      window(LOGIN_LIMITS.everyone.maxFailures),
    );

    const verdict = await checkLoginAllowed(CLIENT, START);

    // Общий счёт начался позже, значит и кончится позже — ждать столько.
    expect(verdict.retryAfterSeconds).toBe(LOGIN_LIMITS.everyone.windowSeconds);
  });

  test("пока оба счёта под пределом, попытка проходит", async () => {
    stored(
      window(LOGIN_LIMITS.perClient.maxFailures - 1),
      window(LOGIN_LIMITS.everyone.maxFailures - 1),
    );

    await expect(checkLoginAllowed(CLIENT, START)).resolves.toMatchObject({
      allowed: true,
    });
  });

  test("спрашиваются ровно две области: клиент и все", async () => {
    await checkLoginAllowed(CLIENT, START);

    const asked = store.readFailureWindows.mock.calls[0]?.[0] as [
      string,
      string,
    ][];
    expect(asked).toHaveLength(2);
    expect(new Set(asked.map(([scope]) => scope)).size).toBe(2);
    // Клиентский счёт спрашивается по ключу клиента, общий — нет: он адресов не
    // различает, иначе подделанный заголовок обходил бы и его.
    expect(asked.filter(([, key]) => key === CLIENT)).toHaveLength(1);
  });
});

describe("неудача", () => {
  test("считается и клиенту, и всем сразу", async () => {
    await registerLoginFailure(CLIENT, START);

    expect(store.countFailure).toHaveBeenCalledTimes(2);
    const keys = store.countFailure.mock.calls.map((call) => call[1] as string);
    expect(keys).toContain(CLIENT);
    expect(new Set(keys).size).toBe(2);
  });

  test("границей устаревания идёт начало окна, а не момент попытки", async () => {
    await registerLoginFailure(CLIENT, START);

    for (const call of store.countFailure.mock.calls) {
      expect(call[3]).toEqual(later(-LOGIN_LIMITS.perClient.windowSeconds));
    }
  });

  test("заодно сметает кончившиеся окна: хранилище не растёт", async () => {
    await registerLoginFailure(CLIENT, START);

    expect(store.sweepExpiredFailures).toHaveBeenCalledWith(
      later(-LOGIN_LIMITS.everyone.windowSeconds),
    );
  });
});

describe("удачный вход", () => {
  test("снимает и клиентский счёт, и общий", async () => {
    await forgetLoginFailures(CLIENT);

    expect(store.forgetFailures).toHaveBeenCalledTimes(2);
    const keys = store.forgetFailures.mock.calls.map(
      (call) => call[1] as string,
    );
    expect(keys).toContain(CLIENT);
    expect(new Set(keys).size).toBe(2);
  });
});
