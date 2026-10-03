// Статистика по стране и пиццерии (D150, D170) на настоящей базе.
//
// Каждое число сверяется с заранее известным ответом на данных, записанных здесь же:
// сколько заполнений, сколько из них с проваленным критичным пунктом, какие пункты
// проваливают чаще всего, сколько будильников поставлено и какие станции молчат.
// Данные пишутся прямо в таблицы, а не через `saveSubmission`: статистике важны время
// отправки, пометка повтора и время публикации, а их ставит база, и подменять их иначе
// нечем.
import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, describe, expect, test } from "vitest";

import {
  alarms,
  checklistVersions,
  checklists,
  checks,
  stations,
  stores,
  submissions,
} from "@/blocks/data";
import type { AnswerValue, Item, Section } from "@/blocks/data";
import { WHOLE_NETWORK } from "@/blocks/auth/scope";
import { closeTestDb, getTestDb } from "@/blocks/data/testing/db";
import {
  createChecklist,
  createPublishedVersion,
  createStation,
  uniqueStationCode,
} from "@/blocks/data/testing/fixtures";

import { resolvePeriod } from "./period";
import type { FeedScope } from "./scope";
import { loadStats, type Stats } from "./stats";

const db = getTestDb();
afterAll(closeTestDb);

const NOW = new Date("2026-09-20T12:00:00Z");
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function ago(ms: number): Date {
  return new Date(NOW.getTime() - ms);
}

function bool(id: string, ru: string, severity: Item["severity"]): Item {
  return { id, title: { ru, en: ru }, type: "bool", severity };
}

/** Идентификаторы пунктов уникальны на прогон: база тестов общая для всех файлов. */
function ids() {
  const tag = randomUUID().slice(0, 8);
  return {
    gas: `gas-${tag}`,
    tables: `tables-${tag}`,
    fridge: `fridge-${tag}`,
    oven: `oven-${tag}`,
  };
}

function sectionsOf(items: readonly Item[]): Section[] {
  return [
    {
      id: "s-1",
      title: { ru: "Секция", en: "Section" },
      source: "own",
      items: [...items],
    },
  ];
}

interface Place {
  readonly countryId: string;
  readonly storeId: string;
  readonly stationId: string;
  readonly versionId: string;
}

/** Станция с опубликованным чек-листом. `publishedAt` — когда версия вышла. */
async function placeWith(
  items: readonly Item[],
  publishedAt: Date = ago(10 * DAY),
): Promise<Place> {
  const station = await createStation();
  return attach(station, items, publishedAt);
}

async function attach(
  station: { countryId: string; storeId: string; stationId: string },
  items: readonly Item[],
  publishedAt: Date,
): Promise<Place> {
  const checklistId = await createChecklist({ stationId: station.stationId });
  const versionId = await createPublishedVersion(
    checklistId,
    sectionsOf(items),
  );
  await db
    .update(checklistVersions)
    .set({ publishedAt })
    .where(eq(checklistVersions.id, versionId));
  return { ...station, versionId };
}

/** Переводит пиццерию места в другой пояс: `createStation` заводит её в UTC. */
async function inZone(place: { storeId: string }, timezone: string) {
  await db.update(stores).set({ timezone }).where(eq(stores.id, place.storeId));
}

/** Вторая пиццерия в той же стране: `createStation` каждый раз заводит новую страну. */
async function secondStore(countryId: string, name: string) {
  const [store] = await db
    .insert(stores)
    .values({ countryId, name, timezone: "UTC" })
    .returning({ id: stores.id });
  if (store === undefined) throw new Error("пиццерия не записалась");
  const [station] = await db
    .insert(stations)
    .values({
      storeId: store.id,
      name: `${name} · Кухня`,
      code: uniqueStationCode(),
    })
    .returning({ id: stations.id });
  if (station === undefined) throw new Error("станция не записалась");
  return { countryId, storeId: store.id, stationId: station.id };
}

interface FillOptions {
  readonly duplicate?: boolean;
  readonly items: readonly Item[];
}

async function fill(
  place: Place,
  submittedAt: Date,
  answers: Record<string, AnswerValue>,
  options: FillOptions,
): Promise<void> {
  await db.insert(submissions).values({
    versionId: place.versionId,
    stationId: place.stationId,
    snapshot: sectionsOf(options.items),
    answers: Object.entries(answers).map(([itemId, value]) => ({
      itemId,
      value,
      at: submittedAt.getTime(),
    })),
    // Повтор — вторая запись того же заполнения: начало совпадает с оригиналом.
    startedAt: new Date(submittedAt.getTime() - 60_000),
    submittedAt,
    duplicate: options.duplicate ?? false,
  });
}

