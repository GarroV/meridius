// Слой доступа справочника стран проверяется на настоящей базе: правила
// (ru/en, пустая страна для удаления) держатся SQL и ограничением `countries_locale`,
// а не памятью процесса, и заглушкой их не проверить.
import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, describe, expect, test } from "vitest";

import { countries, stores } from "@/blocks/data";
import { closeTestDb, getTestDb } from "@/blocks/data/testing/db";
import { createStation } from "@/blocks/data/testing/fixtures";
import { WHOLE_NETWORK } from "@/blocks/auth/scope";

import {
  createCountry,
  deleteCountry,
  listCountries,
  updateCountry,
} from "./countries";

const db = getTestDb();

afterAll(closeTestDb);

/** Уникальное имя на тест: файлы тестов идут параллельно, общей очистки таблиц нет. */
function uniqueName(label: string): string {
  return `${label} ${randomUUID().slice(0, 8)}`;
}

describe("createCountry / listCountries / updateCountry / deleteCountry", () => {
  test("страна создаётся, читается списком, правится и удаляется", async () => {
    const name = uniqueName("Италия");
    const id = await createCountry({ name, locale: "ru" });

    const created = (await listCountries(WHOLE_NETWORK)).find(
      (row) => row.id === id,
    );
    expect(created?.name).toBe(name);
    expect(created?.locale).toBe("ru");

    const newName = uniqueName("Италия правленая");
    await updateCountry(id, { name: newName, locale: "en" });
    const updated = (await listCountries(WHOLE_NETWORK)).find(
      (row) => row.id === id,
    );
    expect(updated?.name).toBe(newName);
    expect(updated?.locale).toBe("en");

    await deleteCountry(id);
    expect(
      (await listCountries(WHOLE_NETWORK)).some((row) => row.id === id),
    ).toBe(false);
  });

  test("страна с пиццерией не удаляется: countryNotEmpty", async () => {
    const { countryId } = await createStation();

    await expect(deleteCountry(countryId)).rejects.toMatchObject({
      code: "countryNotEmpty",
    });
  });

  test("пустое имя не проходит ни при создании, ни при правке: nameRequired", async () => {
    await expect(
      createCountry({ name: "   ", locale: "ru" }),
    ).rejects.toMatchObject({ code: "nameRequired" });

    const id = await createCountry({
      name: uniqueName("Франция"),
      locale: "ru",
    });
    await expect(
      updateCountry(id, { name: "  ", locale: "ru" }),
    ).rejects.toMatchObject({ code: "nameRequired" });
  });

  test("неподдержанный язык не проходит, оба поддержанных доезжают до базы", async () => {
    await expect(
      createCountry({ name: uniqueName("Испания"), locale: "de" }),
    ).rejects.toMatchObject({ code: "localeNotSupported" });

    const ruId = await createCountry({
      name: uniqueName("Русь"),
      locale: "ru",
    });
    const enId = await createCountry({
      name: uniqueName("England"),
      locale: "en",
    });

    // Читаем напрямую из базы, а не через listCountries: это страховка от расхождения
    // между тем, что приняла функция, и тем, что реально легло в колонку с ограничением
    // `countries_locale` — расхождение означало бы, что значение молча подменилось.
    const [ruRow] = await db
      .select({ locale: countries.locale })
      .from(countries)
      .where(eq(countries.id, ruId));
    const [enRow] = await db
      .select({ locale: countries.locale })
      .from(countries)
      .where(eq(countries.id, enId));
    expect(ruRow?.locale).toBe("ru");
    expect(enRow?.locale).toBe("en");
  });

  test("storeCount считает пиццерии страны одним запросом, включая ноль", async () => {
    const emptyId = await createCountry({
      name: uniqueName("Пустая страна"),
      locale: "ru",
    });
    const empty = (await listCountries(WHOLE_NETWORK)).find(
      (row) => row.id === emptyId,
    );
    expect(empty?.storeCount).toBe(0);

    const withStoresId = await createCountry({
      name: uniqueName("Страна с пиццериями"),
      locale: "ru",
    });
    await db.insert(stores).values([
      {
        countryId: withStoresId,
        name: uniqueName("Пиццерия А"),
        timezone: "UTC",
      },
      {
        countryId: withStoresId,
        name: uniqueName("Пиццерия Б"),
        timezone: "UTC",
      },
    ]);
    const withStores = (await listCountries(WHOLE_NETWORK)).find(
      (row) => row.id === withStoresId,
    );
    expect(withStores?.storeCount).toBe(2);
  });

  test("несуществующий и некорректный id дают notFound, а не падение драйвера", async () => {
    await expect(
      updateCountry(randomUUID(), { name: "x", locale: "ru" }),
    ).rejects.toMatchObject({ code: "notFound" });
    await expect(deleteCountry(randomUUID())).rejects.toMatchObject({
      code: "notFound",
    });
    // "не-uuid" мимо проверки формата дошёл бы до драйвера кодом 22P02, а не notFound.
    await expect(
      updateCountry("не-uuid", { name: "x", locale: "ru" }),
    ).rejects.toMatchObject({ code: "notFound" });
    await expect(deleteCountry("не-uuid")).rejects.toMatchObject({
      code: "notFound",
    });
  });
});
