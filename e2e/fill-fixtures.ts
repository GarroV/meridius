// Данные для сквозных сценариев публичного экрана заполнения.
//
// Станция заводится прямо в базе, а не через экраны админки: сценарию нужна цель для
// сканирования, а не проверка чужого блока. Код станции у каждого сценария свой —
// файлы сценариев идут параллельно, и общая станция роняла бы соседа.
import { randomUUID } from "node:crypto";

import { Pool } from "pg";

import { e2eDatabaseUrl } from "./database";

export interface FillStand {
  readonly code: string;
  readonly stationId: string;
  readonly versionId: string;
  readonly stationName: string;
  readonly storeName: string;
}

export interface FillStandOptions {
  /** Окно чек-листа. По умолчанию — круглосуточное: сценарий не должен зависеть от часа прогона. */
  readonly windowStart?: string;
  readonly windowEnd?: string;
  /**
   * Язык страны — он же язык экрана (D122): его задаёт пиццерия, а не телефон.
   * По умолчанию английский, как и весь остальной продукт (D083), поэтому сценарий,
   * которому язык безразличен, читает те же английские надписи, что и раньше.
   * Сценарий про сам язык называет его явно.
   */
  readonly countryLocale?: "ru" | "en";
  /**
   * Часовой пояс пиццерии. По умолчанию UTC — сценариям, которые о времени не
   * спрашивают, так проще. Сценарию про время кухни нужен пояс, заведомо не равный
   * поясу машины прогона и поясу браузера.
   */
  readonly timezone?: string;
  /** Свои секции вместо эталонных: нужны сценарию обходов с расписанием пункта. */
  readonly sections?: unknown;
}

/** Пункты чек-листа те же, что на экранном эталоне: логический, числовой, критичные и текст. */
export const STAND_SECTIONS = [
  {
    id: "s-oven",
    title: { ru: "Печь и оборудование", en: "Oven and equipment" },
    source: "own",
    items: [
      {
        id: "i-oven",
        title: {
          ru: "Включить печь и вытяжку",
          en: "Turn on the oven and the hood",
        },
        type: "bool",
        critical: false,
      },
      {
        id: "i-fry",
        title: {
          ru: "Измерить температуру фритюра",
          en: "Measure the fryer temperature",
        },
        type: "number",
        critical: false,
        min: 160,
        max: 180,
      },
      {
        id: "i-sauce",
        title: {
          ru: "Проверить наклейки на соусах",
          en: "Check labels on the sauces",
        },
        type: "bool",
        critical: true,
      },
    ],
  },
  {
    id: "s-fridge",
    title: { ru: "Холодильники", en: "Refrigerators" },
    source: "own",
    items: [
      {
        id: "i-note",
        title: { ru: "Заметка по смене", en: "Shift note" },
        type: "text",
        critical: false,
      },
    ],
  },
] as const;

function uniqueCode(): string {
  return randomUUID().replaceAll("-", "").slice(0, 10);
}

async function withPool<T>(work: (pool: Pool) => Promise<T>): Promise<T> {
  const pool = new Pool({ connectionString: e2eDatabaseUrl() });
  try {
    return await work(pool);
  } finally {
    await pool.end();
  }
}

function firstId(rows: { id: string }[], what: string): string {
  const id = rows[0]?.id;
  if (id === undefined) throw new Error(`Строка не вставилась: ${what}`);
  return id;
}

/** Страна → пиццерия → станция → опубликованная версия чек-листа этой станции. */
export async function seedFillStand(
  label: string,
  options: FillStandOptions = {},
): Promise<FillStand> {
  const suffix = randomUUID().slice(0, 8);
  const stationName = `Kitchen ${suffix}`;
  const storeName = `Almaty, Abaya ${suffix}`;
  const code = uniqueCode();

  return await withPool(async (pool) => {
    const country = firstId(
      (
        await pool.query<{ id: string }>(
          "insert into countries (name, locale) values ($1, $2) returning id",
          [`Страна ${label} ${suffix}`, options.countryLocale ?? "en"],
        )
      ).rows,
      "countries",
    );
    const store = firstId(
      (
        await pool.query<{ id: string }>(
          "insert into stores (country_id, name, timezone) values ($1, $2, $3) returning id",
          [country, storeName, options.timezone ?? "UTC"],
        )
      ).rows,
      "stores",
    );
    const station = firstId(
      (
        await pool.query<{ id: string }>(
          "insert into stations (store_id, name, code) values ($1, $2, $3) returning id",
          [store, stationName, code],
        )
      ).rows,
      "stations",
    );
    const checklist = firstId(
      (
        await pool.query<{ id: string }>(
          `insert into checklists (station_id, title, window_start, window_end)
           values ($1, $2::jsonb, $3, $4) returning id`,
          [
            station,
            JSON.stringify({ ru: "Открытие кухни", en: "Kitchen opening" }),
            options.windowStart ?? "00:00:00",
            options.windowEnd ?? "23:59:00",
          ],
        )
      ).rows,
      "checklists",
    );
    const version = firstId(
      (
        await pool.query<{ id: string }>(
          `insert into checklist_versions
             (checklist_id, status, version_number, station_id, sections, published_at)
           values ($1, 'published', 1, $2, $3::jsonb, now()) returning id`,
          [
            checklist,
            station,
            JSON.stringify(options.sections ?? STAND_SECTIONS),
          ],
        )
      ).rows,
      "checklist_versions",
    );

    return {
      code,
      stationId: station,
      versionId: version,
      stationName,
      storeName,
    };
  });
}

