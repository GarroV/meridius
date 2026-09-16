// Слой доступа справочника пиццерий проверяется на настоящей базе: главное правило
// задачи — атомарное удаление пиццерии со станциями и запрет по истории заполнений —
// держится транзакцией и внешним ключом `on delete restrict`, заглушкой это не проверить.
import { randomUUID } from "node:crypto";

import { count, eq } from "drizzle-orm";
import { afterAll, describe, expect, test } from "vitest";

import type { Answer } from "@/blocks/data";
import {
  checks,
  saveSubmission,
  setShiftMode,
  stations,
  storeShiftModes,
  stores,
  submissions,
} from "@/blocks/data";
import { closeTestDb, getTestDb } from "@/blocks/data/testing/db";
import {
  createChecklist,
  createPublishedVersion,
  createStation,
  sampleSections,
  uniqueStationCode,
} from "@/blocks/data/testing/fixtures";

import { createCountry } from "./countries";
import {
  countStationsOfStore,
  createStore,
  deleteStore,
  listStores,
  updateStore,
} from "./stores";

const db = getTestDb();

afterAll(closeTestDb);

/** Уникальное имя на тест: файлы тестов идут параллельно, общей очистки таблиц нет. */
function uniqueName(label: string): string {
  return `${label} ${randomUUID().slice(0, 8)}`;
}

function boolAnswer(itemId: string, value: boolean): Answer {
  return { itemId, value, at: Date.now() };
}

async function stationExists(stationId: string): Promise<boolean> {
  const rows = await db
    .select({ id: stations.id })
    .from(stations)
    .where(eq(stations.id, stationId));
  return rows.length > 0;
}

async function storeExists(storeId: string): Promise<boolean> {
  const rows = await db
    .select({ id: stores.id })
    .from(stores)
    .where(eq(stores.id, storeId));
  return rows.length > 0;
}

/** Сколько строк режима смены осталось у пиццерии: настройка, которую снимает удаление. */
async function shiftModeCount(storeId: string): Promise<number> {
  const rows = await db
    .select({ modeCount: count(storeShiftModes.id) })
    .from(storeShiftModes)
    .where(eq(storeShiftModes.storeId, storeId));
  return rows[0]?.modeCount ?? 0;
}

/**
 * Сколько заполнений у станций пиццерии. Нужен именно ноль: проверка запрета, зелёная
 * на базе с историей, ничего не доказывает — отказать могла история, а не то, что проверяют.
 */
async function submissionCountOfStore(storeId: string): Promise<number> {
  const rows = await db
    .select({ submissionCount: count(submissions.id) })
    .from(submissions)
    .innerJoin(stations, eq(submissions.stationId, stations.id))
    .where(eq(stations.storeId, storeId));
  return rows[0]?.submissionCount ?? 0;
}

