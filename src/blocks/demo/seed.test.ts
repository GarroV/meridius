// Сид демонстрационного контура на настоящей базе. Заглушки здесь бесполезны:
// весь смысл сида — что после него в базе лежит показываемый продукт, а после
// второго прогона лежит ровно то же самое, а не вдвое больше.
import { randomUUID } from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, test } from "vitest";

import {
  alarms,
  blocks,
  checklistVersions,
  checklists,
  checks,
  countFailedCritical,
  countries,
  getPublishedVersionForStation,
  listSubmissions,
  stations,
  stores,
  submissions,
} from "@/blocks/data";
import { getTestDb, closeTestDb } from "@/blocks/data/testing/db";
import {
  createChecklist,
  createPublishedVersion,
  createStation,
  sampleSections,
  uniqueStationCode,
} from "@/blocks/data/testing/fixtures";

import { DEMO } from "./dataset";
import { seedDemo } from "./seed";

// Опорный момент прогонов: заполнения датируются смещением от него, и без общего
// значения два прогона нельзя сравнить на совпадение.
const NOW = new Date("2026-09-01T12:00:00.000Z");

const db = getTestDb();

const stationIds = DEMO.stations.map((station) => station.id);
const checklistIds = DEMO.checklists.map((checklist) => checklist.id);

interface DemoState {
  readonly countries: unknown[];
  readonly stores: unknown[];
  readonly stations: unknown[];
  readonly blocks: unknown[];
  readonly checklists: unknown[];
  readonly versions: unknown[];
  readonly submissions: unknown[];
}

/** Снимок контура в базе по деловым полям: `created_at` меняется от прогона к прогону. */
async function readState(): Promise<DemoState> {
  return {
    countries: await db
      .select({
        id: countries.id,
        name: countries.name,
        locale: countries.locale,
      })
      .from(countries)
      .where(eq(countries.id, DEMO.country.id)),
    stores: await db
      .select({ id: stores.id, name: stores.name, timezone: stores.timezone })
      .from(stores)
      .where(eq(stores.countryId, DEMO.country.id))
      .orderBy(stores.id),
    stations: await db
      .select({ id: stations.id, name: stations.name, code: stations.code })
      .from(stations)
      .where(
        inArray(
          stations.storeId,
          DEMO.stores.map((store) => store.id),
        ),
      )
      .orderBy(stations.id),
    blocks: await db
      .select({ id: blocks.id, title: blocks.title, items: blocks.items })
      .from(blocks)
      .where(
        inArray(
          blocks.id,
          DEMO.blocks.map((block) => block.id),
        ),
      )
      .orderBy(blocks.id),
    checklists: await db
      .select({
        id: checklists.id,
        title: checklists.title,
        stationId: checklists.stationId,
        windowStart: checklists.windowStart,
        windowEnd: checklists.windowEnd,
      })
      .from(checklists)
      .where(inArray(checklists.id, checklistIds))
      .orderBy(checklists.id),
    versions: await db
      .select({
        id: checklistVersions.id,
        checklistId: checklistVersions.checklistId,
        status: checklistVersions.status,
        versionNumber: checklistVersions.versionNumber,
        stationId: checklistVersions.stationId,
        sections: checklistVersions.sections,
        publishedAt: checklistVersions.publishedAt,
      })
      .from(checklistVersions)
      .where(inArray(checklistVersions.checklistId, checklistIds))
      .orderBy(checklistVersions.id),
    submissions: await db
      .select({
        id: submissions.id,
        versionId: submissions.versionId,
        stationId: submissions.stationId,
        snapshot: submissions.snapshot,
        answers: submissions.answers,
        startedAt: submissions.startedAt,
        submittedAt: submissions.submittedAt,
      })
      .from(submissions)
      .where(inArray(submissions.stationId, stationIds))
      .orderBy(submissions.id),
  };
}

afterAll(async () => {
  await closeTestDb();
});

