// Миграция 0012 («одно заполнение — одна запись») на базе, где повторы уже лежат.
//
// До неё гонка одновременных отправок могла завести две записи одного заполнения, и
// на живой базе такие пары могут быть. Уникальный индекс на них упал бы, а упавшая
// миграция — это продукт, который не поднимается после раскатки. Удалить лишнюю запись
// миграция не вправе (принцип 3): она помечает поздние записи и выводит их из-под
// правила, не трогая ни одного ответа. Здесь проверяется ровно это обещание.
//
// Проверка идёт на выброшенной базе: на общей тестовой базе миграции уже накатаны, а
// откатывать их там значит выбить почву из-под параллельных файлов тестов.
import { randomUUID } from "node:crypto";

import { Pool } from "pg";
import { afterAll, beforeAll, expect, test } from "vitest";

import { applyMigrations, rollbackLastMigration } from "./migrator";
import { dropDatabase, ensureDatabase } from "./testing/admin";
import { testDatabaseUrl } from "./testing/db";
import { PG_UNIQUE_VIOLATION, dbErrorCode } from "./testing/errors";
import { uniqueStationCode } from "./testing/fixtures";

const GUARD_MIGRATION = "0012_submission_repeat_guard";

/**
 * Откатывает миграции, пока не снимется названная. Раньше здесь стоял один откат
 * «последней» — и проверка падала на ровном месте, как только в продукте появилась
 * следующая миграция (0013, привязка планшета). Состояние, которое нужно этому файлу,
 * называется «до правила 0012», а не «на одну миграцию назад».
 */
async function rollbackDownTo(target: string): Promise<string> {
  for (;;) {
    const rolled = await rollbackLastMigration(pool);
    if (rolled === null) {
      throw new Error(
        `Миграция ${target} не нашлась: откатывать больше нечего`,
      );
    }
    if (rolled === target) return rolled;
  }
}

const FIRST_START = "2026-09-10T08:00:00Z";
const SECOND_START = "2026-09-10T09:00:00Z";
const TIED_START = "2026-09-10T10:00:00Z";
const OWN_START = "2026-09-10T11:00:00Z";

