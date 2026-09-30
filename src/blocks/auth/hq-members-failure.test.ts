// Сбой базы при заведении сотрудника УК не выдаётся за «логин или почта заняты»:
// отказ с причиной УК прочла бы как свою ошибку ввода, а поломка ушла бы незамеченной.
import { randomUUID } from "node:crypto";

import { expect, test, vi } from "vitest";

import { provisionHqMember } from "./hq-members";

// Тенант, которого в базе нет: вставка упирается во внешний ключ, а не в уникальность.
vi.mock("./accounts", async (original) => ({
  ...(await original<typeof import("./accounts")>()),
  hqTenantId: () => Promise.resolve(randomUUID()),
}));

const CHEAP = { cost: 1024, blockSize: 8, parallelization: 1 } as const;

test("нарушение внешнего ключа пробрасывается, а не становится отказом", async () => {
  const tag = randomUUID().slice(0, 8);
  await expect(
    provisionHqMember({ login: `hq-${tag}`, email: `hq-${tag}@x.io` }, CHEAP),
  ).rejects.toThrow();
});