describe("сид демонстрационного контура", () => {
  beforeEach(async () => {
    await seedDemo({ now: NOW });
  });

  test("заводит справочник, библиотеку, чек-листы с версиями и заполнения", async () => {
    const state = await readState();

    expect(state.countries).toHaveLength(1);
    expect(state.stores).toHaveLength(DEMO.stores.length);
    expect(state.stations).toHaveLength(DEMO.stations.length);
    expect(state.blocks).toHaveLength(DEMO.blocks.length);
    expect(state.checklists).toHaveLength(DEMO.checklists.length);
    // Версии = черновик на чек-лист плюс все опубликованные и архивные.
    expect(state.versions).toHaveLength(
      DEMO.checklists.length +
        DEMO.checklists.reduce(
          (total, checklist) => total + checklist.versions.length,
          0,
        ),
    );
    expect(state.submissions).toHaveLength(DEMO.submissions.length);
  });

  test("у каждого чек-листа есть черновик, и он не привязан к версии-номеру", async () => {
    const drafts = await db
      .select({
        id: checklistVersions.id,
        versionNumber: checklistVersions.versionNumber,
        publishedAt: checklistVersions.publishedAt,
      })
      .from(checklistVersions)
      .where(
        and(
          inArray(checklistVersions.checklistId, checklistIds),
          eq(checklistVersions.status, "draft"),
        ),
      );

    expect(drafts).toHaveLength(DEMO.checklists.length);
    for (const draft of drafts) {
      expect(draft.versionNumber).toBeNull();
      expect(draft.publishedAt).toBeNull();
    }
  });

  test("снимок заполнения — это разметка той версии, на которую оно ссылается", async () => {
    const sectionsByVersion = new Map(
      DEMO.checklists.flatMap((checklist) =>
        checklist.versions.map(
          (version) => [version.id, version.sections] as const,
        ),
      ),
    );
    const stored = await db
      .select({
        versionId: submissions.versionId,
        snapshot: submissions.snapshot,
        answers: submissions.answers,
        startedAt: submissions.startedAt,
        submittedAt: submissions.submittedAt,
      })
      .from(submissions)
      .where(inArray(submissions.stationId, stationIds));

    expect(stored).toHaveLength(DEMO.submissions.length);
    for (const row of stored) {
      expect(row.snapshot).toStrictEqual(sectionsByVersion.get(row.versionId));
      // Заполнение началось раньше отправки, а ответы легли между этими двумя моментами.
      expect(row.startedAt.getTime()).toBeLessThan(row.submittedAt.getTime());
      for (const answer of row.answers) {
        expect(answer.at).toBeGreaterThanOrEqual(row.startedAt.getTime());
        expect(answer.at).toBeLessThanOrEqual(row.submittedAt.getTime());
      }
    }
  });

  test("повторный прогон возвращает тот же контур и не плодит дубликатов", async () => {
    const first = await readState();

    await seedDemo({ now: NOW });
    const second = await readState();

    expect(second).toStrictEqual(first);
  });

  test("повторный прогон снимает заполнение, сделанное на демо-станции по ходу показа", async () => {
    const stationId = stationIds[0] ?? "";
    const versionId =
      DEMO.checklists.find((checklist) => checklist.stationId === stationId)
        ?.versions[0]?.id ?? "";
    const strayId = randomUUID();
    await db.insert(submissions).values({
      id: strayId,
      versionId,
      stationId,
      snapshot: [],
      answers: [],
      startedAt: NOW,
    });

    await seedDemo({ now: NOW });

    const left = await db
      .select({ id: submissions.id })
      .from(submissions)
      .where(eq(submissions.id, strayId));
    expect(left).toHaveLength(0);
  });

  test("рабочих данных сид не касается: чужая страна, станция и заполнение остаются", async () => {
    const foreign = await createStation();
    const checklistId = await createChecklist({ stationId: foreign.stationId });
    const versionId = await createPublishedVersion(
      checklistId,
      sampleSections("чужой"),
    );
    const submissionId = randomUUID();
    await db.insert(submissions).values({
      id: submissionId,
      versionId,
      stationId: foreign.stationId,
      snapshot: sampleSections("чужой"),
      answers: [],
      startedAt: NOW,
    });

    await seedDemo({ now: NOW });

    expect(
      await db
        .select({ id: countries.id })
        .from(countries)
        .where(eq(countries.id, foreign.countryId)),
    ).toHaveLength(1);
    expect(
      await db
        .select({ id: stations.id })
        .from(stations)
        .where(eq(stations.id, foreign.stationId)),
    ).toHaveLength(1);
    expect(
      await db
        .select({ id: submissions.id })
        .from(submissions)
        .where(eq(submissions.id, submissionId)),
    ).toHaveLength(1);
  });

  test("демо открывается по коду станции: сканирование отдаёт опубликованную версию", async () => {
    const station = DEMO.stations[0];
    const code = station?.code ?? "";

    // Круглосуточное покрытие проверено составом данных, поэтому берём произвольный час.
    const found = await getPublishedVersionForStation(code, NOW);

    expect(found).not.toBeNull();
    expect(found?.station.id).toBe(station?.id);
    expect(found?.version.status).toBe("published");
  });

  test("лента контура показывает все заполнения и ровно один проваленный критичный пункт", async () => {
    const rows = await listSubmissions({ countryId: DEMO.country.id });

    expect(rows).toHaveLength(DEMO.submissions.length);
    const failed = rows.filter((row) => row.failedCriticalCount > 0);
    expect(failed).toHaveLength(1);

    const detail = await db
      .select({ snapshot: submissions.snapshot, answers: submissions.answers })
      .from(submissions)
      .where(eq(submissions.id, failed[0]?.id ?? ""));
    const row = detail[0];
    expect(countFailedCritical(row?.snapshot ?? [], row?.answers ?? [])).toBe(
      1,
    );
    // Провал объяснён комментарием — иначе управляющему он ничего не говорит.
    expect(
      (row?.answers ?? []).some(
        (answer) => (answer.comment ?? "").trim() !== "",
      ),
    ).toBe(true);
  });
});

