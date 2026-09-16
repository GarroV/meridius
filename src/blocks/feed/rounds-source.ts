// Данные отчёта об обходах: чек-листы области видимости, их версии по датам, режимы
// смен и отметки. Свой запрос, а не заказ в `data` (D024): это выборка одного экрана,
// и собирать под неё CRUD в общем слое значило бы складывать туда запросы всех блоков.
//
// Всё местное время считает база (D026): сутки смены кончаются там, где смена работает,
// и перевод в JavaScript по поясу сервера превратил бы утренний обход соседней страны
// в ночной. Сюда приходят уже готовые строки «ГГГГ-ММ-ДД» и «ЧЧ:ММ».
import {
  and,
  asc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  sql,
} from "drizzle-orm";

import {
  checklistVersions,
  checklists,
  checks,
  getDb,
  stations,
  storeShiftModes,
  stores,
  timezoneNames,
} from "@/blocks/data";
import type { LocalizedText } from "@/blocks/data";

import type {
  ReportChecklist,
  ReportShiftMode,
  ReportVersion,
} from "./rounds-days";
import { shiftLocalDate } from "./rounds-days";
import type { RoundsMark } from "./rounds-grid";
import type { FeedScope } from "./scope";
import {
  ZONE_MATCHES,
  countUnknownTimezoneStores,
  scopeConditions,
} from "./scope";

/** Чек-лист отчёта: местное «сейчас» для счёта плюс имена для шапки строки. */
export interface RoundsChecklist extends ReportChecklist {
  readonly checklistTitle: LocalizedText;
  readonly storeName: string;
  readonly stationName: string;
  /** Пояс пиццерии — тот, что знает база. */
  readonly timeZone: string;
}

export interface RoundsSource {
  readonly checklists: readonly RoundsChecklist[];
  readonly versions: readonly ReportVersion[];
  readonly shiftModes: readonly ReportShiftMode[];
  readonly marks: readonly RoundsMark[];
  /** Пиццерии, чей пояс база не знает: их обходы посчитать нечем, и это говорится вслух. */
  readonly unknownTimezoneStores: number;
}

/** Границы дат, в которых имеет смысл читать отметки и режимы смен. */
interface DateRange {
  readonly from: string;
  readonly to: string;
}

const EMPTY: RoundsSource = {
  checklists: [],
  versions: [],
  shiftModes: [],
  marks: [],
  unknownTimezoneStores: 0,
};

/** Местное «сейчас» пиццерии: пояс берётся из справочника базы, а не из строки. */
function localNowSql(at: Date) {
  return sql`(${at.toISOString()}::timestamptz at time zone ${timezoneNames.name})`;
}

/**
 * Чек-листы области видимости вместе с местным временем их пиццерий.
 *
 * Снятый с работы чек-лист не берётся: методист убрал его из работы сам, и считать
 * пропуски по работе, которую перестали ждать, значило бы придумывать их. То же
 * правило у тревоги о пропущенном чек-листе.
 *
 * Присоединение справочника зон внутреннее: пиццерия с незнакомым базе поясом выпадает
 * из отчёта, а не роняет его, и попадает в отдельный счёт (`unknownTimezoneStores`).
 */
async function loadChecklists(
  scope: FeedScope,
  at: Date,
): Promise<RoundsChecklist[]> {
  const localNow = localNowSql(at);

  const rows = await getDb()
    .select({
      checklistId: checklists.id,
      checklistTitle: checklists.title,
      storeId: stores.id,
      storeName: stores.name,
      stationName: stations.name,
      windowStart: checklists.windowStart,
      windowEnd: checklists.windowEnd,
      timeZone: timezoneNames.name,
      // «ЧЧ:ММ» строкой, а не приведением к `time`: `now()` приносит микросекунды,
      // которых разбор времени не принимает, и расписание разошлось бы с базой молча.
      localDate: sql<string>`to_char(${localNow}, 'YYYY-MM-DD')`,
      localTime: sql<string>`to_char(${localNow}, 'HH24:MI')`,
    })
    .from(checklists)
    .innerJoin(stations, eq(checklists.stationId, stations.id))
    .innerJoin(stores, eq(stations.storeId, stores.id))
    .innerJoin(timezoneNames, ZONE_MATCHES)
    .where(and(...scopeConditions(scope), isNull(checklists.archivedAt)))
    .orderBy(asc(stores.name), asc(stations.name), asc(checklists.id));

  return rows.map((row) => ({
    checklistId: row.checklistId,
    checklistTitle: row.checklistTitle,
    storeId: row.storeId,
    storeName: row.storeName,
    stationName: row.stationName,
    timeZone: row.timeZone,
    window: { start: row.windowStart, end: row.windowEnd },
    localDate: row.localDate,
    localTime: row.localTime,
  }));
}

/**
 * Опубликованные версии чек-листов области с местной датой публикации.
 *
 * Версия обязана быть опубликована для ТОЙ ЖЕ станции — та же проверка, что на экране
 * заполнения (T056): после переноса чек-листа отчёт иначе считал бы станции расписание,
 * которого она никогда не видела.
 *
 * Читается вся опубликованная история, а не последняя версия: отчёт за месяц считает
 * каждый день по тому расписанию, которое тогда и было, а версии неизменяемы (D002).
 */