export interface StoredSubmission {
  readonly versionId: string;
  readonly stationId: string;
  readonly answers: { itemId: string; value: unknown; comment?: string }[];
  readonly snapshotItemIds: string[];
  /** Время сервера, как оно легло в базу: по нему считается ожидаемое время на экране. */
  readonly submittedAt: Date;
}

/** Что легло в базу: сценарий обязан доказать запись, а не поверить экрану «отправлено». */
export async function lastSubmission(
  stationId: string,
): Promise<StoredSubmission | null> {
  return await withPool(async (pool) => {
    const { rows } = await pool.query<{
      version_id: string;
      station_id: string;
      answers: StoredSubmission["answers"];
      snapshot: { items: { id: string }[] }[];
      submitted_at: Date;
    }>(
      `select version_id, station_id, answers, snapshot, submitted_at from submissions
       where station_id = $1 order by submitted_at desc, id desc limit 1`,
      [stationId],
    );
    const row = rows[0];
    if (row === undefined) return null;
    return {
      versionId: row.version_id,
      stationId: row.station_id,
      answers: row.answers,
      snapshotItemIds: row.snapshot.flatMap((section) =>
        section.items.map((item) => item.id),
      ),
      submittedAt: row.submitted_at,
    };
  });
}

/** Публикует следующую версию того же чек-листа — гонка с заполняющим сотрудником (T041). */
export async function publishNextVersion(stationId: string): Promise<string> {
  return await withPool(async (pool) => {
    await pool.query(
      `update checklist_versions set status = 'archived'
       where station_id = $1 and status = 'published'`,
      [stationId],
    );
    const { rows } = await pool.query<{ id: string }>(
      `insert into checklist_versions
         (checklist_id, status, version_number, station_id, sections, published_at)
       select id, 'published', 2, $1, '[]'::jsonb, now() from checklists where station_id = $1
       returning id`,
      [stationId],
    );
    return firstId(rows, "следующая версия");
  });
}

export interface SecondChecklistOptions {
  readonly title: { ru: string; en: string };
  readonly windowStart?: string;
  readonly windowEnd?: string;
  readonly sections?: unknown;
}

/**
 * Второй чек-лист на ТОЙ ЖЕ станции, открытый в то же время. Так живёт настоящая
 * пиццерия: обход идёт весь день поверх открытия и закрытия смены, и станция обязана
 * показать оба, а не первый по началу окна (#60).
 */
export async function addChecklistToStation(
  stationId: string,
  options: SecondChecklistOptions,
): Promise<{ checklistId: string; versionId: string }> {
  return await withPool(async (pool) => {
    const checklistId = firstId(
      (
        await pool.query<{ id: string }>(
          `insert into checklists (station_id, title, window_start, window_end)
           values ($1, $2::jsonb, $3, $4) returning id`,
          [
            stationId,
            JSON.stringify(options.title),
            options.windowStart ?? "00:00:00",
            options.windowEnd ?? "23:59:00",
          ],
        )
      ).rows,
      "второй чек-лист",
    );
    const versionId = firstId(
      (
        await pool.query<{ id: string }>(
          `insert into checklist_versions
             (checklist_id, status, version_number, station_id, sections, published_at)
           values ($1, 'published', 1, $2, $3::jsonb, now()) returning id`,
          [
            checklistId,
            stationId,
            JSON.stringify(options.sections ?? STAND_SECTIONS),
          ],
        )
      ).rows,
      "версия второго чек-листа",
    );
    return { checklistId, versionId };
  });
}

/**
 * Настоящая станция, которой сейчас заполнять нечего: страна, пиццерия, наклейка —
 * и ни одного опубликованного чек-листа. Нужна сценарию про язык отбивки: она видна
 * человеку с действующей наклейкой, и по D122 говорит языком пиццерии, а не телефона.
 *
 * Отдельный сеятель, а не узкое окно у `seedFillStand`: окно закрывается по часам
 * прогона, и такой сценарий зеленел бы или краснел в зависимости от времени суток.
 */
export async function seedStationWithoutChecklist(
  label: string,
  countryLocale: "ru" | "en",
): Promise<{ code: string }> {
  const suffix = randomUUID().slice(0, 8);
  const code = uniqueCode();

  return await withPool(async (pool) => {
    const country = firstId(
      (
        await pool.query<{ id: string }>(
          "insert into countries (name, locale) values ($1, $2) returning id",
          [`Страна ${label} ${suffix}`, countryLocale],
        )
      ).rows,
      "countries",
    );
    const store = firstId(
      (
        await pool.query<{ id: string }>(
          "insert into stores (country_id, name, timezone) values ($1, $2, $3) returning id",
          [country, `Almaty, Abaya ${suffix}`, "UTC"],
        )
      ).rows,
      "stores",
    );
    await pool.query(
      "insert into stations (store_id, name, code) values ($1, $2, $3)",
      [store, `Kitchen ${suffix}`, code],
    );
    return { code };
  });
}
