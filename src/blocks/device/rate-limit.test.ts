// Предел попыток на странице привязки — единственное, что стоит между четырьмя цифрами
// и чужой станцией. Сбой здесь молчит: ограничитель, переставший ограничивать, выглядит
// ровно как работающий, и заметить это можно только специально.
//
// Счётчики живут на уровне модуля и общие для всего файла, поэтому у каждой проверки
// своё время, отнесённое дальше окна (5 минут): иначе попытки одной проверки съедали бы
// бюджет следующей, и тест падал бы по очереди запуска, а не по делу.
import { describe, expect, test } from "vitest";

import { checkPairAllowed, pairClientKey } from "./rate-limit";

const WINDOW_SECONDS = 5 * 60;
const MILLISECONDS = 1000;

/** Время для проверки номер N: заведомо за пределом окна предыдущей. */
function slot(index: number): Date {
  return new Date(
    Date.UTC(2026, 8, 23) + index * 2 * WINDOW_SECONDS * MILLISECONDS,
  );
}

describe("предел попыток привязки", () => {
  test("обычный ввод проходит: человек у планшета набирает код и ошибается пару раз", () => {
    const now = slot(1);

    for (let attempt = 0; attempt < 3; attempt++) {
      expect(checkPairAllowed("10.0.0.1", now).allowed).toBe(true);
    }
  });

  test("одиннадцатая попытка с одного адреса отказывает и говорит, когда повторить", () => {
    const now = slot(2);
    for (let attempt = 0; attempt < 10; attempt++) {
      expect(checkPairAllowed("10.0.0.2", now).allowed).toBe(true);
    }

    const verdict = checkPairAllowed("10.0.0.2", now);

    expect(verdict.allowed).toBe(false);
    expect(verdict.retryAfterSeconds).toBeGreaterThan(0);
  });

  test("выбранный бюджет одного адреса не закрывает вход соседнему", () => {
    const now = slot(3);
    for (let attempt = 0; attempt < 11; attempt++) {
      checkPairAllowed("10.0.0.3", now);
    }

    expect(checkPairAllowed("10.0.0.4", now).allowed).toBe(true);
  });

  test("ОБЩИЙ предел держит, когда клиентов различить нечем", () => {
    // Площадка может не объявить посредника — тогда адрес неизвестен и предел на
    // клиента не применяется вовсе. Если бы держал только он, перебор ходил бы без
    // заслона: десять тысяч кодов за минуты. Держать обязан общий счёт.
    const now = slot(4);
    for (let attempt = 0; attempt < 60; attempt++) {
      expect(checkPairAllowed(null, now).allowed).toBe(true);
    }

    expect(checkPairAllowed(null, now).allowed).toBe(false);
  });

  test("окно истекает — попытки снова проходят, привязка не запирается навсегда", () => {
    const start = slot(5);
    for (let attempt = 0; attempt < 11; attempt++) {
      checkPairAllowed("10.0.0.5", start);
    }
    expect(checkPairAllowed("10.0.0.5", start).allowed).toBe(false);

    const later = new Date(
      start.getTime() + (WINDOW_SECONDS + 1) * MILLISECONDS,
    );

    expect(checkPairAllowed("10.0.0.5", later).allowed).toBe(true);
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
