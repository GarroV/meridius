// Поиск пиццерии по идентификатору из адреса: граница ввода. Кривой идентификатор —
// «не найдено», а не ошибка драйвера 22P02, которая уронила бы экран целиком.
import { describe, expect, test } from "vitest";

import { WHOLE_NETWORK } from "@/blocks/auth/scope";

import { findStoreInScope } from "./store-lookup";

describe("findStoreInScope", () => {
  test.each(["", "not-a-uuid", "1' or '1'='1", "9d3f6f2a-0f1e-4a8b-8c2d"])(
    "кривой идентификатор %j — null, а не ошибка базы",
    async (storeId) => {
      await expect(
        findStoreInScope(storeId, WHOLE_NETWORK),
      ).resolves.toBeNull();
    },
  );
});