async function loadVersions(
  scope: FeedScope,
  at: Date,
): Promise<ReportVersion[]> {
  const publishedLocal = sql<string>`to_char((${checklistVersions.publishedAt} at time zone ${timezoneNames.name}), 'YYYY-MM-DD')`;

  const rows = await getDb()
    .select({
      checklistId: checklistVersions.checklistId,
      sections: checklistVersions.sections,
      publishedLocalDate: publishedLocal,
    })
    .from(checklistVersions)
    .innerJoin(checklists, eq(checklistVersions.checklistId, checklists.id))
    .innerJoin(stations, eq(checklistVersions.stationId, stations.id))
    .innerJoin(stores, eq(stations.storeId, stores.id))
    .innerJoin(timezoneNames, ZONE_MATCHES)
    .where(
      and(
        ...scopeConditions(scope),
        isNull(checklists.archivedAt),
        isNotNull(checklistVersions.publishedAt),
        // Версия из будущего в отчёт не попадает: часы сервера впереди — не повод
        // считать сегодняшний день по расписанию, которого ещё не публиковали.
        lte(checklistVersions.publishedAt, at),
      ),
    )
    .orderBy(asc(checklistVersions.publishedAt));

  return rows.map((row) => ({
    checklistId: row.checklistId,
    publishedLocalDate: row.publishedLocalDate,
    sections: row.sections,
  }));
}

/** Перестановки режима смены за период: последняя за сутки и действует (D055). */
async function loadShiftModes(
  storeIds: readonly string[],
  range: DateRange,
): Promise<ReportShiftMode[]> {
  const rows = await getDb()
    .select({
      storeId: storeShiftModes.storeId,
      localDate: storeShiftModes.localDate,
      mode: storeShiftModes.mode,
    })
    .from(storeShiftModes)
    .where(
      and(
        inArray(storeShiftModes.storeId, storeIds),
        gte(storeShiftModes.localDate, range.from),
        lte(storeShiftModes.localDate, range.to),
      ),
    )
    // В порядке перестановки: разбор оставляет последнюю за сутки.
    .orderBy(asc(storeShiftModes.setAt));

  return rows.map((row) => ({
    storeId: row.storeId,
    localDate: row.localDate,
    mode: row.mode,
  }));
}

/**
 * Отметки обходов за период. Читаются по чек-листу, а не по версии: методист публикует
 * следующую версию посреди смены (T041), и утренние обходы обязаны остаться в отчёте.
 *
 * Выборка различающихся строк: повторная отметка того же прохода — одно и то же
 * событие, а лишний дубль раздувал бы счёт отметок, не легших в сетку.
 */
async function loadMarks(
  scope: FeedScope,
  range: DateRange,
): Promise<RoundsMark[]> {
  return getDb()
    .selectDistinct({
      checklistId: checklistVersions.checklistId,
      localDate: checks.localDate,
      itemId: checks.itemId,
      intervalStart: checks.intervalStart,
    })
    .from(checks)
    .innerJoin(checklistVersions, eq(checks.versionId, checklistVersions.id))
    .innerJoin(checklists, eq(checklistVersions.checklistId, checklists.id))
    .innerJoin(stations, eq(checks.stationId, stations.id))
    .innerJoin(stores, eq(stations.storeId, stores.id))
    .where(
      and(
        ...scopeConditions(scope),
        isNull(checklists.archivedAt),
        gte(checks.localDate, range.from),
        lte(checks.localDate, range.to),
      ),
    );
}

/**
 * Границы дат, за которые вообще имеет смысл читать отметки и режимы: от самых ранних
 * суток отчёта самой ранней пиццерии до самых поздних «сегодня».
 *
 * На сутки глубже периода — ровно как у разбора проходов: проход окна через полночь,
 * начатый накануне, ещё может задеть период, и его отметки нужны.
 */
function rangeOf(
  checklists: readonly RoundsChecklist[],
  dayCount: number,
): DateRange | null {
  const dates = checklists.map((row) => row.localDate).sort();
  const first = dates[0];
  const last = dates.at(-1);
  if (first === undefined || last === undefined) return null;
  return { from: shiftLocalDate(first, -dayCount), to: last };
}

/**
 * Всё, из чего складывается сетка обходов за период, — четырьмя узкими запросами.
 *
 * `at` приходит параметром, а не берётся внутри: границы местных суток иначе
 * невозможно проверить тестом, не подменяя системные часы.
 */
export async function loadRoundsSource(
  scope: FeedScope,
  dayCount: number,
  at: Date,
): Promise<RoundsSource> {
  const rows = await loadChecklists(scope, at);
  const range = rangeOf(rows, dayCount);
  if (range === null) {
    return {
      ...EMPTY,
      unknownTimezoneStores: await countUnknownTimezoneStores(scope),
    };
  }

  const storeIds = [...new Set(rows.map((row) => row.storeId))];
  const [versions, shiftModes, marks, unknownTimezoneStores] =
    await Promise.all([
      loadVersions(scope, at),
      loadShiftModes(storeIds, range),
      loadMarks(scope, range),
      countUnknownTimezoneStores(scope),
    ]);

  return {
    checklists: rows,
    versions,
    shiftModes,
    marks,
    unknownTimezoneStores,
  };
}