async function mark(
  place: Place,
  itemId: string,
  value: AnswerValue,
  at: Date,
): Promise<void> {
  await db.insert(checks).values({
    stationId: place.stationId,
    versionId: place.versionId,
    itemId,
    localDate: at.toISOString().slice(0, 10),
    intervalStart: 0,
    value,
    at,
  });
}

async function alarm(place: Place, createdAt: Date): Promise<void> {
  await db.insert(alarms).values({
    stationId: place.stationId,
    at: new Date(createdAt.getTime() + HOUR),
    label: "Тесто",
    createdAt,
  });
}

function storeScope(place: { storeId: string }): FeedScope {
  return { visible: WHOLE_NETWORK, storeId: place.storeId };
}

function countryScope(place: { countryId: string }): FeedScope {
  return { visible: WHOLE_NETWORK, countryId: place.countryId };
}

function titles(stats: Stats): string[] {
  return stats.topFailedItems.map((row) => row.title["ru"] ?? "");
}

describe("заполнения за период", () => {
  test("число заполнений и доля с проваленным критичным пунктом", async () => {
    const id = ids();
    const items = [
      bool(id.gas, "Газ", "critical"),
      bool(id.tables, "Столы", "normal"),
    ];
    const place = await placeWith(items);

    await fill(
      place,
      ago(1 * DAY),
      { [id.gas]: false, [id.tables]: true },
      { items },
    );
    await fill(
      place,
      ago(2 * DAY),
      { [id.gas]: true, [id.tables]: false },
      { items },
    );
    await fill(
      place,
      ago(3 * DAY),
      { [id.gas]: true, [id.tables]: true },
      { items },
    );
    await fill(place, ago(5 * DAY), { [id.tables]: true }, { items });

    const stats = await loadStats(storeScope(place), 7, NOW, "UTC");

    expect(stats.submissionCount).toBe(4);
    expect(stats.criticalFailedCount).toBe(1);
    expect(stats.criticalFailedShare).toBeCloseTo(0.25, 10);
  });

  test("заполнение с двумя проваленными критичными пунктами считается одним", async () => {
    const id = ids();
    const items = [
      bool(id.gas, "Газ", "critical"),
      bool(id.oven, "Печь", "critical"),
    ];
    const place = await placeWith(items);

    await fill(
      place,
      ago(1 * DAY),
      { [id.gas]: false, [id.oven]: false },
      { items },
    );
    await fill(
      place,
      ago(2 * DAY),
      { [id.gas]: true, [id.oven]: true },
      { items },
    );

    const stats = await loadStats(storeScope(place), 7, NOW, "UTC");

    expect(stats.criticalFailedCount).toBe(1);
    expect(stats.criticalFailedShare).toBeCloseTo(0.5, 10);
  });

  test("критичный пункт без ответа — не провал", async () => {
    const id = ids();
    const items = [bool(id.gas, "Газ", "critical")];
    const place = await placeWith(items);

    await fill(place, ago(1 * DAY), {}, { items });

    const stats = await loadStats(storeScope(place), 7, NOW, "UTC");

    expect(stats.submissionCount).toBe(1);
    expect(stats.criticalFailedCount).toBe(0);
  });

  test("границы периода — календарные сутки в поясе пиццерии, как у главной", async () => {
    const id = ids();
    const items = [bool(id.gas, "Газ", "critical")];
    const place = await placeWith(items, ago(60 * DAY));
    await inZone(place, "Asia/Almaty");

    // NOW — 17:00 20 сентября в Алматы (UTC+5). «7 дней» — с 14 сентября 00:00 по
    // местному времени, то есть с 13.09 19:00 UTC; «30 дней» — с 22 августа 00:00.
    const weekStart = new Date("2026-09-13T19:00:00Z");
    const monthStart = new Date("2026-08-21T19:00:00Z");
    const minute = 60_000;

    await fill(
      place,
      new Date(weekStart.getTime() + minute),
      { [id.gas]: false },
      { items },
    );
    // Минута до начала недели: скользящее окно 7×24 ч его бы взяло, календарное — нет.
    await fill(
      place,
      new Date(weekStart.getTime() - minute),
      { [id.gas]: false },
      { items },
    );
    await fill(
      place,
      new Date(monthStart.getTime() + minute),
      { [id.gas]: true },
      { items },
    );
    await fill(
      place,
      new Date(monthStart.getTime() - minute),
      { [id.gas]: true },
      { items },
    );
    // Из будущего относительно момента просмотра — в окно «до сейчас» не входит.
    await fill(
      place,
      new Date(NOW.getTime() + HOUR),
      { [id.gas]: true },
      { items },
    );

    const week = await loadStats(storeScope(place), 7, NOW, "Asia/Almaty");
    const month = await loadStats(storeScope(place), 30, NOW, "Asia/Almaty");

    expect(week.submissionCount).toBe(1);
    expect(week.criticalFailedCount).toBe(1);
    expect(month.submissionCount).toBe(3);
    expect(month.criticalFailedCount).toBe(2);
    expect(week.from).toStrictEqual(weekStart);
    expect(month.from).toStrictEqual(monthStart);
    expect(month.to).toStrictEqual(NOW);
  });

  test("начало периода совпадает с главной: одно правило на оба экрана", async () => {
    const place = await placeWith([]);
    const zone = "Europe/Berlin";

    const week = await loadStats(storeScope(place), 7, NOW, zone);
    const month = await loadStats(storeScope(place), 30, NOW, zone);

    expect(week.from).toStrictEqual(resolvePeriod("week", NOW, zone).from);
    expect(month.from).toStrictEqual(resolvePeriod("month", NOW, zone).from);
  });

  test("повтор заполнения (пометка duplicate) не считается вторым заполнением", async () => {
    const id = ids();
    const items = [bool(id.gas, "Газ", "critical")];
    const place = await placeWith(items);

    await fill(place, ago(1 * DAY), { [id.gas]: false }, { items });
    await fill(
      place,
      ago(1 * DAY),
      { [id.gas]: false },
      { items, duplicate: true },
    );

    const stats = await loadStats(storeScope(place), 7, NOW, "UTC");

    expect(stats.submissionCount).toBe(1);
    expect(stats.criticalFailedCount).toBe(1);
    expect(stats.topFailedItems[0]?.failures).toBe(1);
  });

  test("нет заполнений — доля не ноль, а «нечего считать»", async () => {
    const place = await placeWith([bool(ids().gas, "Газ", "critical")]);

    const stats = await loadStats(storeScope(place), 7, NOW, "UTC");

    expect(stats.submissionCount).toBe(0);
    expect(stats.criticalFailedShare).toBeNull();
    expect(stats.topFailedItems).toEqual([]);
  });

  test("провал оценивается по снимку заполнения, а не по нынешней версии", async () => {
    const id = ids();
    // В версии пункт уже обычный, а в снимке — критичный: считается снимок.
    const place = await placeWith([bool(id.gas, "Газ", "normal")]);
    const snapshot = [bool(id.gas, "Газ", "critical")];

    await fill(place, ago(1 * DAY), { [id.gas]: false }, { items: snapshot });

    const stats = await loadStats(storeScope(place), 7, NOW, "UTC");

    expect(stats.criticalFailedCount).toBe(1);
  });
});