/**
 * Сколько строк лежит в контуре СЕЙЧАС — не по списку опознавателей из описания, а по
 * принадлежности: страна → пиццерии → станции → чек-листы → версии и заполнения.
 * Счёт по опознавателям здесь бесполезен: он не увидит ровно того, что заводят в контуре
 * руками, а именно это и должен снимать повторный прогон.
 */
async function contourSize(): Promise<Record<string, number>> {
  const storeRows = await db
    .select({ id: stores.id })
    .from(stores)
    .where(eq(stores.countryId, DEMO.country.id));
  const storeIds = storeRows.map((row) => row.id);

  const stationRows =
    storeIds.length === 0
      ? []
      : await db
          .select({ id: stations.id })
          .from(stations)
          .where(inArray(stations.storeId, storeIds));
  const foundStations = stationRows.map((row) => row.id);

  const checklistRows =
    foundStations.length === 0
      ? []
      : await db
          .select({ id: checklists.id })
          .from(checklists)
          .where(inArray(checklists.stationId, foundStations));
  const foundChecklists = checklistRows.map((row) => row.id);

  const versionRows =
    foundChecklists.length === 0
      ? []
      : await db
          .select({ id: checklistVersions.id })
          .from(checklistVersions)
          .where(inArray(checklistVersions.checklistId, foundChecklists));

  const submissionRows =
    foundStations.length === 0
      ? []
      : await db
          .select({ id: submissions.id })
          .from(submissions)
          .where(inArray(submissions.stationId, foundStations));

  return {
    stores: storeIds.length,
    stations: foundStations.length,
    checklists: foundChecklists.length,
    versions: versionRows.length,
    submissions: submissionRows.length,
  };
}

