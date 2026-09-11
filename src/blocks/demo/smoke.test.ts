// Уборка за сквозным смоуком (T089) на настоящей базе. Заглушки здесь бессмысленны:
// весь смысл уборки в том, что после прогона в базе НЕ ОСТАЁТСЯ строк, а «не осталось»
// проверяется только запросом к базе.
//
// Отдельная беда, ради которой задача и заведена: `checklists.station_id` объявлен
// `on delete set null` (история чек-листа переживает удаление станции). Поэтому уборка
// «по имени страны» станцию сносит, а чек-лист оставляет — уже без станции, то есть
// не находимым ни по стране, ни в справочнике. Такие остатки копились молча: 07.09.2026
// их набралось восемь при трёх настоящих. Проверка «забирает и отвязанный чек-лист»
// написана ровно на этот случай и падает, если уборка снова возьмёт только один слой.
//
// Демонстрационный контур здесь НЕ сажается, хотя проверять хочется именно на нём.
// Причина: тестовая база одна на весь прогон, а файлы vitest идут параллельно — сид
// контура из двух файлов сразу снимает строки друг у друга (проверено: `seed.test.ts`
// падал на внешнем ключе, пока этот файл тоже звал `seedDemo`). Поэтому здесь только
// свои строки со случайной меткой, а сверка переписи с контуром проверяется как чистая
// функция (`contourCensus`/`censusDifferences`); на настоящем стенде её проходит сам
// смоук — `scripts/mvp-smoke.mjs` сверяет базу с контуром до и после себя.
import { randomUUID } from "node:crypto";

import { and, eq, isNull, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, test } from "vitest";

import type { Section } from "@/blocks/data";
import {
  checklistVersions,
  checklists,
  countries,
  stations,
  storeShiftModes,
  stores,
  submissions,
} from "@/blocks/data";
import { getTestDb, closeTestDb } from "@/blocks/data/testing/db";

import { DEMO } from "./dataset";
import type { DemoDataset } from "./model";
import {
  SMOKE_MARKER,
  censusDifferences,
  contourCensus,
  countDetachedChecklists,
  readCensus,
  smokeNames,
  sweepSmokeRuns,
} from "./smoke";

const AT = new Date("2026-09-01T12:00:00.000Z");

const db = getTestDb();

const SECTIONS: Section[] = [
  {
    id: "s-smoke",
    title: { en: "Smoke section" },
    source: "own",
    items: [
      {
        id: "i-smoke",
        title: { en: "Smoke item" },
        type: "bool",
        severity: "critical",
      },
    ],
  },
];

interface Run {
  readonly countryId: string;
  readonly storeId: string;
  readonly stationId: string;
  readonly checklistId: string;
  readonly versionId: string;
  readonly submissionId: string;
}

function code(): string {
  return randomUUID().replaceAll("-", "").slice(0, 10);
}

function only(rows: { id: string }[]): string {
  const id = rows[0]?.id;
  if (id === undefined) throw new Error("строка не вставилась");
  return id;
}

/**
 * Строки одного прогона — заведённые напрямую, а не браузером: проверяется уборка,
 * а не сам сценарий, и поднимать ради этого продукт незачем. Имена берутся у той же
 * функции, которой их берёт смоук, — иначе проверялась бы уборка за выдуманными данными.
 */
async function seedRun(names: {
  country: string;
  store: string;
  station: string;
  checklist: string;
}): Promise<Run> {
  const countryId = only(
    await db
      .insert(countries)
      .values({ name: names.country, locale: "en" })
      .returning({ id: countries.id }),
  );
  const storeId = only(
    await db
      .insert(stores)
      .values({ countryId, name: names.store, timezone: "UTC" })
      .returning({ id: stores.id }),
  );
  const stationId = only(
    await db
      .insert(stations)
      .values({ storeId, name: names.station, code: code() })
      .returning({ id: stations.id }),
  );
  const checklistId = only(
    await db
      .insert(checklists)
      .values({
        stationId,
        title: { en: names.checklist },
        windowStart: "06:00",
        windowEnd: "12:00",
      })
      .returning({ id: checklists.id }),
  );
  const versionId = only(
    await db
      .insert(checklistVersions)
      .values({
        checklistId,
        stationId,
        versionNumber: 1,
        status: "published",
        sections: SECTIONS,
        publishedAt: AT,
      })
      .returning({ id: checklistVersions.id }),
  );
  const submissionId = only(
    await db
      .insert(submissions)
      .values({
        versionId,
        stationId,
        snapshot: SECTIONS,
        answers: [{ itemId: "i-smoke", value: false, at: AT.getTime() }],
        startedAt: AT,
        submittedAt: AT,
      })
      .returning({ id: submissions.id }),
  );

  return {
    countryId,
    storeId,
    stationId,
    checklistId,
    versionId,
    submissionId,
  };
}

