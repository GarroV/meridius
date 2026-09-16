// Тревоги: то, что требует вмешательства прямо сейчас.
//
// Ни таблицы тревог, ни фоновой задачи, ни «закрытия дня» (D053): и провал критичного
// пункта, и незаполненный чек-лист вычисляются запросом в тот момент, когда на них
// смотрят. Поэтому тревога не может застрять после того, как чек-лист всё-таки
// заполнили, не требует крона и не оставляет колонку состояния, которую пришлось бы
// чинить руками после каждого сбоя.
//
// Своих правил здесь два, и оба взяты из уже принятых решений, а не выдуманы заново:
//  1. Провал критичного пункта — событие. Что считать провалом и что критичным,
//     решает `data` (`countFailedCritical` → `isFailed` + `severityOf`), а не этот файл.
//  2. Критичный пункт, оставленный БЕЗ ОТВЕТА, — тоже тревога, и отдельная. Неполное
//     заполнение продукт принимает сознательно, поэтому «газ» можно просто не тронуть:
//     тогда ни провала (ответа нет), ни пропуска (заполнение есть) — и без этой тревоги
//     самый важный пункт продукта уходил бы из надзора молча, тише обычного. Но это
//     СОСТОЯНИЕ, а не событие, и поднимается оно по ЗАКРЫТИЮ окна чек-листа — тем же
//     правилом, что пропущенный чек-лист (D054). Пока окно открыто, сотрудник вернётся
//     к «газу» штатным порядком, и тревога в момент отправки подсвечивала бы недоработку
//     продукта, а не сети (указание владельца 14.09).
//  3. Незаполненный чек-лист — состояние: версия опубликована и привязана к станции,
//     проход окна за сегодня по местному времени пиццерии закончился, заполнения в нём
//     нет, и в действовавшем режиме смены в чек-листе оставался хотя бы один пункт.
//     Последнее условие обязательно: иначе критичная смена порождала бы тревоги по
//     чек-листам, которые сама же и отменила (D054, D056).
//
// Лента заполнений для этого не переиспользуется намеренно: у неё свой период и свой
// предел выдачи в 200 строк, и тревога, пропавшая из-за выбранного периода, — это
// именно та тихая потеря, ради которой тревоги и заводились.
import { and, desc, eq, isNull, notExists, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import {
  checklistVersions,
  checklists,
  countFailedCritical,
  countUnansweredCritical,
  getDb,
  sectionsForMode,
  stations,
  storeShiftModes,
  stores,
  submissions,
  timezoneNames,
} from "@/blocks/data";
import type { LocalizedText, ShiftMode } from "@/blocks/data";

import type { FeedScope } from "./scope";
import {
  ZONE_MATCHES,
  countUnknownTimezoneStores,
  scopeConditions,
} from "./scope";

/**
 * Сколько строк читается на одну тревогу каждого вида. Провал виден только после
 * разбора снимка в памяти (правило уровней живёт в коде, а не в SQL, — D056), поэтому
 * заполнения за сутки читаются пачкой, а не по одному. Предел здесь честный: если
 * заполнений за день окажется больше, тревоги покажут последние — и об этом говорит
 * `capped`, а не молчание.
 */
const MAX_SCANNED = 500;

export type AlarmKind = "criticalFailed" | "criticalUnanswered" | "missed";

/** Одна тревога. Всё, что нужно строке на экране, — и ни одного запроса из разметки. */
export interface Alarm {
  readonly kind: AlarmKind;
  /** Ключ строки: заполнение с провалом или чек-лист, окно которого закрылось пустым. */
  readonly key: string;
  readonly countryId: string;
  readonly storeId: string;
  readonly storeName: string;
  readonly stationId: string;
  readonly stationName: string;
  readonly checklistId: string;
  /** Название из чек-листа на всех языках: язык выбирает экран. */
  readonly checklistTitle: LocalizedText;
  /** Пояс пиццерии: время тревоги показывается в нём, а не в поясе сервера. */
  readonly timeZone: string;
  /** О каком моменте тревога: отправка заполнения или закрытие окна чек-листа. */
  readonly at: Date;
  /** Заполнение с провалом. `null` у незаполненного чек-листа — его и нет. */
  readonly submissionId: string | null;
  /** Сколько критичных пунктов в этом состоянии. У незаполненного чек-листа — 0. */
  readonly itemCount: number;
  /** Режим смены: в котором заполняли или в котором чек-лист ждали. */
  readonly mode: ShiftMode;
}

export interface AlarmList {
  readonly alarms: readonly Alarm[];
  /** Прочитан весь разрешённый предел: тревог может быть больше показанных. */
  readonly capped: boolean;
  /**
   * Пиццерии в этих фильтрах, чей часовой пояс база не знает. Их тревоги посчитать
   * нечем: без пояса неизвестно, кончились ли местные сутки и закрылось ли окно.
   * Число отдаётся наружу и показывается, а не прячется, — иначе сломанная строка
   * справочника тихо вычитала бы пиццерию из надзора (T062).
   */
  readonly unknownTimezoneStores: number;
}

/** Промежуточный результат одного вида тревог: без общего счёта сломанных поясов. */
interface Scanned {
  readonly alarms: Alarm[];
  readonly capped: boolean;
}

/** Режим по умолчанию — тот же, что на экране заполнения: полная смена (D055). */
const DEFAULT_MODE: ShiftMode = "normal";

const MS_PER_SECOND = 1000;

/**
 * Местное время пиццерии для момента `at`. Считает база, а не JavaScript: сутки смены
 * заканчиваются там, где смена работает (D026).
 *
 * Пояс берётся из присоединённого списка зон, а НЕ из `stores.timezone`: эти выборки
 * идут по многим пиццериям сразу, и одно незнакомое базе имя роняло бы весь запрос —
 * то есть экран управляющего целиком. С присоединённым именем такая пиццерия даёт
 * NULL, выпадает из условий и попадает в отдельный счёт (`unknownTimezoneStores`),
 * который полоса тревог показывает вслух.
 */
function localNowSql(at: Date) {
  return sql`(${at.toISOString()}::timestamptz at time zone ${timezoneNames.name})`;
}

/**
 * Проход окна чек-листа, закончившийся СЕГОДНЯ по местному времени пиццерии.
 *
 * Один набор выражений на двоих: по нему считается и пропущенный чек-лист, и критичный
 * пункт, оставшийся без ответа. Держать их одним куском обязательно — правило подъёма
 * у них общее (D054), а две копии этого счёта разъехались бы на первой же правке, и
 * разъехались бы молча: обе продолжали бы что-то показывать.
 *
 * Берётся именно закончившийся проход, а не начавшийся: у окна через полночь
 * (20:00–00:00) проход, начатый сегодня, кончается завтра, и по началу вечернее
 * закрытие не порождало бы тревоги никогда — а именно оно и есть самое важное.
 */
interface WindowPass {
  /** Проход уже закрылся: раньше этого момента тревоге звучать не о чем. */
  readonly closed: SQL;
  /** Начало прохода в местном времени. У окна через полночь — вчерашние сутки. */
  readonly startLocal: SQL;
  /** Конец прохода в местном времени: сегодняшняя дата плюс конец окна. */
  readonly endLocal: SQL;
  /**
   * Момент закрытия окна секундами эпохи, а не отметкой времени: для node-postgres
   * drizzle отключает разбор дат драйвером и сам разбирает только СВОИ колонки, поэтому
   * сырое выражение вернулось бы строкой «2026-09-06 12:00:00+00» (проверено на этой
   * базе). Число же не зависит ни от разборщика, ни от локали.
   */
  readonly closedAtEpoch: SQL<number>;
}

function windowPassEndingToday(at: Date): WindowPass {
  const localNow = localNowSql(at);
  const localDate = sql`${localNow}::date`;
  const localTime = sql`${localNow}::time`;

  const startLocal = sql`(case
        when ${checklists.windowStart} <= ${checklists.windowEnd}
          then ${localDate} + ${checklists.windowStart}
        else (${localDate} - 1) + ${checklists.windowStart}
      end)`;
  const endLocal = sql`(${localDate} + ${checklists.windowEnd})`;

  return {
    closed: sql`${localTime} >= ${checklists.windowEnd}`,
    startLocal,
    endLocal,
    closedAtEpoch: sql<number>`extract(epoch from (${endLocal} at time zone ${timezoneNames.name}))::float8`,
  };
}

/** Заполнение попало в этот проход окна: между открытием и закрытием. */
function submittedInPass(pass: WindowPass): SQL[] {
  return [
    sql`(${submissions.submittedAt} at time zone ${timezoneNames.name}) >= ${pass.startLocal}`,
    sql`(${submissions.submittedAt} at time zone ${timezoneNames.name}) < ${pass.endLocal}`,
  ];
}

/** Провалы критичных пунктов в заполнениях за текущие местные сутки пиццерии. */
async function listCriticalFailures(
  scope: FeedScope,
  at: Date,
): Promise<Scanned> {
  const localDate = sql`${localNowSql(at)}::date`;

  const rows = await getDb()
    .select({
      submissionId: submissions.id,
      submittedAt: submissions.submittedAt,
      snapshot: submissions.snapshot,
      answers: submissions.answers,
      mode: submissions.mode,
      countryId: stores.countryId,
      storeId: stores.id,
      storeName: stores.name,
      stationId: stations.id,
      stationName: stations.name,
      timeZone: stores.timezone,
      checklistId: checklists.id,
      checklistTitle: checklists.title,
    })
    .from(submissions)
    .innerJoin(
      checklistVersions,
      eq(submissions.versionId, checklistVersions.id),
    )
    .innerJoin(checklists, eq(checklistVersions.checklistId, checklists.id))
    .innerJoin(stations, eq(submissions.stationId, stations.id))
    .innerJoin(stores, eq(stations.storeId, stores.id))
    .leftJoin(timezoneNames, ZONE_MATCHES)
    .where(
      and(
        ...scopeConditions(scope),
        // Сутки — местные для пиццерии, а не для сервера: иначе вечерняя тревога
        // в стране со сдвигом попадала бы то в сегодня, то в завтра.
        sql`(${submissions.submittedAt} at time zone ${timezoneNames.name})::date = ${localDate}`,
      ),
    )
    .orderBy(desc(submissions.submittedAt), desc(submissions.id))
    .limit(MAX_SCANNED);

  const alarms = rows.flatMap((row) =>
    alarmOf(
      row,
      "criticalFailed",
      countFailedCritical(row.snapshot, row.answers),
    ),
  );

  return { alarms, capped: rows.length === MAX_SCANNED };
}

/** Строка заполнения в том виде, в каком из неё собирается тревога. */
interface SubmissionRow {
  readonly submissionId: string;
  readonly submittedAt: Date;
  readonly countryId: string;
  readonly storeId: string;
  readonly storeName: string;
  readonly stationId: string;
  readonly stationName: string;
  readonly checklistId: string;
  readonly checklistTitle: LocalizedText;
  readonly timeZone: string;
  readonly mode: ShiftMode;
}

/**
 * Тревога по заполнению — или ничего, если считать нечего.
 *
 * Одно заполнение может дать обе тревоги сразу: часть критичных пунктов провалена,
 * часть не тронута. Складывать их в одну строку с двумя числами значит писать текст,
 * который читают со второго раза, — а тревогу читают с первого.
 */
function alarmOf(
  row: SubmissionRow,
  kind: AlarmKind,
  itemCount: number,
): Alarm[] {
  if (itemCount === 0) return [];
  return [
    {
      kind,
      key: `${kind}:${row.submissionId}`,
      countryId: row.countryId,
      storeId: row.storeId,
      storeName: row.storeName,
      stationId: row.stationId,
      stationName: row.stationName,
      checklistId: row.checklistId,
      checklistTitle: row.checklistTitle,
      timeZone: row.timeZone,
      at: row.submittedAt,
      submissionId: row.submissionId,
      itemCount,
      mode: row.mode,
    },
  ];
}

/**
 * Критичные пункты, оставшиеся без ответа в заполнениях того прохода окна, который
 * СЕГОДНЯ закрылся.
 *
 * Отдельный запрос, а не ветка в счёте провалов, ровно потому, что момент подъёма у них
 * разный: провал случился и известен точно в ту же секунду, а молчание становится фактом
 * только с закрытием окна. До закрытия сотрудник вернётся к пункту штатным порядком, и
 * тревога об этом — «подсветка нашей недоработки, а не того, что мы не можем это
 * сделать» (владелец, 14.09).
 *
 * Время тревоги — время ОТПРАВКИ, а не закрытия окна: строка ведёт в конкретную карточку
 * («Открыть»), и управляющему нужно знать, когда заполняли, — иначе в полосе все
 * вечерние тревоги показывали бы одну и ту же полночь.
 *
 * Снятый с работы чек-лист здесь НЕ исключается, в отличие от пропущенного: там тревога
 * о работе, которую перестали ждать, а тут — о работе, которая уже сделана наполовину.
 * Архивирование чек-листа задним числом не отменяет того, что «газ» не тронули.
 */
async function listUnansweredCritical(
  scope: FeedScope,
  at: Date,
): Promise<Scanned> {
  const pass = windowPassEndingToday(at);

  const rows = await getDb()
    .select({
      submissionId: submissions.id,
      submittedAt: submissions.submittedAt,
      snapshot: submissions.snapshot,
      answers: submissions.answers,
      mode: submissions.mode,
      countryId: stores.countryId,
      storeId: stores.id,
      storeName: stores.name,
      stationId: stations.id,
      stationName: stations.name,
      timeZone: stores.timezone,
      checklistId: checklists.id,
      checklistTitle: checklists.title,
    })
    .from(submissions)
    .innerJoin(
      checklistVersions,
      eq(submissions.versionId, checklistVersions.id),
    )
    .innerJoin(checklists, eq(checklistVersions.checklistId, checklists.id))
    .innerJoin(stations, eq(submissions.stationId, stations.id))
    .innerJoin(stores, eq(stations.storeId, stores.id))
    .leftJoin(timezoneNames, ZONE_MATCHES)
    .where(
      and(...scopeConditions(scope), pass.closed, ...submittedInPass(pass)),
    )
    .orderBy(desc(submissions.submittedAt), desc(submissions.id))
    .limit(MAX_SCANNED);

  const alarms = rows.flatMap((row) =>
    alarmOf(
      row,
      "criticalUnanswered",
      countUnansweredCritical(row.snapshot, row.answers),
    ),
  );

  return { alarms, capped: rows.length === MAX_SCANNED };
}

/**
 * Чек-листы, чьё окно за сегодня закрылось без заполнения.
 *
 * Проход окна — тот же, по которому поднимается критичный пункт без ответа
 * (`windowPassEndingToday`): закончившийся сегодня по местному времени.
 */
async function listMissedChecklists(
  scope: FeedScope,
  at: Date,
): Promise<Scanned> {
  const pass = windowPassEndingToday(at);
  const { startLocal, closedAtEpoch } = pass;

  // Режим смены берётся за те сутки, в которых окно НАЧАЛОСЬ: чек-лист ждали от той
  // смены, которая его и открыла, а не от той, что пришла после полуночи (D055).
  const shiftMode = sql<ShiftMode | null>`(
      select ${storeShiftModes.mode}
      from ${storeShiftModes}
      where ${storeShiftModes.storeId} = ${stores.id}
        and ${storeShiftModes.localDate} = ${startLocal}::date
      order by ${storeShiftModes.setAt} desc
      limit 1
    )`;

  // Заполнение этого чек-листа внутри именно этого прохода окна. Версия любая:
  // сотрудник мог заполнять прежнюю, пока методист публиковал следующую (T041).
  const filledVersion = alias(checklistVersions, "filled_version");
  const notFilled = notExists(
    getDb()
      .select({ one: sql`1` })
      .from(submissions)
      .innerJoin(filledVersion, eq(submissions.versionId, filledVersion.id))
      .where(
        and(
          eq(filledVersion.checklistId, checklists.id),
          ...submittedInPass(pass),
        ),
      ),
  );

  const rows = await getDb()
    .select({
      checklistId: checklists.id,
      checklistTitle: checklists.title,
      sections: checklistVersions.sections,
      countryId: stores.countryId,
      storeId: stores.id,
      storeName: stores.name,
      stationId: stations.id,
      stationName: stations.name,
      timeZone: stores.timezone,
      mode: shiftMode,
      closedAtEpoch,
    })
    .from(checklists)
    .innerJoin(stations, eq(checklists.stationId, stations.id))
    .innerJoin(stores, eq(stations.storeId, stores.id))
    .leftJoin(timezoneNames, ZONE_MATCHES)
    // Та же проверка принадлежности, что и на экране заполнения: версия обязана быть
    // опубликована для этой же станции, иначе после переноса чек-листа тревога
    // приходила бы станции, которая его никогда не видела (T056).
    .innerJoin(
      checklistVersions,
      and(
        eq(checklistVersions.checklistId, checklists.id),
        eq(checklistVersions.status, "published"),
        eq(checklistVersions.stationId, stations.id),
      ),
    )
    .where(
      and(
        ...scopeConditions(scope),
        // Снятый с работы чек-лист не ждут: методист убрал его из работы сам.
        isNull(checklists.archivedAt),
        pass.closed,
        notFilled,
      ),
    )
    .orderBy(sql`${closedAtEpoch} desc`, desc(checklists.id))
    .limit(MAX_SCANNED);

  const alarms = rows
    .map((row) => ({ row, mode: row.mode ?? DEFAULT_MODE }))
    // Пункты фильтруются в памяти, а не в SQL: матрица «режим → уровни» живёт в одном
    // месте (D056), и повторять её условием запроса значит завести ей второй дом.
    .filter(({ row, mode }) => sectionsForMode(row.sections, mode).length > 0)
    .map(({ row, mode }) => ({
      kind: "missed" as const,
      key: `missed:${row.checklistId}:${String(row.closedAtEpoch)}`,
      countryId: row.countryId,
      storeId: row.storeId,
      storeName: row.storeName,
      stationId: row.stationId,
      stationName: row.stationName,
      checklistId: row.checklistId,
      checklistTitle: row.checklistTitle,
      timeZone: row.timeZone,
      at: new Date(row.closedAtEpoch * MS_PER_SECOND),
      submissionId: null,
      itemCount: 0,
      mode,
    }));

  return { alarms, capped: rows.length === MAX_SCANNED };
}

/**
 * Сколько пиццерий в этих фильтрах базе непонятны по часовому поясу. Считаются только
 * те, у которых есть хотя бы одна станция: без станции чек-листа нет и тревоги быть
 * не может, а пугать управляющего пиццерией, которая ещё не заведена до конца, незачем.
 */
/**
 * Все тревоги по этим фильтрам на момент `at`. Порядок — сперва то, что случилось и
 * известно точно (провал критичного пункта), потом то, что стало фактом с закрытием
 * окна: критичный пункт без ответа, затем незаполненный чек-лист. Внутри вида свежие
 * сверху.
 *
 * `at` приходит параметром, а не берётся внутри: границы местных суток и закрытие
 * окна иначе невозможно проверить тестом, не подменяя системные часы.
 */
export async function listAlarms(
  scope: FeedScope,
  at: Date,
): Promise<AlarmList> {
  const [failures, unanswered, missed, unknownTimezoneStores] =
    await Promise.all([
      listCriticalFailures(scope, at),
      listUnansweredCritical(scope, at),
      listMissedChecklists(scope, at),
      countUnknownTimezoneStores(scope),
    ]);

  return {
    alarms: [...failures.alarms, ...unanswered.alarms, ...missed.alarms],
    capped: failures.capped || unanswered.capped || missed.capped,
    unknownTimezoneStores,
  };
}