describe("сид на контуре, в котором уже поработали", () => {
  beforeEach(async () => {
    await seedDemo({ now: NOW });
  });

  test("станция, заведённая в демо-пиццерии, снимается повторным прогоном", async () => {
    const reference = await contourSize();
    const storeId = DEMO.stores[0]?.id ?? "";
    const strayId = randomUUID();
    await db.insert(stations).values({
      id: strayId,
      storeId,
      name: "Manager desk",
      code: uniqueStationCode(),
    });

    await seedDemo({ now: NOW });

    expect(await contourSize()).toStrictEqual(reference);
    expect(
      await db
        .select({ id: stations.id })
        .from(stations)
        .where(eq(stations.id, strayId)),
    ).toHaveLength(0);
  });

  test("пиццерия, заведённая в демо-стране, снимается повторным прогоном", async () => {
    const reference = await contourSize();
    const strayStore = randomUUID();
    const strayStation = randomUUID();
    await db.insert(stores).values({
      id: strayStore,
      countryId: DEMO.country.id,
      name: "Demoland, Airport",
      timezone: "UTC",
    });
    await db.insert(stations).values({
      id: strayStation,
      storeId: strayStore,
      name: "Kitchen",
      code: uniqueStationCode(),
    });

    await seedDemo({ now: NOW });

    expect(await contourSize()).toStrictEqual(reference);
    expect(
      await db
        .select({ id: stores.id })
        .from(stores)
        .where(eq(stores.id, strayStore)),
    ).toHaveLength(0);
  });

  test("чек-лист, заведённый на демо-станции, снимается вместе с версией и заполнением", async () => {
    const reference = await contourSize();
    const stationId = stationIds[0] ?? "";
    const checklistId = await createChecklist({ stationId });
    const versionId = await createPublishedVersion(
      checklistId,
      sampleSections("демо-показ"),
    );
    const submissionId = randomUUID();
    await db.insert(submissions).values({
      id: submissionId,
      versionId,
      stationId,
      snapshot: sampleSections("демо-показ"),
      answers: [],
      startedAt: NOW,
    });

    await seedDemo({ now: NOW });

    expect(await contourSize()).toStrictEqual(reference);
    expect(
      await db
        .select({ id: checklists.id })
        .from(checklists)
        .where(eq(checklists.id, checklistId)),
    ).toHaveLength(0);
  });

  test("отметка обхода и будильник на демо-станции снимаются вместе с контуром", async () => {
    const stationId = stationIds[0] ?? "";
    const versionId =
      DEMO.checklists.find((checklist) => checklist.stationId === stationId)
        ?.versions[0]?.id ?? "";
    const checkId = randomUUID();
    const alarmId = randomUUID();
    await db.insert(checks).values({
      id: checkId,
      stationId,
      versionId,
      itemId: "item-1",
      localDate: "2026-09-01",
      intervalStart: 0,
      value: true,
    });
    await db.insert(alarms).values({
      id: alarmId,
      stationId,
      at: NOW,
      label: "Проверить печь",
    });

    await seedDemo({ now: NOW });

    expect(
      await db
        .select({ id: checks.id })
        .from(checks)
        .where(eq(checks.id, checkId)),
    ).toHaveLength(0);
    expect(
      await db
        .select({ id: alarms.id })
        .from(alarms)
        .where(eq(alarms.id, alarmId)),
    ).toHaveLength(0);
  });

  test("после прогона по обжитому контуру состояние совпадает с эталонным", async () => {
    const reference = await readState();
    const storeId = DEMO.stores[0]?.id ?? "";
    const strayStation = randomUUID();
    await db.insert(stations).values({
      id: strayStation,
      storeId,
      name: "Manager desk",
      code: uniqueStationCode(),
    });
    const checklistId = await createChecklist({ stationId: strayStation });
    await createPublishedVersion(checklistId, sampleSections("показ"));

    await seedDemo({ now: NOW });

    expect(await readState()).toStrictEqual(reference);
  });
});

describe("сид отказывает понятным текстом", () => {
  test("называет заполнение рабочей станции, сделанное по версии демо-чек-листа", async () => {
    await seedDemo({ now: NOW });
    const foreign = await createStation();
    const versionId = DEMO.checklists[0]?.versions[0]?.id ?? "";
    const submissionId = randomUUID();
    await db.insert(submissions).values({
      id: submissionId,
      versionId,
      stationId: foreign.stationId,
      snapshot: [],
      answers: [],
      startedAt: NOW,
    });

    try {
      const failure = await seedDemo({ now: NOW }).catch(
        (error: unknown) => error,
      );

      expect(failure).toBeInstanceOf(Error);
      const text = failure instanceof Error ? failure.message : "";
      // Человеку должно быть названо И что мешает, И что с этим делать.
      expect(text).toContain(submissionId);
      expect(text).toContain(foreign.stationId);
      expect(text).toMatch(/заполнени/i);
      expect(text).not.toMatch(/DrizzleQueryError/);
    } finally {
      await db.delete(submissions).where(eq(submissions.id, submissionId));
    }
  });
});