/** Прогон смоука со случайной меткой прогона — как его заводит сам смоук. */
async function seedSmokeRun(): Promise<Run> {
  return seedRun(smokeNames(randomUUID().slice(0, 5)));
}

/** Точно такой же набор строк, но БЕЗ метки: уборка не имеет права его тронуть. */
async function seedForeignRun(): Promise<Run> {
  const label = randomUUID().slice(0, 5);
  return seedRun({
    country: `Country ${label}`,
    store: `Store ${label}`,
    station: `Station ${label}`,
    checklist: `Kitchen opening ${label}`,
  });
}

async function exists(
  table: typeof countries | typeof checklists | typeof submissions,
  id: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: table.id })
    .from(table)
    .where(eq(table.id, id));
  return rows.length === 1;
}

/**
 * Сколько отвязанных чек-листов ПРОГОНА лежит в базе. Метка в условии обязательна,
 * а не для красоты: `countDetachedChecklists` считает отвязанные чек-листы всей базы,
 * и на тестовой базе это число живёт своей жизнью — соседние файлы идут параллельно
 * и заводят чек-листы без станции десятками (`Checklist <id>`, `… (copy)` в редакторе
 * и библиотеке, `detachChecklist` в справочнике). Поэтому сравнивать общее число
 * «до» и «после» нельзя: уборка снимает свой чек-лист, сосед в ту же миллисекунду
 * заводит свой, и проверка падает на ровном месте — `expected 60 to be 59`.
 * Воспроизведено принудительно: при вставке отвязанного чек-листа раз в 5 мс тест
 * падал 3 раза из 3, и всегда на числе ровно на единицу больше ожидаемого, тогда как
 * снятие самого чек-листа было верным. Общее число остаётся у смоука на стенде, где
 * в базе только демо-контур и никто, кроме смоука, в неё не пишет.
 */
async function detachedSmokeChecklists(): Promise<number> {
  const rows = await db
    .select({ id: checklists.id })
    .from(checklists)
    .where(
      and(
        isNull(checklists.stationId),
        sql`${checklists.title}::text like ${`%${SMOKE_MARKER}%`}`,
      ),
    );
  return rows.length;
}

afterAll(async () => {
  await closeTestDb();
});

