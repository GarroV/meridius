// Выпуск кода в кабинете упирается в свой предел на учётку (#144) — и упирается ДО выпуска.
//
// Отказ «слишком часто», пришедший после вставки пина, выглядел бы как работающий предел,
// а в базе копились бы живые коды: каждый из них — лишнее попадание для перебора на
// `/pair`. Поэтому проверяется не только ответ, но и то, что одиннадцатый выпуск не звался.
//
// Счёт предела — настоящий, в базе прогона. Подменён только сам выпуск пина, и это не
// удобство: выпуск чистит истёкшие пины ВСЕХ станций по своему «сейчас», а соседние файлы
// (`pairing.test.ts`, `pair.test.ts`, `pairing-failures.test.ts`) живут каждый со своим
// мигом. Настоящий выпуск отсюда сметал их пины посреди проверки при любом выборе часов:
// по настоящим — пины `pairing.test.ts`, по прошлым — наоборот, соседи сметали эти.
// Выпуск как таковой проверяет `pairing.test.ts`, здесь — порядок «частота, потом выпуск».
import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { ISSUE_BUDGET } from "../rate-limit";
import { issuePinAction } from "./issue-pin-action";

// Учётка своя на каждую проверку: счёт живёт в общей базе прогона.
const account = vi.hoisted(() => ({ id: "" }));

const issued = vi.hoisted(() => ({ calls: 0 }));

vi.mock("@/blocks/auth/guard", () => ({
  requireAdmin: vi.fn(() =>
    Promise.resolve({
      accountId: account.id,
      login: "manager",
      tenantId: "00000000-0000-4000-8000-000000000000",
      tenantKind: "hq",
      tenantName: "УК",
      countryIds: [],
    }),
  ),
}));

vi.mock("../pairing", () => ({
  issuePairingPin: vi.fn((_stationId: string, now: Date) => {
    issued.calls += 1;
    return Promise.resolve({
      code: "1234",
      expiresAt: new Date(now.getTime() + 5 * 60 * 1000),
    });
  }),
}));

const LIMIT = ISSUE_BUDGET.perClient.maxAttempts;

beforeEach(() => {
  account.id = randomUUID();
  issued.calls = 0;
});

describe("предел выпуска кода на учётку", () => {
  it("сверх предела — отказ с минутами, и выпуск не зовётся", async () => {
    const stationId = randomUUID();
    for (let attempt = 0; attempt < LIMIT; attempt++) {
      expect((await issuePinAction(stationId)).kind).toBe("issued");
    }
    expect(issued.calls).toBe(LIMIT);

    const outcome = await issuePinAction(stationId);

    expect(outcome).toEqual({ kind: "tooOften", minutes: 5 });
    expect(issued.calls).toBe(LIMIT);
  });

  it("соседняя учётка выпускает, пока первая упёрлась в предел", async () => {
    const stationId = randomUUID();
    for (let attempt = 0; attempt <= LIMIT; attempt++) {
      await issuePinAction(stationId);
    }
    expect((await issuePinAction(stationId)).kind).toBe("tooOften");

    account.id = randomUUID();

    expect((await issuePinAction(stationId)).kind).toBe("issued");
  });
});
