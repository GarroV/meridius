// Город и код точки в слое справочника (#141): запись, чтение и отказ на занятом коде.
//
// Главное обещание — правка пиццерии, которая про код и город ничего не знает (форма
// экрана, сид), их не стирает: иначе первая же правка названия на экране отвязала бы
// пиццерию от справочника сети, и следующий импорт завёл бы её дублем.
import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, test } from "vitest";

import { closeTestDb } from "@/blocks/data/testing/db";

import { createCountry } from "./countries";
import { createStore, listStores, updateStore } from "./stores";

afterAll(closeTestDb);

function uniqueName(label: string): string {
  return `${label} ${randomUUID().slice(0, 8)}`;
}

function uniqueCode(): string {
  return `P-${randomUUID().slice(0, 8)}`;
}

async function newCountry(): Promise<string> {
  return createCountry({ name: uniqueName("Страна"), locale: "ru" });
}

async function readStore(countryId: string, storeId: string) {
  const row = (await listStores(countryId)).find((item) => item.id === storeId);
  if (row === undefined) throw new Error(`Пиццерия ${storeId} не читается`);
  return row;
}

describe("город и код точки", () => {
  test("заведённые город и код читаются списком страны, без них — пусто", async () => {
    const countryId = await newCountry();
    const code = uniqueCode();
    const withBoth = await createStore({
      countryId,
      name: "Bemowo",
      timezone: "Europe/Warsaw",
      city: "Warsaw",
      code,
    });
    const plain = await createStore({
      countryId,
      name: uniqueName("Пиццерия"),
      timezone: "UTC",
    });

    expect(await readStore(countryId, withBoth)).toMatchObject({
      name: "Bemowo",
      city: "Warsaw",
      code,
    });
    expect(await readStore(countryId, plain)).toMatchObject({
      city: null,
      code: null,
    });
  });

  test("пробелы по краям срезаются, пустое значение хранится как отсутствие", async () => {
    const countryId = await newCountry();
    const code = uniqueCode();
    const storeId = await createStore({
      countryId,
      name: uniqueName("Пиццерия"),
      timezone: "UTC",
      city: "  Warsaw ",
      code: ` ${code} `,
    });
    expect(await readStore(countryId, storeId)).toMatchObject({
      city: "Warsaw",
      code,
    });

    await updateStore(storeId, {
      name: uniqueName("Пиццерия"),
      timezone: "UTC",
      city: "   ",
      code: "",
    });
    expect(await readStore(countryId, storeId)).toMatchObject({
      city: null,
      code: null,
    });
  });

  test("правка без города и кода их не стирает", async () => {
    const countryId = await newCountry();
    const code = uniqueCode();
    const storeId = await createStore({
      countryId,
      name: uniqueName("Пиццерия"),
      timezone: "UTC",
      city: "Tbilisi",
      code,
    });

    const renamed = uniqueName("Переименована");
    await updateStore(storeId, { name: renamed, timezone: "Asia/Tbilisi" });

    expect(await readStore(countryId, storeId)).toMatchObject({
      name: renamed,
      city: "Tbilisi",
      code,
    });
  });

  test("занятый в стране код не проходит ни при создании, ни при правке: storeCodeTaken", async () => {
    const countryId = await newCountry();
    const code = uniqueCode();
    await createStore({
      countryId,
      name: uniqueName("Первая"),
      timezone: "UTC",
      code,
    });

    const secondName = uniqueName("Вторая");
    await expect(
      createStore({ countryId, name: secondName, timezone: "UTC", code }),
    ).rejects.toMatchObject({ code: "storeCodeTaken" });
    expect(
      (await listStores(countryId)).some((row) => row.name === secondName),
    ).toBe(false);

    const other = await createStore({
      countryId,
      name: uniqueName("Третья"),
      timezone: "UTC",
    });
    await expect(
      updateStore(other, { name: uniqueName("Третья"), timezone: "UTC", code }),
    ).rejects.toMatchObject({ code: "storeCodeTaken" });
    expect((await readStore(countryId, other)).code).toBeNull();
  });

  test("тот же код в другой стране свободен", async () => {
    const code = uniqueCode();
    await createStore({
      countryId: await newCountry(),
      name: uniqueName("Пиццерия"),
      timezone: "UTC",
      code,
    });
    const countryId = await newCountry();
    const storeId = await createStore({
      countryId,
      name: uniqueName("Пиццерия"),
      timezone: "UTC",
      code,
    });
    expect((await readStore(countryId, storeId)).code).toBe(code);
  });
});