const url = new URL(testDatabaseUrl());
url.pathname = `/repeat_guard_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
let pool: Pool;
let target: { versionId: string; stationId: string };

/** Всё, что человек читает в записи заполнения, — без пометки повтора. */
const FILLING_COLUMNS =
  "id, version_id, station_id, snapshot, answers, mode, started_at, submitted_at";

async function publishedVersion(): Promise<{
  versionId: string;
  stationId: string;
}> {
  const result = await pool.query<{ version_id: string; station_id: string }>(
    `with country as (
       insert into countries (name, locale) values ('Страна', 'ru') returning id
     ), store as (
       insert into stores (country_id, name, timezone)
       select id, 'Пиццерия', 'UTC' from country returning id
     ), station as (
       insert into stations (store_id, name, code)
       select id, 'Станция', $1 from store returning id
     ), checklist as (
       insert into checklists (station_id, title, window_start, window_end)
       select id, '{"ru": "Чек-лист", "en": "Checklist"}', '06:00', '12:00' from station
       returning id, station_id
     ), version as (
       insert into checklist_versions
         (checklist_id, status, version_number, station_id, sections, published_at)
       select id, 'published', 1, station_id, '[]', now() from checklist
       returning id, station_id
     )
     select id as version_id, station_id from version`,
    [uniqueStationCode()],
  );
  const row = result.rows[0];
  if (row === undefined) throw new Error("Версия не завелась");
  return { versionId: row.version_id, stationId: row.station_id };
}

/** Запись заполнения мимо кода продукта — так, как её оставила бы гонка. */
async function insertFilling(
  startedAt: string,
  submittedAt: string,
  answer: string,
): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `insert into submissions
       (version_id, station_id, snapshot, answers, started_at, submitted_at)
     values ($1, $2, '[]', $3, $4, $5)
     returning id`,
    [
      target.versionId,
      target.stationId,
      JSON.stringify([{ itemId: answer, value: true, at: 0 }]),
      startedAt,
      submittedAt,
    ],
  );
  const row = result.rows[0];
  if (row === undefined) throw new Error("Заполнение не легло");
  return row.id;
}

async function fillings(): Promise<Record<string, unknown>[]> {
  const result = await pool.query<Record<string, unknown>>(
    `select ${FILLING_COLUMNS} from submissions order by id`,
  );
  return result.rows;
}

beforeAll(async () => {
  await ensureDatabase(url);
  pool = new Pool({ connectionString: url.toString() });
  await applyMigrations(pool);
  // База в состоянии «до правила»: накатано всё, кроме самой миграции 0012.
  expect(await rollbackDownTo(GUARD_MIGRATION)).toBe(GUARD_MIGRATION);
  target = await publishedVersion();
});

afterAll(async () => {
  await pool.end();
  await dropDatabase(url);
});

test("миграция накатывается поверх повторов и не меняет ни одной записи", async () => {
  // Три записи одного заполнения, две — другого с одинаковым временем отправки
  // (гонка внутри одной миллисекунды), и одно заполнение без повторов.
  const first = await insertFilling(FIRST_START, "2026-09-10T08:10:00Z", "a");
  const firstAgain = await insertFilling(
    FIRST_START,
    "2026-09-10T08:10:01Z",
    "b",
  );
  const firstThird = await insertFilling(
    FIRST_START,
    "2026-09-10T08:10:02Z",
    "c",
  );
  const second = await insertFilling(SECOND_START, "2026-09-10T09:10:00Z", "d");
  const tiedA = await insertFilling(TIED_START, "2026-09-10T10:10:00Z", "e");
  const tiedB = await insertFilling(TIED_START, "2026-09-10T10:10:00Z", "f");
  const before = await fillings();

  await applyMigrations(pool);

  expect(await fillings()).toStrictEqual(before);
  const marks = await pool.query<{ id: string; duplicate: boolean }>(
    "select id, duplicate from submissions",
  );
  const marked = new Set(
    marks.rows.filter((row) => row.duplicate).map((row) => row.id),
  );
  expect(marked.has(first)).toBe(false);
  expect(marked.has(firstAgain)).toBe(true);
  expect(marked.has(firstThird)).toBe(true);
  expect(marked.has(second)).toBe(false);
  // При равном времени отправки ранней считается запись с меньшим id — ровно одна.
  const [tiedEarlier, tiedLater] = [tiedA, tiedB].sort();
  expect(marked.has(tiedEarlier ?? "")).toBe(false);
  expect(marked.has(tiedLater ?? "")).toBe(true);
  expect(marked.size).toBe(3);
});

test("после миграции новый повтор отвергается, а новое заполнение ложится", async () => {
  const repeatOfFirst = await dbErrorCode(
    insertFilling(FIRST_START, "2026-09-18T08:00:00Z", "g"),
  );
  const repeatOfSecond = await dbErrorCode(
    insertFilling(SECOND_START, "2026-09-18T08:00:00Z", "h"),
  );
  const ownFilling = await dbErrorCode(
    insertFilling(OWN_START, "2026-09-18T08:00:00Z", "i"),
  );

  expect(repeatOfFirst).toBe(PG_UNIQUE_VIOLATION);
  expect(repeatOfSecond).toBe(PG_UNIQUE_VIOLATION);
  expect(ownFilling).toBeUndefined();
});

test("откат снимает правило и пометку, а записи оставляет", async () => {
  const before = await fillings();

  expect(await rollbackDownTo(GUARD_MIGRATION)).toBe(GUARD_MIGRATION);

  expect(await fillings()).toStrictEqual(before);
  const columns = await pool.query(
    "select 1 from information_schema.columns where table_name = 'submissions' and column_name = 'duplicate'",
  );
  expect(columns.rowCount).toBe(0);
});
