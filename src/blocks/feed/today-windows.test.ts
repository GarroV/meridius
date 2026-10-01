// Живые чек-листы области и их проходы «сегодня» на настоящей базе (D179).
//
// Сверяется то, что приносит запрос: какие чек-листы живые, границы прохода в поясе
// пиццерии, заполнение внутри прохода и режим смены — и итоговый статус по правилу
// `today-status.ts`. Заполнения пишутся с подменённым временем отправки: его ставит база.
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, test } from "vitest";

import {
  checklists,
  saveSubmission,
  setShiftMode,
  stores,
  submissions,
} from "@/blocks/data";
import type { Section } from "@/blocks/data";
import { WHOLE_NETWORK } from "@/blocks/auth/scope";
import { closeTestDb, getTestDb } from "@/blocks/data/testing/db";
import {
  createChecklist,
  createPublishedVersion,
  createStation,
} from "@/blocks/data/testing/fixtures";

import type { FeedScope } from "./scope";
import { todayStatusOf, type TodayStatus } from "./today-status";
import { listLiveChecklists } from "./today-windows";

const db = getTestDb();
afterAll(closeTestDb);

const at = (iso: string): Date => new Date(iso);

const GAS: Section["items"][number] = {
  id: "i-gas",
  title: { ru: "Газ выключен", en: "Gas off" },
  type: "bool",
  severity: "critical",
};
const TABLES: Section["items"][number] = {
  id: "i-tables",
  title: { ru: "Столы протёрты", en: "Tables wiped" },
  type: "bool",
  severity: "normal",
};

function sections(items: readonly Section["items"][number][]): Section[] {
  return [
    {
      id: "s-1",
      title: { ru: "Секция", en: "Section" },
      source: "own",
      items: [...items],
    },
  ];
}

interface Options {
  readonly items?: readonly Section["items"][number][];
  readonly timezone?: string;
  readonly windowStart?: string;
  readonly windowEnd?: string;
}

async function prepare(options: Options = {}) {
  const station = await createStation(
    options.timezone === undefined ? {} : { timezone: options.timezone },
  );
  const checklistId = await createChecklist({
    stationId: station.stationId,
    windowStart: options.windowStart ?? "06:00:00",
    windowEnd: options.windowEnd ?? "12:00:00",
  });
  const versionId = await createPublishedVersion(
    checklistId,
    sections(options.items ?? [GAS, TABLES]),
  );
  return { ...station, checklistId, versionId };
}

async function fill(versionId: string, submittedAt: Date): Promise<void> {
  const id = await saveSubmission({
    mode: "normal",
    versionId,
    answers: [{ itemId: "i-gas", value: true, at: submittedAt.getTime() }],
    startedAt: submittedAt.getTime() - 60_000,
  });
  await db
    .update(submissions)
    .set({ submittedAt })
    .where(eq(submissions.id, id));
}

async function statusesOf(
  scope: FeedScope,
  now: Date,
): Promise<readonly TodayStatus[]> {
  const { rows } = await listLiveChecklists(scope, now);
  return rows.map((row) => todayStatusOf(row.day, now));
}

describe("какие чек-листы живые", () => {
  test("опубликованный чек-лист станции — в списке, с названием, станцией и окном", async () => {
    const place = await prepare();
    const { rows } = await listLiveChecklists(
      { visible: WHOLE_NETWORK, storeId: place.storeId },
      at("2026-09-06T09:00:00Z"),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      checklistId: place.checklistId,
      stationId: place.stationId,
      storeId: place.storeId,
      windowStart: "06:00:00",
      windowEnd: "12:00:00",
    });
  });

  test("снятый с работы и неопубликованный чек-листы — не живые", async () => {
    const place = await prepare();
    await db
      .update(checklists)
      .set({ archivedAt: new Date() })
      .where(eq(checklists.id, place.checklistId));
    await createChecklist({ stationId: place.stationId });

    const { rows } = await listLiveChecklists(
      { visible: WHOLE_NETWORK, storeId: place.storeId },
      at("2026-09-06T09:00:00Z"),
    );
    expect(rows).toStrictEqual([]);
  });

  test("соседняя пиццерия в выборку не попадает", async () => {
    const mine = await prepare();
    await prepare();
    const { rows } = await listLiveChecklists(
      { visible: WHOLE_NETWORK, storeId: mine.storeId },
      at("2026-09-06T09:00:00Z"),
    );
    expect(rows.map((row) => row.storeId)).toStrictEqual([mine.storeId]);
  });
});

