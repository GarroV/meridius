import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { startRefreshClock } from "./refresh-clock";

/**
 * Поддельные часы — единственный способ проверить это поведение: самая частая
 * настоящая настройка обхода 10 минут, а граница прохода приходит раз в полчаса.
 * Сквозной сценарий столько не ждёт, поэтому дефект «часы не перевзвелись» прошлой
 * волной был найден разбором кода и остался НЕ закрытым проверкой (T138 → T191).
 */
const HALF_HOUR = 1800;
const SECOND_MS = 1000;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("startRefreshClock", () => {
  it("перевзводится, когда очередная величина совпала с предыдущей", () => {
    // Arrange: ровная сетка. После каждой границы сервер отдаёт ровно те же 1800 с —
    // ради этого случая проверка и написана: именно на нём часы замолкали после
    // первого срабатывания, и вторая просрочка не показывалась вовсе.
    const due = vi.fn();
    const stop = startRefreshClock({
      nextChangeInSeconds: () => HALF_HOUR,
      onDue: due,
    });

    // Act + Assert: три границы подряд — три похода к серверу.
    vi.advanceTimersByTime(HALF_HOUR * SECOND_MS);
    expect(due).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(HALF_HOUR * SECOND_MS);
    expect(due).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(HALF_HOUR * SECOND_MS);
    expect(due).toHaveBeenCalledTimes(3);

    stop();
  });

  it("до срока молчит", () => {
    const due = vi.fn();
    const stop = startRefreshClock({
      nextChangeInSeconds: () => HALF_HOUR,
      onDue: due,
    });

    vi.advanceTimersByTime(HALF_HOUR * SECOND_MS - 1);

    expect(due).not.toHaveBeenCalled();
    stop();
  });

  it("границы нет — часы не заводятся вовсе", () => {
    // Панель, которой уже нечего ждать, не должна дёргать сервер по кругу.
    const due = vi.fn();
    const stop = startRefreshClock({
      nextChangeInSeconds: () => null,
      onDue: due,
    });

    vi.advanceTimersByTime(24 * 60 * 60 * SECOND_MS);

    expect(due).not.toHaveBeenCalled();
    stop();
  });

  it("величина спрашивается заново перед каждым взводом", () => {
    // Сетка неровная: после первой границы до следующей ближе. Часы обязаны взять
    // свежее число, а не помнить первое, — иначе вкладка опоздает на целый проход.
    const due = vi.fn();
    const plan = [HALF_HOUR, 600, 300];
    let index = 0;
    const stop = startRefreshClock({
      nextChangeInSeconds: () => plan[index++] ?? null,
      onDue: due,
    });

    vi.advanceTimersByTime(HALF_HOUR * SECOND_MS);
    expect(due).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(599 * SECOND_MS);
    expect(due).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(SECOND_MS);
    expect(due).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(300 * SECOND_MS);
    expect(due).toHaveBeenCalledTimes(3);

    stop();
  });

  it("величина кончилась — часы останавливаются сами", () => {
    const due = vi.fn();
    const plan: (number | null)[] = [10, null];
    let index = 0;
    const stop = startRefreshClock({
      nextChangeInSeconds: () => plan[index++] ?? null,
      onDue: due,
    });

    vi.advanceTimersByTime(10 * SECOND_MS);
    expect(due).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(60 * 60 * SECOND_MS);
    expect(due).toHaveBeenCalledTimes(1);

    stop();
  });

  it("ноль не закручивает вкладку в петлю обновлений", () => {
    // Сервер отвечает «граница прямо сейчас». Без нижнего предела вкладка ходила бы
    // к нему без остановки: ответ тот же, задержка нулевая.
    const due = vi.fn();
    const stop = startRefreshClock({
      nextChangeInSeconds: () => 0,
      onDue: due,
    });

    vi.advanceTimersByTime(SECOND_MS - 1);
    expect(due).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(due).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(SECOND_MS);
    expect(due).toHaveBeenCalledTimes(2);

    stop();
  });

  it("остановка снимает ещё не сработавшие часы", () => {
    const due = vi.fn();
    const stop = startRefreshClock({
      nextChangeInSeconds: () => HALF_HOUR,
      onDue: due,
    });

    stop();
    vi.advanceTimersByTime(HALF_HOUR * SECOND_MS * 2);

    expect(due).not.toHaveBeenCalled();
  });

  it("остановка снимает и перевзведённые часы", () => {
    // Уход со страницы после первого срабатывания: брошенный таймер дёрнул бы
    // перерисовку уже снятого экрана.
    const due = vi.fn();
    const stop = startRefreshClock({
      nextChangeInSeconds: () => HALF_HOUR,
      onDue: due,
    });

    vi.advanceTimersByTime(HALF_HOUR * SECOND_MS);
    expect(due).toHaveBeenCalledTimes(1);

    stop();
    vi.advanceTimersByTime(HALF_HOUR * SECOND_MS * 3);

    expect(due).toHaveBeenCalledTimes(1);
  });

  it("считает по тем часам, которые ему дали, и снимает именно свой таймер", () => {
    // Часы среды подменяемы целиком — иначе проверку выше пришлось бы ждать по
    // настоящим полчаса. Заодно видно, что перевзвод идёт через те же часы, а не
    // через второй, свой счёт: два независимых счёта дали бы две перерисовки.
    const due = vi.fn();
    const armed: number[] = [];
    const cleared: number[] = [];
    const pending: { run: (() => void) | null } = { run: null };
    let nextId = 1;

    const stop = startRefreshClock({
      nextChangeInSeconds: () => 5,
      onDue: due,
      timers: {
        setTimer: (run, ms) => {
          const id = nextId++;
          armed.push(ms);
          pending.run = run;
          return () => {
            cleared.push(id);
          };
        },
      },
    });

    expect(armed).toEqual([5 * SECOND_MS]);
    expect(due).not.toHaveBeenCalled();

    pending.run?.();
    expect(due).toHaveBeenCalledTimes(1);
    expect(armed).toEqual([5 * SECOND_MS, 5 * SECOND_MS]);

    stop();
    expect(cleared).toEqual([2]);
  });
});
