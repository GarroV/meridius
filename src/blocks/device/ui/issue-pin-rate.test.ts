// Выпуск кода в кабинете упирается в свой предел на учётку (#144) — и упирается ДО выпуска.
//
// Отказ «слишком часто», пришедший после вставки пина, выглядел бы как работающий предел,
// а в базе копились бы живые коды: каждый из них — лишнее попадание для перебора на
// `/pair`. Поэтому проверяется не только ответ, но и то, что одиннадцатого пина в базе нет.
import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

import { devicePairings, getDb } from "@/blocks/data";
import { createStation } from "@/blocks/data/testing/fixtures";

import { ISSUE_BUDGET } from "../rate-limit";
import { issuePinAction } from "./issue-pin-action";

// Учётка своя на каждый прогон: счёт живёт в общей базе прогона.
const account = vi.hoisted(() => ({ id: "" }));

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

async function pinsOf(stationId: string): Promise<number> {
  const rows = await getDb()
    .select({ id: devicePairings.id })
    .from(devicePairings)
    .where(eq(devicePairings.stationId, stationId));
  return rows.length;
}

describe("предел выпуска кода на учётку", () => {
  it("сверх предела — отказ с минутами, и пин не выпускается", async () => {
    account.id = randomUUID();
    const { stationId } = await createStation();
    const limit = ISSUE_BUDGET.perClient.maxAttempts;

    for (let attempt = 0; attempt < limit; attempt++) {
      expect((await issuePinAction(stationId)).kind).toBe("issued");
    }
    // Выпуск снимает прежний код станции: живой ровно один.
    expect(await pinsOf(stationId)).toBe(1);
    await getDb()
      .delete(devicePairings)
      .where(eq(devicePairings.stationId, stationId));

    const outcome = await issuePinAction(stationId);

    expect(outcome).toEqual({ kind: "tooOften", minutes: 5 });
    expect(await pinsOf(stationId)).toBe(0);
  });

  it("соседняя учётка выпускает, пока первая упёрлась в предел", async () => {
    account.id = randomUUID();
    const { stationId } = await createStation();
    for (
      let attempt = 0;
      attempt <= ISSUE_BUDGET.perClient.maxAttempts;
      attempt++
    ) {
      await issuePinAction(stationId);
    }
    expect((await issuePinAction(stationId)).kind).toBe("tooOften");

    account.id = randomUUID();

    expect((await issuePinAction(stationId)).kind).toBe("issued");
  });
});