describe("статус на сегодня по данным базы", () => {
  test("до окна — ждёт открытия в 06:00", async () => {
    const { storeId } = await prepare();
    expect(
      await statusesOf(
        { visible: WHOLE_NETWORK, storeId },
        at("2026-09-06T04:00:00Z"),
      ),
    ).toStrictEqual([{ kind: "upcoming", at: at("2026-09-06T06:00:00Z") }]);
  });

  test("окно открыто — открыто до 12:00", async () => {
    const { storeId } = await prepare();
    expect(
      await statusesOf(
        { visible: WHOLE_NETWORK, storeId },
        at("2026-09-06T09:00:00Z"),
      ),
    ).toStrictEqual([{ kind: "open", at: at("2026-09-06T12:00:00Z") }]);
  });

  test("заполнили в окне — заполнен, со временем последнего заполнения", async () => {
    const { storeId, versionId } = await prepare();
    await fill(versionId, at("2026-09-06T07:00:00Z"));
    await fill(versionId, at("2026-09-06T08:15:00Z"));
    expect(
      await statusesOf(
        { visible: WHOLE_NETWORK, storeId },
        at("2026-09-06T14:00:00Z"),
      ),
    ).toStrictEqual([{ kind: "filled", at: at("2026-09-06T08:15:00Z") }]);
  });

  test("вчерашнее заполнение сегодняшнее окно не закрывает — пропущен", async () => {
    const { storeId, versionId } = await prepare();
    await fill(versionId, at("2026-09-05T09:00:00Z"));
    expect(
      await statusesOf(
        { visible: WHOLE_NETWORK, storeId },
        at("2026-09-06T14:00:00Z"),
      ),
    ).toStrictEqual([{ kind: "missed", at: at("2026-09-06T12:00:00Z") }]);
  });

  test("критичная смена без критичных пунктов — чек-лист не ждут", async () => {
    const { storeId } = await prepare({ items: [TABLES] });
    await setShiftMode(
      { storeId, mode: "critical" },
      at("2026-09-06T09:00:00Z"),
    );
    expect(
      await statusesOf(
        { visible: WHOLE_NETWORK, storeId },
        at("2026-09-06T14:00:00Z"),
      ),
    ).toStrictEqual([{ kind: "notExpected" }]);
  });

  test("пояс пиццерии решает: в 08:00 UTC в Алматы (UTC+5) окно уже закрылось", async () => {
    const { storeId } = await prepare({ timezone: "Asia/Almaty" });
    expect(
      await statusesOf(
        { visible: WHOLE_NETWORK, storeId },
        at("2026-09-06T08:00:00Z"),
      ),
    ).toStrictEqual([{ kind: "missed", at: at("2026-09-06T07:00:00Z") }]);
  });

  test("окно через полночь: в 23:00 открыт сегодняшний вечер до полуночи", async () => {
    const { storeId } = await prepare({
      windowStart: "20:00:00",
      windowEnd: "00:00:00",
    });
    expect(
      await statusesOf(
        { visible: WHOLE_NETWORK, storeId },
        at("2026-09-06T23:00:00Z"),
      ),
    ).toStrictEqual([{ kind: "open", at: at("2026-09-07T00:00:00Z") }]);
  });

  test("окно через полночь: днём статус о вчерашнем вечере", async () => {
    const { storeId, versionId } = await prepare({
      windowStart: "20:00:00",
      windowEnd: "00:00:00",
    });
    await fill(versionId, at("2026-09-05T21:30:00Z"));
    expect(
      await statusesOf(
        { visible: WHOLE_NETWORK, storeId },
        at("2026-09-06T10:00:00Z"),
      ),
    ).toStrictEqual([{ kind: "filled", at: at("2026-09-05T21:30:00Z") }]);
  });

  test("пояс, незнакомый базе, — статус «неизвестен», а не падение запроса", async () => {
    const { storeId } = await prepare();
    await db
      .update(stores)
      .set({ timezone: "Asia/Almatyy" })
      .where(eq(stores.id, storeId));
    expect(
      await statusesOf(
        { visible: WHOLE_NETWORK, storeId },
        at("2026-09-06T09:00:00Z"),
      ),
    ).toStrictEqual([{ kind: "unknownZone" }]);
  });
});
