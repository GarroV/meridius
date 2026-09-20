// Черновик чек-листа: заведение, свойства (название, станция, окно) и сохранение разметки.
//
// Черновик — отдельная строка версии со статусом `draft`; правило «один черновик на чек-лист»
// держит частичный уникальный индекс базы, поэтому сохранение идёт вставкой с разрешением
// конфликта по этому индексу, а не последовательностью «посмотрел — вставил».
//
// Опубликованных версий здесь не касается ничто: правка черновика не меняет ни одной
// строки, на которую ссылаются заполнения (принцип 3, D002).
import { randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";

import type {
  Checklist,
  LocalizedText,
  Section,
  VersionStatus,
} from "@/blocks/data";
import {
  checklistVersions,
  checklists,
  countries,
  getDb,
  stations,
  stores,
} from "@/blocks/data";

import type { LibraryEntry } from "./library-links";
import { listLibrary, resolveLinkedSections } from "./library-links";
import { STATION_LOCAL_TIME } from "./station-clock";
import {
  EditorInputError,
  isUuid,
  parseRequiredText,
  parseWindow,
} from "./validation";

/** Окно времени так, как его вводят на экране: «06:00» и «11:00». */
interface EditorWindow {
  start: string;
  end: string;
}

export interface ChecklistInput {
  stationId: string | null;
  title: LocalizedText;
  window: EditorWindow;
}

/** Станция чек-листа вместе с путём до неё: страна → пиццерия → станция. */
export interface EditorStation {
  id: string;
  name: string;
  storeName: string;
  countryName: string;
  /**
   * Сколько сейчас на ТОЙ кухне, «11:30». Живёт рядом со станцией, а не отдельным
   * полем состояния: без станции нет пиццерии, а без пиццерии нет и часов — и
   * подсказка об окне обязана молчать, а не считать по часам методиста (T275).
   * `null` — часовой пояс пиццерии прочитать не удалось.
   */
  localTime: string | null;
}

export interface VersionSummary {
  id: string;
  status: VersionStatus;
  versionNumber: number | null;
  publishedAt: Date | null;
  itemCount: number;
  submissionCount: number;
}

/** Всё, что нужно экрану редактора за один заход. */
export interface EditorState {
  checklist: Checklist;
  station: EditorStation | null;
  sections: Section[];
  versions: VersionSummary[];
  library: LibraryEntry[];
}

/**
 * Новый чек-лист открывается готовым к печати: одна пустая секция и один пустой пункт.
 * Пустой экран с кнопкой «добавить секцию» — это два лишних касания на каждом заведении,
 * а редактор меряется минутами (принцип 5).
 */
function starterSections(): Section[] {
  return [
    {
      id: randomUUID(),
      title: {},
      source: "own",
      items: [
        { id: randomUUID(), title: {}, type: "bool", severity: "normal" },
      ],
    },
  ];
}

function requireChecklistId(checklistId: string): void {
  if (!isUuid(checklistId)) {
    throw new EditorInputError("notFound", `Чек-листа ${checklistId} нет`);
  }
}

async function checklistExists(checklistId: string): Promise<boolean> {
  const rows = await getDb()
    .select({ id: checklists.id })
    .from(checklists)
    .where(eq(checklists.id, checklistId))
    .limit(1);
  return rows.length > 0;
}

function checklistValues(input: ChecklistInput): {
  title: LocalizedText;
  stationId: string | null;
  windowStart: string;
  windowEnd: string;
} {
  const window = parseWindow(input.window.start, input.window.end);
  const stationId =
    input.stationId === null || input.stationId === "" ? null : input.stationId;
  if (stationId !== null && !isUuid(stationId)) {
    throw new EditorInputError("badFormat", "Непонятная станция");
  }
  return {
    title: parseRequiredText(input.title),
    stationId,
    windowStart: window.start,
    windowEnd: window.end,
  };
}

/** Заводит чек-лист вместе с черновиком: за один заход, без промежуточного «сохранить». */
export async function createChecklist(input: ChecklistInput): Promise<string> {
  const values = checklistValues(input);

  return getDb().transaction(async (tx) => {
    const inserted = await tx
      .insert(checklists)
      .values(values)
      .returning({ id: checklists.id });
    const checklist = inserted[0];
    if (checklist === undefined) {
      throw new Error("Чек-лист не вставился");
    }

    await tx.insert(checklistVersions).values({
      checklistId: checklist.id,
      status: "draft",
      sections: starterSections(),
    });
    return checklist.id;
  });
}

/** Свойства чек-листа: название, станция, окно. Версий не касается. */
export async function updateChecklist(
  checklistId: string,
  input: ChecklistInput,
): Promise<void> {
  requireChecklistId(checklistId);
  const values = checklistValues(input);

  const updated = await getDb()
    .update(checklists)
    .set(values)
    .where(eq(checklists.id, checklistId))
    .returning({ id: checklists.id });
  if (updated.length === 0) {
    throw new EditorInputError("notFound", `Чек-листа ${checklistId} нет`);
  }
}

/**
 * Сохраняет разметку в черновик. Вставленные блоки библиотеки освежаются: рядом со ссылкой
 * лежит снимок пунктов блока на момент сохранения, и он же уедет в версию при публикации.
 */
export async function saveDraft(
  checklistId: string,
  sections: Section[],
): Promise<void> {
  requireChecklistId(checklistId);
  if (!(await checklistExists(checklistId))) {
    throw new EditorInputError("notFound", `Чек-листа ${checklistId} нет`);
  }

  const refreshed = await resolveLinkedSections(sections);

  // Разрешение конфликта по частичному индексу «один черновик»: две одновременные
  // записи дают одну строку, а не отказ и не второй черновик.
  await getDb()
    .insert(checklistVersions)
    .values({ checklistId, status: "draft", sections: refreshed })
    .onConflictDoUpdate({
      target: checklistVersions.checklistId,
      targetWhere: eq(checklistVersions.status, "draft"),
      set: { sections: refreshed },
    });
}

// Строка сырого запроса. Наследование от Record<string, unknown> — требование
// db.execute: без индексной сигнатуры тип не проходит его ограничение.
interface VersionRow extends Record<string, unknown> {
  id: string;
  status: VersionStatus;
  version_number: number | null;
  published_at: string | null;
  item_count: string;
  submission_count: string;
}

/**
 * Сводка версий для правой колонки. Пункты и заполнения считает база: тянуть на экран
 * разметку всех версий чек-листа ради двух чисел — это десятки килобайт на каждый заход.
 */
async function versionSummaries(
  checklistId: string,
): Promise<VersionSummary[]> {
  const rows = await getDb().execute<VersionRow>(sql`
    select v.id::text as id, v.status, v.version_number,
      -- Время отдаётся в ISO строкой: сырой timestamptz из execute() приходит текстом
      -- вида «2026-08-17 15:25:59.392272+00», и на экране он оказался бы таким же.
      to_char(v.published_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as published_at,
      (select coalesce(sum(jsonb_array_length(s->'items')), 0)
         from jsonb_array_elements(v.sections) s) as item_count,
      (select count(*) from submissions sub where sub.version_id = v.id) as submission_count
      from checklist_versions v
     where v.checklist_id = ${checklistId}::uuid
     order by (v.status = 'draft') desc, v.version_number desc nulls first`);

  return rows.rows.map((row) => ({
    id: row.id,
    status: row.status,
    versionNumber: row.version_number,
    publishedAt: row.published_at === null ? null : new Date(row.published_at),
    itemCount: Number(row.item_count),
    submissionCount: Number(row.submission_count),
  }));
}

/** Чек-лист, его станция, черновик и версии — за один заход. Неизвестный id даёт `null`. */
export async function loadEditor(
  checklistId: string,
): Promise<EditorState | null> {
  if (!isUuid(checklistId)) return null;

  const rows = await getDb()
    .select({
      checklist: checklists,
      stationId: stations.id,
      stationName: stations.name,
      storeName: stores.name,
      countryName: countries.name,
      // Местное время пиццерии тем же заходом: отдельный запрос ради одной строки
      // на каждое открытие редактора не нужен, а выражение общее с `station-clock`.
      stationLocalTime: STATION_LOCAL_TIME,
    })
    .from(checklists)
    .leftJoin(stations, eq(checklists.stationId, stations.id))
    .leftJoin(stores, eq(stations.storeId, stores.id))
    .leftJoin(countries, eq(stores.countryId, countries.id))
    .where(eq(checklists.id, checklistId))
    .limit(1);

  const row = rows[0];
  if (row === undefined) return null;

  const draftRows = await getDb()
    .select({ sections: checklistVersions.sections })
    .from(checklistVersions)
    .where(
      and(
        eq(checklistVersions.checklistId, checklistId),
        eq(checklistVersions.status, "draft"),
      ),
    )
    .limit(1);

  const sections = await resolveLinkedSections(draftRows[0]?.sections ?? []);
  const versions = await versionSummaries(checklistId);
  const itemCount = sections.reduce(
    (total, section) => total + section.items.length,
    0,
  );

  return {
    checklist: row.checklist,
    station:
      row.stationId === null
        ? null
        : {
            id: row.stationId,
            name: row.stationName ?? "",
            storeName: row.storeName ?? "",
            countryName: row.countryName ?? "",
            localTime: row.stationLocalTime,
          },
    sections,
    // Число пунктов черновика берётся из развёрнутой разметки: в строке базы у вставленного
    // блока лежит снимок с прошлого сохранения, и он мог отстать от живого блока.
    versions: versions.map((version) =>
      version.status === "draft" ? { ...version, itemCount } : version,
    ),
    library: await listLibrary(checklistId),
  };
}