describe("createStore / listStores / updateStore / countStationsOfStore", () => {
  test("пиццерия создаётся, правится, читается списком своей страны и не попадает в список чужой", async () => {
    const countryA = await createCountry({
      name: uniqueName("Страна A"),
      locale: "ru",
    });
    const countryB = await createCountry({
      name: uniqueName("Страна B"),
      locale: "ru",
    });
    const name = uniqueName("Пиццерия");
    const storeId = await createStore({
      countryId: countryA,
      name,
      timezone: "Europe/Moscow",
    });

    const listA = await listStores(countryA);
    expect(listA.some((row) => row.id === storeId && row.name === name)).toBe(
      true,
    );
    const listB = await listStores(countryB);
    expect(listB.some((row) => row.id === storeId)).toBe(false);

    const newName = uniqueName("Пиццерия правленая");
    await updateStore(storeId, { name: newName, timezone: "Asia/Almaty" });
    const updated = (await listStores(countryA)).find(
      (row) => row.id === storeId,
    );
    expect(updated?.name).toBe(newName);
    expect(updated?.timezone).toBe("Asia/Almaty");
  });

  test("stationCount считает станции пиццерии одним запросом, включая ноль", async () => {
    const countryId = await createCountry({
      name: uniqueName("Страна станций"),
      locale: "ru",
    });
    const storeId = await createStore({
      countryId,
      name: uniqueName("Пиццерия без станций"),
      timezone: "UTC",
    });

    expect(await countStationsOfStore(storeId)).toBe(0);
    const empty = (await listStores(countryId)).find(
      (row) => row.id === storeId,
    );
    expect(empty?.stationCount).toBe(0);

    await db.insert(stations).values([
      { storeId, name: uniqueName("Станция 1"), code: uniqueStationCode() },
      { storeId, name: uniqueName("Станция 2"), code: uniqueStationCode() },
    ]);

    expect(await countStationsOfStore(storeId)).toBe(2);
    const withStations = (await listStores(countryId)).find(
      (row) => row.id === storeId,
    );
    expect(withStations?.stationCount).toBe(2);
  });

  test("пустое имя не проходит ни при создании, ни при правке: nameRequired", async () => {
    const countryId = await createCountry({
      name: uniqueName("Страна имени"),
      locale: "ru",
    });

    await expect(
      createStore({ countryId, name: "   ", timezone: "UTC" }),
    ).rejects.toMatchObject({ code: "nameRequired" });

    const storeId = await createStore({
      countryId,
      name: uniqueName("Пиццерия"),
      timezone: "UTC",
    });
    await expect(
      updateStore(storeId, { name: "", timezone: "UTC" }),
    ).rejects.toMatchObject({ code: "nameRequired" });
  });

  test("пустой часовой пояс не проходит: unknownTimezone", async () => {
    const countryId = await createCountry({
      name: uniqueName("Страна пояса"),
      locale: "ru",
    });

    await expect(
      createStore({ countryId, name: uniqueName("Пиццерия"), timezone: "" }),
    ).rejects.toMatchObject({ code: "unknownTimezone" });

    const storeId = await createStore({
      countryId,
      name: uniqueName("Пиццерия"),
      timezone: "UTC",
    });
    await expect(
      updateStore(storeId, { name: uniqueName("Пиццерия"), timezone: "" }),
    ).rejects.toMatchObject({ code: "unknownTimezone" });
  });

  test("несуществующие и некорректные id дают notFound, а не падение драйвера", async () => {
    await expect(
      createStore({
        countryId: randomUUID(),
        name: uniqueName("Без страны"),
        timezone: "UTC",
      }),
    ).rejects.toMatchObject({ code: "notFound" });
    await expect(
      createStore({
        countryId: "не-uuid",
        name: uniqueName("Без страны"),
        timezone: "UTC",
      }),
    ).rejects.toMatchObject({ code: "notFound" });

    await expect(
      updateStore(randomUUID(), { name: "x", timezone: "UTC" }),
    ).rejects.toMatchObject({ code: "notFound" });
    await expect(
      updateStore("не-uuid", { name: "x", timezone: "UTC" }),
    ).rejects.toMatchObject({ code: "notFound" });
    await expect(
      deleteStore(randomUUID(), { confirmed: true }),
    ).rejects.toMatchObject({ code: "notFound" });

    expect(await countStationsOfStore(randomUUID())).toBe(0);
    expect(await countStationsOfStore("не-uuid")).toBe(0);
  });
});