describe("пять чаще всего проваливаемых пунктов", () => {
  test("порядок по числу провалов, и в счёт идут и заполнения, и обходы", async () => {
    const id = ids();
    const fridge: Item = {
      id: id.fridge,
      title: { ru: "Холодильник", en: "Fridge" },
      type: "number",
      min: 2,
      max: 6,
      severity: "major",
    };
    const items = [
      bool(id.gas, "Газ", "critical"),
      bool(id.tables, "Столы", "normal"),
      fridge,
    ];
    const place = await placeWith(items);

    await fill(
      place,
      ago(1 * DAY),
      { [id.gas]: false, [id.tables]: false, [id.fridge]: 9 },
      { items },
    );
    await fill(
      place,
      ago(2 * DAY),
      { [id.tables]: false, [id.fridge]: 4 },
      { items },
    );
    await fill(
      place,
      ago(3 * DAY),
      { [id.tables]: false, [id.fridge]: 1 },
      { items },
    );
    // Обходы: две отметки холодильника вне диапазона, одна в норме.
    await mark(place, id.fridge, 8, ago(1 * DAY));
    await mark(place, id.fridge, 7, ago(2 * DAY));
    await mark(place, id.fridge, 3, ago(3 * DAY));

    const stats = await loadStats(storeScope(place), 7, NOW, "UTC");

    expect(
      stats.topFailedItems.map((row) => [row.title["ru"], row.failures]),
    ).toEqual([
      ["Холодильник", 4],
      ["Столы", 3],
      ["Газ", 1],
    ]);
    expect(stats.topFailedItems[0]?.storeCount).toBe(1);
  });

  test("не больше пяти пунктов", async () => {
    const items = Array.from({ length: 7 }, (_, index) =>
      bool(
        `p${String(index)}-${randomUUID().slice(0, 8)}`,
        `Пункт ${String(index)}`,
        "normal",
      ),
    );
    const place = await placeWith(items);
    const answers = Object.fromEntries(items.map((one) => [one.id, false]));

    await fill(place, ago(1 * DAY), answers, { items });

    const stats = await loadStats(storeScope(place), 7, NOW, "UTC");

    expect(stats.topFailedItems).toHaveLength(5);
  });

  test("один пункт шаблона в двух пиццериях страны — одна строка, две пиццерии", async () => {
    const id = ids();
    const items = [bool(id.gas, "Газ", "critical")];
    const first = await placeWith(items);
    const second = await attach(
      await secondStore(first.countryId, `Вторая ${id.gas}`),
      items,
      ago(10 * DAY),
    );

    await fill(first, ago(1 * DAY), { [id.gas]: false }, { items });
    await fill(second, ago(1 * DAY), { [id.gas]: false }, { items });
    await fill(second, ago(2 * DAY), { [id.gas]: false }, { items });

    const country = await loadStats(countryScope(first), 7, NOW, "UTC");
    const store = await loadStats(storeScope(second), 7, NOW, "UTC");

    expect(country.topFailedItems).toHaveLength(1);
    expect(country.topFailedItems[0]?.failures).toBe(3);
    expect(country.topFailedItems[0]?.storeCount).toBe(2);
    expect(country.submissionCount).toBe(3);
    expect(store.topFailedItems[0]?.failures).toBe(2);
    expect(store.submissionCount).toBe(2);
  });

  test("название пункта — из самого свежего провала", async () => {
    const id = ids();
    const place = await placeWith([bool(id.gas, "Газ", "critical")]);

    await fill(
      place,
      ago(3 * DAY),
      { [id.gas]: false },
      { items: [bool(id.gas, "Газ старый", "critical")] },
    );
    await fill(
      place,
      ago(1 * DAY),
      { [id.gas]: false },
      { items: [bool(id.gas, "Газ новый", "critical")] },
    );

    const stats = await loadStats(storeScope(place), 7, NOW, "UTC");

    expect(titles(stats)).toEqual(["Газ новый"]);
  });

  test("обход вне периода не считается", async () => {
    const id = ids();
    const place = await placeWith([bool(id.gas, "Газ", "critical")]);

    await mark(place, id.gas, false, ago(8 * DAY));

    const stats = await loadStats(storeScope(place), 7, NOW, "UTC");

    expect(stats.topFailedItems).toEqual([]);
  });
});

