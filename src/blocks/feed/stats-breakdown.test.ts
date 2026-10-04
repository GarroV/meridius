// Разбивка статистики по пиццериям и по чек-листам (D179, состав D170) на настоящей базе.
//
// Каждое число сверяется с известным ответом на данных, записанных здесь же: сколько
// заполнений за период, сколько из них с проваленным критичным пунктом и когда было
// последнее заполнение. Заполнения пишутся прямо в таблицу: важны время отправки и
// пометка повтора, а их ставит база.
import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, describe, expect, test } from "vitest";

import { stations, stores, submissions } from "@/blocks/data";
import type { Item, Section } from "@/blocks/data";
import { WHOLE_NETWORK } from "@/blocks/auth/scope";
import { closeTestDb, getTestDb } from "@/blocks/data/testing/db";
import {
  createChecklist,
  createPublishedVersion,
  createStation,
  uniqueStationCode,
} from "@/blocks/data/testing/fixtures";

import { lastDays } from "./period";
import { loadSummariesBy, summaryOf } from "./stats-breakdown";

const db = getTestDb();
afterAll(closeTestDb);

const NOW = new Date("2026-09-20T12:00:00Z");
const DAY = 24 * 3_600_000;
const ago = (ms: number): Date => new Date(NOW.getTime() - ms);

const GAS: Item = {
  id: `gas-${randomUUID().slice(0, 8)}`,
  title: { ru: "Газ", en: "Gas" },
  type: "bool",
  severity: "critical",
};
const TABLES: Item = {
  id: `tables-${randomUUID().slice(0, 8)}`,
  title: { ru: "Столы", en: "Tables" },
  type: "bool",
  severity: "normal",
};

function sectionsOf(): Section[] {
  return [
    {
      id: "s-1",
      title: { ru: "Секция", en: "Section" },
      source: "own",
      items: [GAS, TABLES],
    },
  ];
}

interface Place {
  readonly countryId: string;
  readonly storeId: string;
  readonly stationId: string;
  readonly checklistId: string;
  readonly versionId: string;
}

async function checklistOn(station: {
  countryId: string;
  storeId: string;
  stationId: string;
}): Promise<Place> {
  const checklistId = await createChecklist({ stationId: station.stationId });
  const versionId = await createPublishedVersion(checklistId, sectionsOf());
  return { ...station, checklistId, versionId };
}

async function secondStore(countryId: string) {
  const [store] = await db
    .insert(stores)
    .values({ countryId, name: "Вторая", timezone: "UTC" })
    .returning({ id: stores.id });
  if (store === undefined) throw new Error("пиццерия не записалась");
  const [station] = await db
    .insert(stations)
    .values({ storeId: store.id, name: "Кухня", code: uniqueStationCode() })
    .returning({ id: stations.id });
  if (station === undefined) throw new Error("станция не записалась");
  return { countryId, storeId: store.id, stationId: station.id };
}

async function fill(
  place: Place,
  submittedAt: Date,
  gasOk: boolean,
  duplicate = false,
): Promise<void> {
  await db.insert(submissions).values({
    versionId: place.versionId,
    stationId: place.stationId,
    snapshot: sectionsOf(),
    answers: [
      { itemId: GAS.id, value: gasOk, at: submittedAt.getTime() },
      { itemId: TABLES.id, value: false, at: submittedAt.getTime() },
    ],
    startedAt: new Date(submittedAt.getTime() - 60_000),
    submittedAt,
    duplicate,
  });
}

