// Вставка, не вернувшая строки, — поломка, а не «сотрудник заведён»: успех без учётки
// УК прочла бы как сделанное, а войти было бы нечем.
import { expect, test, vi } from "vitest";

import { provisionHqMember } from "./hq-members";

vi.mock("./accounts", async (original) => ({
  ...(await original<typeof import("./accounts")>()),
  hqTenantId: () => Promise.resolve("9d3f6f2a-0f1e-4a8b-8c2d-1f2b3c4d5e6f"),
}));

vi.mock("@/blocks/data", async (original) => ({
  ...(await original<typeof import("@/blocks/data")>()),
  getDb: () => ({
    insert: () => ({
      values: () => ({ returning: () => Promise.resolve([]) }),
    }),
  }),
}));

const CHEAP = { cost: 1024, blockSize: 8, parallelization: 1 } as const;

test("пустой ответ вставки — исключение, а не успех", async () => {
  await expect(
    provisionHqMember({ login: "hq-empty", email: "hq-empty@x.io" }, CHEAP),
  ).rejects.toThrow("учётка не вставилась");
});