describe("будильники", () => {
  test("считаются поставленные за период", async () => {
    const place = await placeWith([bool(ids().gas, "Газ", "critical")]);

    await alarm(place, ago(1 * DAY));
    await alarm(place, ago(6 * DAY));
    await alarm(place, ago(8 * DAY));

    const week = await loadStats(storeScope(place), 7, NOW, "UTC");
    const month = await loadStats(storeScope(place), 30, NOW, "UTC");

    expect(week.alarmCount).toBe(2);
    expect(month.alarmCount).toBe(3);
  });
});

describe("станции, молчащие дольше суток", () => {
  test("последнее заполнение 30 часов назад — молчит, с временем последнего сигнала", async () => {
    const id = ids();
    const items = [bool(id.gas, "Газ", "critical")];
    const place = await placeWith(items);
    const last = ago(30 * HOUR);
    await fill(place, last, { [id.gas]: true }, { items });

    const stats = await loadStats(storeScope(place), 7, NOW, "UTC");

    expect(stats.silentStationCount).toBe(1);
    expect(stats.silentStations[0]?.stationId).toBe(place.stationId);
    expect(stats.silentStations[0]?.lastSignalAt?.getTime()).toBe(
      last.getTime(),
    );
  });

  test("заполнение 2 часа назад — не молчит", async () => {
    const id = ids();
    const items = [bool(id.gas, "Газ", "critical")];
    const place = await placeWith(items);
    await fill(place, ago(2 * HOUR), { [id.gas]: true }, { items });

    const stats = await loadStats(storeScope(place), 7, NOW, "UTC");

    expect(stats.silentStationCount).toBe(0);
  });

  test("только отметка обхода 2 часа назад — тоже сигнал", async () => {
    const id = ids();
    const place = await placeWith([bool(id.gas, "Газ", "critical")]);
    await mark(place, id.gas, true, ago(2 * HOUR));

    const stats = await loadStats(storeScope(place), 7, NOW, "UTC");

    expect(stats.silentStationCount).toBe(0);
  });

  test("чек-лист вышел три дня назад, заполнений не было — молчит без последнего сигнала", async () => {
    const place = await placeWith(
      [bool(ids().gas, "Газ", "critical")],
      ago(3 * DAY),
    );

    const stats = await loadStats(storeScope(place), 7, NOW, "UTC");

    expect(stats.silentStationCount).toBe(1);
    expect(stats.silentStations[0]?.lastSignalAt).toBeNull();
    expect(stats.silentStations[0]?.silentSince.getTime()).toBe(
      ago(3 * DAY).getTime(),
    );
  });

  test("чек-лист вышел 2 часа назад — ещё не молчание", async () => {
    const place = await placeWith(
      [bool(ids().gas, "Газ", "critical")],
      ago(2 * HOUR),
    );

    const stats = await loadStats(storeScope(place), 7, NOW, "UTC");

    expect(stats.silentStationCount).toBe(0);
  });

  test("давний сигнал, но чек-лист привязан 2 часа назад — отсчёт от его выхода", async () => {
    const id = ids();
    const items = [bool(id.gas, "Газ", "critical")];
    const old = await placeWith(items, ago(20 * DAY));
    await fill(old, ago(10 * DAY), { [id.gas]: true }, { items });
    // Старый чек-лист сняли в архив, на станцию только что вышел новый.
    await db
      .update(checklists)
      .set({ archivedAt: ago(9 * DAY) })
      .where(eq(checklists.stationId, old.stationId));
    await attach(old, items, ago(2 * HOUR));

    const stats = await loadStats(storeScope(old), 7, NOW, "UTC");

    expect(stats.silentStationCount).toBe(0);
  });

  test("станция без чек-листа не молчит: от неё ничего и не ждут", async () => {
    const station = await createStation();

    const stats = await loadStats(storeScope(station), 7, NOW, "UTC");

    expect(stats.silentStationCount).toBe(0);
  });

  test("сигнал после момента просмотра не прячет молчание в прошлом", async () => {
    const id = ids();
    const items = [bool(id.gas, "Газ", "critical")];
    const place = await placeWith(items);
    await fill(place, ago(30 * HOUR), { [id.gas]: true }, { items });
    await fill(
      place,
      new Date(NOW.getTime() + HOUR),
      { [id.gas]: true },
      { items },
    );

    const stats = await loadStats(storeScope(place), 7, NOW, "UTC");

    expect(stats.silentStationCount).toBe(1);
  });
});