describe("deleteStore", () => {
  test("пиццерия без станций удаляется и без confirmed: подтверждать нечего", async () => {
    const countryId = await createCountry({
      name: uniqueName("Страна пустой пиццерии"),
      locale: "ru",
    });
    const storeId = await createStore({
      countryId,
      name: uniqueName("Пустая пиццерия"),
      timezone: "UTC",
    });

    await deleteStore(storeId, { confirmed: false });

    expect(await storeExists(storeId)).toBe(false);
  });

  test("пиццерия со станциями без подтверждения не удаляется: confirmationRequired, станции на месте", async () => {
    const station = await createStation();

    await expect(
      deleteStore(station.storeId, { confirmed: false }),
    ).rejects.toMatchObject({ code: "confirmationRequired" });

    expect(await storeExists(station.storeId)).toBe(true);
    expect(await stationExists(station.stationId)).toBe(true);
  });

  test("пиццерия со станциями с подтверждением удаляется вместе со станциями", async () => {
    const station = await createStation();

    await deleteStore(station.storeId, { confirmed: true });

    expect(await storeExists(station.storeId)).toBe(false);
    expect(await stationExists(station.stationId)).toBe(false);
  });

  test("пиццерия, на станцию которой ссылается заполнение, не удаляется даже с подтверждением: referencedByHistory, откат целиком", async () => {
    // У пиццерии — две станции: одна попадёт в историю заполнением, другая свободна.
    // Так видно, что откат именно транзакционный: без него удаление партиями снесло бы
    // свободную станцию первой и оставило только заблокированную историей — это и есть
    // «висячая» частичная зачистка, которую запрещает задача.
    const station = await createStation();
    const [freeStation] = await db
      .insert(stations)
      .values({
        storeId: station.storeId,
        name: uniqueName("Свободная станция"),
        code: uniqueStationCode(),
      })
      .returning({ id: stations.id });
    if (freeStation === undefined) throw new Error("Станция не вставилась");

    const checklistId = await createChecklist({
      stationId: station.stationId,
    });
    const versionId = await createPublishedVersion(
      checklistId,
      sampleSections("история"),
    );
    await saveSubmission({
      mode: "normal",
      versionId,
      answers: [boolAnswer("item-история", true)],
      startedAt: Date.now(),
    });

    await expect(
      deleteStore(station.storeId, { confirmed: true }),
    ).rejects.toMatchObject({ code: "referencedByHistory" });

    expect(await storeExists(station.storeId)).toBe(true);
    expect(await stationExists(station.stationId)).toBe(true);
    expect(await stationExists(freeStation.id)).toBe(true);
  });

  test("пиццерия с заданным режимом смены и нулём заполнений удаляется вместе с режимом", async () => {
    // Дефект T154: `store_shift_modes` держит пиццерию внешним ключом `restrict`, и до
    // этой задачи удаление отказывало НАВСЕГДА — при нуле заполнений, да ещё и с чужой
    // причиной («ссылаются заполнения»). Режим смены — настройка пиццерии, а не история
    // работы: он снимается вместе с ней и в той же транзакции.
    const countryId = await createCountry({
      name: uniqueName("Страна с режимом"),
      locale: "ru",
    });
    const storeId = await createStore({
      countryId,
      name: uniqueName("Пиццерия с режимом"),
      timezone: "UTC",
    });
    // Перестановок несколько: таблица только пополняется (D055), и снять надо все строки.
    await setShiftMode(
      { storeId, mode: "reduced", staffPresent: 2 },
      new Date(),
    );
    await setShiftMode({ storeId, mode: "critical" }, new Date());
    expect(await shiftModeCount(storeId)).toBe(2);
    expect(await submissionCountOfStore(storeId)).toBe(0);

    await deleteStore(storeId, { confirmed: true });

    expect(await storeExists(storeId)).toBe(false);
    expect(await shiftModeCount(storeId)).toBe(0);
  });

  test("отказ по истории откатывает и снятие режима смены: настройка остаётся на месте", async () => {
    // Порядок внутри транзакции не должен создавать частичной зачистки: режим снимается
    // раньше, чем падает удаление станции, и обязан вернуться откатом.
    const station = await createStation();
    await setShiftMode(
      { storeId: station.storeId, mode: "reduced" },
      new Date(),
    );
    const checklistId = await createChecklist({
      stationId: station.stationId,
    });
    const versionId = await createPublishedVersion(
      checklistId,
      sampleSections("режим-и-история"),
    );
    await saveSubmission({
      mode: "normal",
      versionId,
      answers: [boolAnswer("item-режим-и-история", true)],
      startedAt: Date.now(),
    });

    await expect(
      deleteStore(station.storeId, { confirmed: true }),
    ).rejects.toMatchObject({ code: "referencedByHistory" });

    expect(await storeExists(station.storeId)).toBe(true);
    expect(await shiftModeCount(station.storeId)).toBe(1);
  });

  test("отметка обхода без единого заполнения отказывает своей формулировкой, а не историей заполнений", async () => {
    // Обход можно отметить, не закончив заполнение: заполнений ноль, а удаление всё равно
    // запрещено — и причину надо назвать ту, что есть на самом деле (T154).
    const station = await createStation();
    const checklistId = await createChecklist({
      stationId: station.stationId,
    });
    const versionId = await createPublishedVersion(
      checklistId,
      sampleSections("обход"),
    );
    await db.insert(checks).values({
      stationId: station.stationId,
      versionId,
      itemId: "item-обход",
      localDate: "2026-09-16",
      intervalStart: 0,
      value: true,
    });

    expect(await submissionCountOfStore(station.storeId)).toBe(0);
    await expect(
      deleteStore(station.storeId, { confirmed: true }),
    ).rejects.toMatchObject({ code: "referencedByChecks" });

    expect(await storeExists(station.storeId)).toBe(true);
    expect(await stationExists(station.stationId)).toBe(true);
  });
});