describe("уборка за сквозным смоуком", () => {
  beforeEach(async () => {
    // Чистый лист: соседний тест мог оставить свои строки, и тогда счётчики снятого
    // считали бы чужое.
    await sweepSmokeRuns();
  });

  test("метку смоука несут все имена прогона: по ней уборка и находит своё", () => {
    const names = smokeNames("abc12");

    expect(Object.values(names)).toHaveLength(4);
    for (const name of Object.values(names)) {
      expect(name).toContain(SMOKE_MARKER);
      expect(name).toContain("abc12");
    }
  });

  test("снимает строки прогона целиком: страна, пиццерия, станция, чек-лист, версия, заполнение", async () => {
    const run = await seedSmokeRun();

    const swept = await sweepSmokeRuns();

    expect(swept).toMatchObject({
      countries: 1,
      stores: 1,
      stations: 1,
      checklists: 1,
      versions: 1,
      submissions: 1,
    });
    expect(await exists(countries, run.countryId)).toBe(false);
    expect(await exists(checklists, run.checklistId)).toBe(false);
    expect(await exists(submissions, run.submissionId)).toBe(false);
  });

  test("забирает и чек-лист, отвязанный от станции: ровно тот остаток, который копился молча", async () => {
    const run = await seedSmokeRun();
    // Уборка прошлого образца — «по имени страны»: заполнения и версии сняты, станция
    // и пиццерия снесены, а чек-лист остался и отвязался сам (`on delete set null`).
    await db
      .delete(submissions)
      .where(eq(submissions.stationId, run.stationId));
    await db
      .delete(checklistVersions)
      .where(eq(checklistVersions.checklistId, run.checklistId));
    await db.delete(stations).where(eq(stations.id, run.stationId));
    await db.delete(stores).where(eq(stores.id, run.storeId));
    await db.delete(countries).where(eq(countries.id, run.countryId));

    expect(await exists(checklists, run.checklistId)).toBe(true);
    expect(await detachedSmokeChecklists()).toBe(1);
    // Общий счётчик смоука видит тот же чек-лист: он и объясняет на стенде, почему
    // чек-листов в базе больше, чем в контуре. Сравнение только «не меньше»: на общей
    // тестовой базе отвязанные чек-листы заводят и снимают параллельные файлы.
    expect(await countDetachedChecklists()).toBeGreaterThanOrEqual(1);

    const swept = await sweepSmokeRuns();

    expect(swept.checklists).toBe(1);
    expect(await exists(checklists, run.checklistId)).toBe(false);
    expect(await detachedSmokeChecklists()).toBe(0);
  });

  test("чужих строк не касается: без метки остаётся всё, включая чек-лист", async () => {
    const foreign = await seedForeignRun();
    await seedSmokeRun();

    const swept = await sweepSmokeRuns();

    expect(swept.countries).toBe(1);
    expect(await exists(countries, foreign.countryId)).toBe(true);
    expect(await exists(checklists, foreign.checklistId)).toBe(true);
    expect(await exists(submissions, foreign.submissionId)).toBe(true);

    // За собой прибираем: файл делит базу с соседними прогонами.
    await db
      .delete(submissions)
      .where(eq(submissions.id, foreign.submissionId));
    await db
      .delete(checklistVersions)
      .where(eq(checklistVersions.id, foreign.versionId));
    await db.delete(checklists).where(eq(checklists.id, foreign.checklistId));
    await db.delete(stations).where(eq(stations.id, foreign.stationId));
    await db.delete(stores).where(eq(stores.id, foreign.storeId));
    await db.delete(countries).where(eq(countries.id, foreign.countryId));
  });

  test("режим смены прогона снимается вместе с пиццерией: иначе внешний ключ не пустит", async () => {
    const run = await seedSmokeRun();
    await db.insert(storeShiftModes).values({
      storeId: run.storeId,
      localDate: "2026-09-01",
      mode: "reduced",
      staffPresent: 2,
      staffExpected: 4,
    });

    const swept = await sweepSmokeRuns();

    expect(swept.shiftModes).toBe(1);
    expect(swept.stores).toBe(1);
    expect(await exists(countries, run.countryId)).toBe(false);
  });

  test("повторная уборка не снимает ничего: прогон убран ровно один раз", async () => {
    await seedSmokeRun();
    expect((await sweepSmokeRuns()).total).toBeGreaterThan(0);

    expect((await sweepSmokeRuns()).total).toBe(0);
  });

  test("перепись базы отвечает по всем таблицам контура", async () => {
    // Настоящая сверка переписи с контуром идёт на стенде, внутри смоука: тестовая база
    // общая для параллельных файлов, и её строки контуру не равны никогда. Здесь
    // проверяется только то, что запрос отвечает по каждой таблице и считает целые.
    const census = await readCensus();

    expect(Object.keys(census).sort()).toStrictEqual(
      Object.keys(contourCensus(DEMO)).sort(),
    );
    for (const value of Object.values(census)) {
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("перепись контура", () => {
  test("считается из описания контура, а не записана числами", () => {
    expect(contourCensus(DEMO)).toStrictEqual({
      countries: 1,
      stores: DEMO.stores.length,
      stations: DEMO.stations.length,
      blocks: DEMO.blocks.length,
      checklists: DEMO.checklists.length,
      // Версии = черновик на каждый чек-лист плюс все опубликованные и архивные.
      versions:
        DEMO.checklists.length +
        DEMO.checklists.reduce(
          (total, checklist) => total + checklist.versions.length,
          0,
        ),
      submissions: DEMO.submissions.length,
      shiftModes: DEMO.shiftModes.length,
    });
  });

  test("растёт вместе с описанием: добавленное заполнение поднимает ожидание", () => {
    const bigger: DemoDataset = {
      ...DEMO,
      submissions: [...DEMO.submissions, ...DEMO.submissions.slice(0, 1)],
    };

    expect(contourCensus(bigger).submissions).toBe(
      contourCensus(DEMO).submissions + 1,
    );
  });

  test("совпадение переписи с контуром расхождений не даёт", () => {
    expect(censusDifferences(contourCensus(DEMO), contourCensus(DEMO))).toEqual(
      [],
    );
  });

  test("лишняя строка названа таблицей и обоими числами", () => {
    const expected = contourCensus(DEMO);
    const actual = { ...expected, checklists: expected.checklists + 8 };

    const differences = censusDifferences(actual, expected);

    expect(differences).toHaveLength(1);
    expect(differences[0]).toContain("чек-листов");
    expect(differences[0]).toContain(String(expected.checklists + 8));
    expect(differences[0]).toContain(String(expected.checklists));
  });

  test("потерянная строка контура ловится тоже: расхождение читается в обе стороны", () => {
    const expected = contourCensus(DEMO);
    const actual = { ...expected, submissions: expected.submissions - 1 };

    const differences = censusDifferences(actual, expected);

    expect(differences).toHaveLength(1);
    expect(differences[0]).toContain("заполнений");
  });
});
