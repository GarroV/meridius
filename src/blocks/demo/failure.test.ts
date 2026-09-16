// Отказ сида читает человек, запустивший `./scripts/up` перед показом, а не тот, кто
// писал сид. Поэтому проверяется именно то, что он увидит в консоли.
import { describe, expect, test } from "vitest";

import { DemoSeedError, describeSeedFailure } from "./failure";

describe("описание отказа сида", () => {
  test("свой отказ печатается как есть: он уже знает и помеху, и что делать", () => {
    const text = describeSeedFailure(
      new DemoSeedError("Контур не снять: держит заполнение 42"),
    );

    expect(text).toBe("Контур не снять: держит заполнение 42");
  });

  test("ошибку базы разворачивает из обёртки драйвера и называет правило", () => {
    // Drizzle заворачивает ошибку `pg` в свою: настоящая лежит в `cause`.
    const driver = Object.assign(
      new Error(
        'update or delete on table "stores" violates foreign key constraint',
      ),
      {
        code: "23503",
        detail: 'Key (id)=(d100) is still referenced from table "stations".',
        constraint: "stations_store_id_stores_id_fk",
      },
    );
    const wrapped = new Error("Failed query: delete from stores", {
      cause: driver,
    });

    const text = describeSeedFailure(wrapped);

    expect(text).toContain("Демонстрационный контур не заведён.");
    expect(text).toContain("violates foreign key constraint");
    expect(text).toContain("is still referenced from table");
    expect(text).toContain("stations_store_id_stores_id_fk");
  });

  test("ошибку Node за код PostgreSQL не принимает", () => {
    // У `ENOENT` поле `code` тоже есть, и разбирать его как SQLSTATE значило бы
    // сочинять подробности базы там, где базы не было вовсе.
    const text = describeSeedFailure(
      Object.assign(new Error("нет файла .env"), { code: "ENOENT" }),
    );

    expect(text).toContain("нет файла .env");
    expect(text).not.toContain("База отказала");
  });

  test("не-ошибку приводит к тексту, а не роняет разбор", () => {
    expect(describeSeedFailure("просто строка")).toContain("просто строка");
  });
});