describe("область видимости", () => {
  test("партнёр без этой страны не видит её чисел", async () => {
    const id = ids();
    const items = [bool(id.gas, "Газ", "critical")];
    const place = await placeWith(items, ago(3 * DAY));
    await fill(place, ago(30 * HOUR), { [id.gas]: false }, { items });
    await alarm(place, ago(1 * DAY));

    const stranger: FeedScope = {
      visible: { kind: "countries", countryIds: new Set([randomUUID()]) },
      countryId: place.countryId,
    };
    const stats = await loadStats(stranger, 7, NOW, "UTC");

    expect(stats.submissionCount).toBe(0);
    expect(stats.topFailedItems).toEqual([]);
    expect(stats.alarmCount).toBe(0);
    expect(stats.silentStationCount).toBe(0);
  });

  test("партнёр своей страны видит те же числа, что УК", async () => {
    const id = ids();
    const items = [bool(id.gas, "Газ", "critical")];
    const place = await placeWith(items);
    await fill(place, ago(1 * DAY), { [id.gas]: false }, { items });

    const partner: FeedScope = {
      visible: { kind: "countries", countryIds: new Set([place.countryId]) },
      countryId: place.countryId,
    };
    const stats = await loadStats(partner, 7, NOW, "UTC");

    expect(stats.submissionCount).toBe(1);
    expect(stats.criticalFailedCount).toBe(1);
  });
});