describe("по чек-листам", () => {
  test("прошедший период: счёт — только его дни, последнее заполнение — на сейчас", async () => {
    const station = await createStation();
    const morning = await checklistOn(station);

    await fill(morning, ago(1 * DAY), true); // сентябрь — вне периода
    await fill(morning, ago(25 * DAY), false); // 26 августа
    await fill(morning, ago(30 * DAY), true); // 21 августа

    const byChecklist = await loadSummariesBy(
      "checklist",
      { visible: WHOLE_NETWORK, storeId: station.storeId },
      { from: "2026-08-01", to: "2026-08-31" },
      NOW,
      "UTC",
    );

    expect(summaryOf(byChecklist, morning.checklistId)).toStrictEqual({
      submissionCount: 2,
      criticalFailedCount: 1,
      criticalFailedShare: 1 / 2,
      lastSubmittedAt: ago(1 * DAY),
    });
  });

  test("заполнения за период, доля с проваленным критичным и последнее заполнение", async () => {
    const station = await createStation();
    const morning = await checklistOn(station);
    const evening = await checklistOn(station);

    await fill(morning, ago(1 * DAY), false);
    await fill(morning, ago(2 * DAY), true);
    await fill(morning, ago(3 * DAY), true);
    await fill(morning, ago(10 * DAY), false); // вне 7 дней
    await fill(evening, ago(4 * DAY), true);

    const byChecklist = await loadSummariesBy(
      "checklist",
      { visible: WHOLE_NETWORK, storeId: station.storeId },
      lastDays(7, NOW, "UTC"),
      NOW,
      "UTC",
    );

    expect(summaryOf(byChecklist, morning.checklistId)).toStrictEqual({
      submissionCount: 3,
      criticalFailedCount: 1,
      criticalFailedShare: 1 / 3,
      lastSubmittedAt: ago(1 * DAY),
    });
    expect(summaryOf(byChecklist, evening.checklistId)).toStrictEqual({
      submissionCount: 1,
      criticalFailedCount: 0,
      criticalFailedShare: 0,
      lastSubmittedAt: ago(4 * DAY),
    });
  });

  test("за 30 дней в счёт попадает и заполнение десятидневной давности", async () => {
    const place = await checklistOn(await createStation());
    await fill(place, ago(2 * DAY), true);
    await fill(place, ago(10 * DAY), false);

    const byChecklist = await loadSummariesBy(
      "checklist",
      { visible: WHOLE_NETWORK, storeId: place.storeId },
      lastDays(30, NOW, "UTC"),
      NOW,
      "UTC",
    );

    expect(summaryOf(byChecklist, place.checklistId)).toMatchObject({
      submissionCount: 2,
      criticalFailedCount: 1,
      criticalFailedShare: 0.5,
    });
  });

  test("неделя — календарные сутки в поясе пиццерии, а не 7×24 ч до просмотра", async () => {
    const place = await checklistOn(await createStation());
    await db
      .update(stores)
      .set({ timezone: "Asia/Almaty" })
      .where(eq(stores.id, place.storeId));
    // NOW — 17:00 20.09 в Алматы: неделя начинается 14.09 в 00:00 местного (13.09 19:00 UTC).
    const weekStart = new Date("2026-09-13T19:00:00Z").getTime();
    await fill(place, new Date(weekStart + 60_000), false);
    await fill(place, new Date(weekStart - 60_000), false);

    const byChecklist = await loadSummariesBy(
      "checklist",
      { visible: WHOLE_NETWORK, storeId: place.storeId },
      lastDays(7, NOW, "Asia/Almaty"),
      NOW,
      "Asia/Almaty",
    );

    expect(summaryOf(byChecklist, place.checklistId).submissionCount).toBe(1);
  });

  test("последнее заполнение берётся и из-за пределов периода: «давно» — тоже ответ", async () => {
    const place = await checklistOn(await createStation());
    await fill(place, ago(12 * DAY), true);

    const byChecklist = await loadSummariesBy(
      "checklist",
      { visible: WHOLE_NETWORK, storeId: place.storeId },
      lastDays(7, NOW, "UTC"),
      NOW,
      "UTC",
    );

    expect(summaryOf(byChecklist, place.checklistId)).toStrictEqual({
      submissionCount: 0,
      criticalFailedCount: 0,
      criticalFailedShare: null,
      lastSubmittedAt: ago(12 * DAY),
    });
  });

  test("повтор заполнения и заполнение из будущего в счёт не идут", async () => {
    const place = await checklistOn(await createStation());
    await fill(place, ago(1 * DAY), false);
    await fill(place, ago(1 * DAY), false, true);
    await fill(place, new Date(NOW.getTime() + DAY), false);

    const byChecklist = await loadSummariesBy(
      "checklist",
      { visible: WHOLE_NETWORK, storeId: place.storeId },
      lastDays(7, NOW, "UTC"),
      NOW,
      "UTC",
    );

    expect(summaryOf(byChecklist, place.checklistId)).toStrictEqual({
      submissionCount: 1,
      criticalFailedCount: 1,
      criticalFailedShare: 1,
      lastSubmittedAt: ago(1 * DAY),
    });
  });

  test("чек-лист без заполнений — нули и «не было», а не пропуск", async () => {
    const place = await checklistOn(await createStation());
    const byChecklist = await loadSummariesBy(
      "checklist",
      { visible: WHOLE_NETWORK, storeId: place.storeId },
      lastDays(7, NOW, "UTC"),
      NOW,
      "UTC",
    );
    expect(summaryOf(byChecklist, place.checklistId)).toStrictEqual({
      submissionCount: 0,
      criticalFailedCount: 0,
      criticalFailedShare: null,
      lastSubmittedAt: null,
    });
  });
});

describe("по пиццериям страны", () => {
  test("каждая пиццерия считает только свои заполнения", async () => {
    const first = await checklistOn(await createStation());
    const second = await checklistOn(await secondStore(first.countryId));
    await fill(first, ago(1 * DAY), false);
    await fill(first, ago(2 * DAY), true);
    await fill(second, ago(1 * DAY), true);

    const byStore = await loadSummariesBy(
      "store",
      { visible: WHOLE_NETWORK, countryId: first.countryId },
      lastDays(7, NOW, "UTC"),
      NOW,
      "UTC",
    );

    expect(summaryOf(byStore, first.storeId)).toMatchObject({
      submissionCount: 2,
      criticalFailedCount: 1,
    });
    expect(summaryOf(byStore, second.storeId)).toMatchObject({
      submissionCount: 1,
      criticalFailedCount: 0,
    });
    expect(byStore.size).toBe(2);
  });

  test("чужая страна в разбивку не попадает", async () => {
    const mine = await checklistOn(await createStation());
    const theirs = await checklistOn(await createStation());
    await fill(theirs, ago(1 * DAY), false);

    const byStore = await loadSummariesBy(
      "store",
      { visible: WHOLE_NETWORK, countryId: mine.countryId },
      lastDays(7, NOW, "UTC"),
      NOW,
      "UTC",
    );

    expect(byStore.has(theirs.storeId)).toBe(false);
  });
});
