// Столкновение кода станции при выдаче (T350). Код — единственное, что стоит между
// наклейкой и чужой станцией: два одинаковых кода открывали бы по одной наклейке две
// кухни, и держит это ограничение уникальности в базе плюс повтор с новым кодом здесь.
// Генератор подменён, чтобы столкновение было условием теста, а не случайностью;
// база настоящая.
import { eq } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, test, vi } from "vitest";

import { getDb, stations } from "@/blocks/data";
import { closeTestDb } from "@/blocks/data/testing/db";
import {
  createStation as createStationFixture,
  uniqueStationCode,
} from "@/blocks/data/testing/fixtures";

import { generateStationCode } from "./station-code";
import { createStation, reissueStationCode } from "./stations";

vi.mock("./station-code", async (importOriginal) => {
  const original = await importOriginal<typeof import("./station-code")>();
  return {
    ...original,
    generateStationCode: vi.fn(original.generateStationCode),
  };
});

const generate = vi.mocked(generateStationCode);

afterEach(() => {
  generate.mockReset();
});

afterAll(closeTestDb);

async function codeOf(id: string): Promise<string | undefined> {
  const [row] = await getDb()
    .select({ code: stations.code })
    .from(stations)
    .where(eq(stations.id, id));
  return row?.code;
}

describe("столкновение кода станции", () => {
  test("занятый код не выдаётся второй станции: выдача берёт следующий", async () => {
    const holder = await createStationFixture();
    const fresh = uniqueStationCode();
    generate.mockReturnValueOnce(holder.stationCode).mockReturnValueOnce(fresh);

    const created = await createStation({
      storeId: holder.storeId,
      name: "Вторая кухня",
    });

    expect(created.code).toBe(fresh);
    expect(await codeOf(holder.stationId)).toBe(holder.stationCode);
  });

  test("перевыпуск тоже не отдаёт чужой код", async () => {
    const holder = await createStationFixture();
    const other = await createStationFixture();
    const fresh = uniqueStationCode();
    generate.mockReturnValueOnce(holder.stationCode).mockReturnValueOnce(fresh);

    const reissued = await reissueStationCode(other.stationId);

    expect(reissued.code).toBe(fresh);
    expect(await codeOf(holder.stationId)).toBe(holder.stationCode);
  });

  test("все попытки заняты — понятный отказ codeCollision, а не чужой код", async () => {
    const holder = await createStationFixture();
    generate.mockReturnValue(holder.stationCode);

    await expect(
      createStation({ storeId: holder.storeId, name: "Третья кухня" }),
    ).rejects.toMatchObject({ code: "codeCollision" });
  });
});
