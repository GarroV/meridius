// Живые чек-листы области и их проходы «сегодня» — один запрос на статус чек-листа
// (D179) и на тревогу «чек-лист не заполнен» (D053, `alarms.ts`).
//
// Живой чек-лист — тот, что сотрудник может открыть на станции: не снят с работы и
// опубликован ДЛЯ ЭТОЙ ЖЕ станции. Проверка станции версии — та же, что на экране
// заполнения: после переноса чек-листа тревога иначе приходила бы станции, которая его
// никогда не видела (T056).
//
// Запрос приносит факты о двух проходах окна — закончившемся сегодня и начавшемся
// сегодня (`window-pass.ts`), — а что из них следует, решает чистое правило
// `today-status.ts`. Пункты по режиму смены фильтруются в памяти, а не в SQL: матрица
// «режим → уровни» живёт в одном месте (D056).
import { and, asc, eq, isNull, sql, type SQL } from "drizzle-orm";

import {
  checklistVersions,
  checklists,
  getDb,
  sectionsForMode,
  stations,
  stores,
  submissions,
  timezoneNames,
} from "@/blocks/data";
import type { LocalizedText, Section, ShiftMode } from "@/blocks/data";

import { ZONE_MATCHES, scopeConditions, type FeedScope } from "./scope";
import type { ChecklistDay, PassFacts } from "./today-status";
import {
  passShiftModeSql,
  submittedInPass,
  windowPassEndingToday,
  windowPassStartingToday,
  type WindowPass,
} from "./window-pass";

/**
 * Предел строк. Справочник сети — сотни чек-листов, а не тысячи; если он вырастет, об
 * этом говорит `capped`, а не молчание.
 */
const MAX_LIVE = 2000;

const MS_PER_SECOND = 1000;

/** Режим по умолчанию — тот же, что на экране заполнения: полная смена (D055). */
const DEFAULT_MODE: ShiftMode = "normal";

/** Живой чек-лист и всё, что нужно строке экрана и тревоге. */
export interface LiveChecklist {
  readonly checklistId: string;
  /** Название на всех языках: язык выбирает экран. */
  readonly checklistTitle: LocalizedText;
  readonly countryId: string;
  readonly storeId: string;
  readonly storeName: string;
  readonly stationId: string;
  readonly stationName: string;
  /** Пояс пиццерии, как он записан в справочнике. */
  readonly timeZone: string;
  /** Окно местным временем: «06:00:00» — «12:00:00». */
  readonly windowStart: string;
  readonly windowEnd: string;
  /** Проходы сегодня; `null` — пояс пиццерии базе неизвестен (T062). */
  readonly day: ChecklistDay | null;
  /** Режим смены прохода, закончившегося сегодня: тревога о пропуске его показывает. */
  readonly endingMode: ShiftMode;
}

export interface LiveChecklists {
  readonly rows: readonly LiveChecklist[];
  /** Прочитан весь предел: чек-листов может быть больше. */
  readonly capped: boolean;
}

/** Последнее заполнение чек-листа (любой версии) внутри прохода, секундами эпохи. */
function filledEpochSql(pass: WindowPass): SQL<number | null> {
  return sql<number | null>`(
      select extract(epoch from max(${submissions.submittedAt}))::float8
      from ${submissions}
      join checklist_versions as filled_version
        on filled_version.id = ${submissions.versionId}
      where filled_version.checklist_id = ${checklists.id}
        and ${and(...submittedInPass(pass))}
    )`;
}

function passColumns(pass: WindowPass) {
  return {
    startEpoch: sql<number | null>`${pass.startEpoch}`,
    endEpoch: sql<number | null>`${pass.endEpoch}`,
    filledEpoch: filledEpochSql(pass),
    mode: passShiftModeSql(pass),
  };
}

interface PassRow {
  readonly startEpoch: number | null;
  readonly endEpoch: number | null;
  readonly filledEpoch: number | null;
  readonly mode: ShiftMode | null;
}

function toDate(epochSeconds: number): Date {
  return new Date(epochSeconds * MS_PER_SECOND);
}

function passFacts(
  row: PassRow,
  sections: readonly Section[],
): PassFacts | null {
  if (row.startEpoch === null || row.endEpoch === null) return null;
  return {
    startAt: toDate(row.startEpoch),
    endAt: toDate(row.endEpoch),
    filledAt: row.filledEpoch === null ? null : toDate(row.filledEpoch),
    expected: sectionsForMode(sections, row.mode ?? DEFAULT_MODE).length > 0,
  };
}

function dayOf(
  ending: PassRow,
  starting: PassRow,
  sections: readonly Section[],
): ChecklistDay | null {
  const endingToday = passFacts(ending, sections);
  const startingToday = passFacts(starting, sections);
  if (endingToday === null || startingToday === null) return null;
  return { endingToday, startingToday };
}

/**
 * Живые чек-листы области на момент `at` с фактами о проходах сегодня. `at` приходит
 * параметром: границы местных суток иначе не проверить, не подменяя часы.
 */
export async function listLiveChecklists(
  scope: FeedScope,
  at: Date,
): Promise<LiveChecklists> {
  const ending = windowPassEndingToday(at);
  const starting = windowPassStartingToday(at);

  const rows = await getDb()
    .select({
      checklistId: checklists.id,
      checklistTitle: checklists.title,
      windowStart: checklists.windowStart,
      windowEnd: checklists.windowEnd,
      sections: checklistVersions.sections,
      countryId: stores.countryId,
      storeId: stores.id,
      storeName: stores.name,
      stationId: stations.id,
      stationName: stations.name,
      timeZone: stores.timezone,
      ending: passColumns(ending),
      starting: passColumns(starting),
    })
    .from(checklists)
    .innerJoin(stations, eq(checklists.stationId, stations.id))
    .innerJoin(stores, eq(stations.storeId, stores.id))
    .leftJoin(timezoneNames, ZONE_MATCHES)
    .innerJoin(
      checklistVersions,
      and(
        eq(checklistVersions.checklistId, checklists.id),
        eq(checklistVersions.status, "published"),
        eq(checklistVersions.stationId, stations.id),
      ),
    )
    .where(and(...scopeConditions(scope), isNull(checklists.archivedAt)))
    .orderBy(
      asc(stores.name),
      asc(stations.name),
      asc(checklists.windowStart),
      asc(checklists.id),
    )
    .limit(MAX_LIVE);

  return {
    rows: rows.map((row) => ({
      checklistId: row.checklistId,
      checklistTitle: row.checklistTitle,
      countryId: row.countryId,
      storeId: row.storeId,
      storeName: row.storeName,
      stationId: row.stationId,
      stationName: row.stationName,
      timeZone: row.timeZone,
      windowStart: row.windowStart,
      windowEnd: row.windowEnd,
      day: dayOf(row.ending, row.starting, row.sections),
      endingMode: row.ending.mode ?? DEFAULT_MODE,
    })),
    capped: rows.length === MAX_LIVE,
  };
}
