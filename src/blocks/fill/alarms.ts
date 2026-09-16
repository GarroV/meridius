// Будильники станции: третья точка записи продукта, открытая интернету (D070, T139).
//
// Что это такое по существу. Сотрудник вручную вносит время и подпись — «вынести тесто
// в 14:30», — и планшет в это время звонит. Ни регулярности, ни справочника продуктов,
// ни учёта списаний за этим нет и не будет (D069): это записка под рукой, а не подсистема.
//
// Живёт будильник до конца окна работы чек-листа (D090, T159), а не до местной полуночи:
// часы работы чек-листа и есть те часы, когда на станции кто-то стоит. Ночная пиццерия
// с окном 22:00–02:00 обязана ставить будильник на 00:30 в 23:40 — это ровно тот случай,
// ради которого будильник и заводят, и по местным суткам он был запрещён.
//
// Почему в базе, а не в памяти вкладки: планшет на кухне гаснет, обновляется и
// перезагружается посреди смены. Будильник, живший в памяти, исчезал бы ровно тогда,
// когда он и нужен, и об этом никто бы не узнал до конца смены.
//
// Почему строку законно удалять. Правило неизменяемости истории (D002) сюда не
// распространяется — и это не послабление, а разница в существе: заполнение и отметка
// обхода свидетельствуют о смене перед надзором, а будильник ничего не свидетельствует.
// Его заводят и снимают тем же движением, каким переворачивают таймер на кухне.
//
// Порядок проверок тот же, что у заполнения и у отметки обхода, и по той же причине:
// форма тела (дёшево, без базы) → частота (тоже без базы) → база. Иначе поток мусора
// с улицы доходил бы до пула соединений раньше, чем до отказа.
import { and, asc, eq, exists, gte, isNull, lt, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";

import {
  alarms,
  checklistVersions,
  checklists,
  getDb,
  stations,
  stores,
} from "@/blocks/data";

import { ALARM_LIMITS } from "./alarm-limits";
import { checkAlarmAllowed } from "./rate-limit";
import { isPlausibleCode } from "./station";
import type { FillRefusal, Parsed } from "./validation";
import { UUID_PATTERN } from "./validation";

/** Местное время «ЧЧ:ММ» ровно в том виде, в каком его отдаёт `<input type="time">`. */
const LOCAL_TIME_SHAPE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Один будильник в том виде, в каком его видит планшет.
 *
 * `ringsInSeconds` — отсчёт ОТ СЕРВЕРА, а не момент звонка: часы кухонного планшета
 * врут, и будильник, поставленный по ним, звонил бы не тогда, когда написано на экране.
 * Отрицательное значение означает «момент уже прошёл, а будильник не сняли» — это и есть
 * случай перезагрузки, ради которого он хранится строкой.
 */
export interface AlarmView {
  readonly id: string;
  /** Местное время станции, «ЧЧ:ММ»: считает база из часового пояса пиццерии (D026). */
  readonly atLocalTime: string;
  readonly label: string;
  readonly ringsInSeconds: number;
}

/**
 * Исход действия с будильником. Удачный исход всегда отдаёт ВЕСЬ список станции на
 * сегодня, а не заведённую строку: у станции может быть открыто два планшета, и экран
 * обязан приходить в состояние сервера, а не в своё представление о нём.
 */
export type AlarmOutcome =
  | { readonly kind: "alarms"; readonly alarms: readonly AlarmView[] }
  | {
      readonly kind: "refused";
      readonly reason: FillRefusal;
      readonly retryAfterSeconds: number;
    };

export interface ParsedAlarm {
  readonly code: string;
  readonly atLocalTime: string;
  readonly label: string;
}

export interface ParsedAlarmRemoval {
  readonly code: string;
  readonly alarmId: string;
}

const MALFORMED = { ok: false, reason: "malformed" } as const;

function refuse(reason: FillRefusal, retryAfterSeconds = 0): AlarmOutcome {
  return { kind: "refused", reason, retryAfterSeconds };
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

/** Форма тела заведения. Наружу выходит новый объект: полей входа в нём нет. */
export function parseAlarmInput(input: unknown): Parsed<ParsedAlarm> {
  if (!isRecord(input)) return MALFORMED;

  const { code, atLocalTime, label } = input;
  if (typeof code !== "string" || !isPlausibleCode(code)) return MALFORMED;
  if (typeof atLocalTime !== "string" || !LOCAL_TIME_SHAPE.test(atLocalTime)) {
    return MALFORMED;
  }
  if (typeof label !== "string") return MALFORMED;

  // Подпись обрезается здесь, а не в базе: будильник без подписи звонит и не говорит,
  // зачем, а подпись из одних пробелов ровно такова — только выглядит заполненной.
  const trimmed = label.trim();
  if (trimmed === "" || trimmed.length > ALARM_LIMITS.maxLabelLength) {
    return MALFORMED;
  }

  return { ok: true, value: { code, atLocalTime, label: trimmed } };
}

/** Форма тела снятия. */
export function parseAlarmRemoval(input: unknown): Parsed<ParsedAlarmRemoval> {
  if (!isRecord(input)) return MALFORMED;

  const { code, alarmId } = input;
  if (typeof code !== "string" || !isPlausibleCode(code)) return MALFORMED;
  if (typeof alarmId !== "string" || !UUID_PATTERN.test(alarmId)) {
    return MALFORMED;
  }

  return { ok: true, value: { code, alarmId } };
}

/** Момент `now` в местном времени пиццерии: наивная отметка без пояса. */
function localNow(now: Date) {
  return sql`(${now.toISOString()}::timestamptz at time zone ${stores.timezone})`;
}

/** Местная дата станции в этот момент. */
function localDay(now: Date) {
  return sql`(${localNow(now)})::date`;
}

/** Местное время суток станции в этот момент. */
function localClock(now: Date) {
  return sql`(${localNow(now)})::time`;
}

/**
 * Отметка в UTC строкой «…Z». Пояс из неё база уже убрала, поэтому разбор однозначен
 * и от часов сервера не зависит вовсе.
 */
function utcText<T extends string | null = string>(moment: SQL): SQL<T> {
  return sql<T>`to_char(${moment} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`;
}

/**
 * Открыт ли чек-лист прямо сейчас.
 *
 * Условие повторяет `listPublishedVersionsForStation` блока `data` и обязано совпадать
 * с ним: панель будильников живёт на экране, который отдаёт та выборка. Разъехавшись,
 * они дали бы «чек-лист на экране открыт, а будильник ставить некуда» — и наоборот.
 */
function windowIsOpen(now: Date) {
  const clock = localClock(now);
  return sql`case
      when ${checklists.windowStart} <= ${checklists.windowEnd}
        then ${clock} >= ${checklists.windowStart} and ${clock} < ${checklists.windowEnd}
      else ${clock} >= ${checklists.windowStart} or ${clock} < ${checklists.windowEnd}
    end`;
}

/**
 * Начало ТЕКУЩЕГО ПРОХОДА окна — отметка с поясом.
 *
 * Проход, а не сутки: окно 22:00–02:00 идёт от вчерашних 22:00, когда на станции уже
 * первый час ночи, и от сегодняшних, когда ещё вечер. Ради этой разницы задача и
 * заведена: местные сутки режут проход пополам ровно в полночь (D090).
 */
function windowOpensAt(now: Date) {
  const day = localDay(now);
  return sql`((case
      when ${checklists.windowStart} <= ${checklists.windowEnd} then ${day}
      when ${localClock(now)} >= ${checklists.windowStart} then ${day}
      else ${day} - 1
    end + ${checklists.windowStart}) at time zone ${stores.timezone})`;
}

/** Конец текущего прохода окна — предел жизни будильника (D090). */
function windowClosesAt(now: Date) {
  const day = localDay(now);
  return sql`((case
      when ${checklists.windowStart} <= ${checklists.windowEnd} then ${day}
      when ${localClock(now)} >= ${checklists.windowStart} then ${day} + 1
      else ${day}
    end + ${checklists.windowEnd}) at time zone ${stores.timezone})`;
}

/**
 * Тот же час местного времени станции на соседних сутках: вчерашних, сегодняшних и
 * завтрашних. Считает база из часового пояса пиццерии (D026), а не JavaScript: второго
 * календаря продукт не заводит, и на переводе часов он разошёлся бы с базой молча.
 */
function sameClockOn(now: Date, atLocalTime: string, dayShift: number) {
  return sql`(((${localDay(now)} + (${sql.raw(String(dayShift))})) + ${atLocalTime}::time) at time zone ${stores.timezone})`;
}

interface AlarmWindow {
  readonly stationId: string;
  /**
   * Границы текущего прохода окна станции. `null` — сейчас не открыт ни один её
   * чек-лист: будильнику негде жить, и панели на экране в этот момент тоже нет.
   *
   * Границы берутся по ВСЕМ открытым чек-листам станции — от самого раннего начала до
   * самого позднего конца. Будильник принадлежит станции, а не чек-листу, а планшет у
   * станции один; при этом каждое открытое окно содержит текущий миг, поэтому их
   * объединение — один непрерывный промежуток, а не набор кусков.
   */
  readonly opensAt: Date | null;
  readonly closesAt: Date | null;
  /** Кандидаты в миг звонка по возрастанию: вчера, сегодня, завтра. */
  readonly moments: readonly Date[];
}

/**
 * Станция отсканированного кода, границы прохода окна её чек-листов и мгновения, в
 * которые может прозвонить названное время.
 *
 * Одним запросом и левым соединением, а не двумя: станция без открытого чек-листа
 * обязана отличаться от несуществующей — первой отвечают «не те часы», второй «нет
 * такой станции», и перебор кодов не должен видеть между ними разницы по другому
 * признаку.
 */
/** Отметка «…Z» из запроса в момент времени; пустая — это пустой момент, а не ноль. */
function momentOf(value: string | null): Date | null {
  return value === null ? null : new Date(value);
}

async function alarmWindow(
  code: string,
  now: Date,
  atLocalTime = "00:00",
): Promise<AlarmWindow | null> {
  const [row] = await getDb()
    .select({
      stationId: stations.id,
      opensAt: utcText<string | null>(sql`min(${windowOpensAt(now)})`),
      closesAt: utcText<string | null>(sql`max(${windowClosesAt(now)})`),
      yesterday: utcText(sameClockOn(now, atLocalTime, -1)),
      today: utcText(sameClockOn(now, atLocalTime, 0)),
      tomorrow: utcText(sameClockOn(now, atLocalTime, 1)),
    })
    .from(stations)
    .innerJoin(stores, eq(stations.storeId, stores.id))
    .leftJoin(
      checklists,
      and(
        eq(checklists.stationId, stations.id),
        isNull(checklists.archivedAt),
        windowIsOpen(now),
        exists(
          getDb()
            .select({ published: sql`1` })
            .from(checklistVersions)
            .where(
              and(
                eq(checklistVersions.checklistId, checklists.id),
                eq(checklistVersions.status, "published"),
                eq(checklistVersions.stationId, stations.id),
              ),
            ),
        ),
      ),
    )
    .where(eq(stations.code, code))
    .groupBy(stations.id, stores.timezone)
    .limit(1);

  if (row === undefined) return null;
  return {
    stationId: row.stationId,
    opensAt: momentOf(row.opensAt),
    closesAt: momentOf(row.closesAt),
    // Пустых мгновений здесь не бывает — они считаются из одного часового пояса и
    // названного времени. Пустыми их считает тип: левое соединение делает пустым всё
    // считанное запросом, и разбирать их приходится тем же способом, что и границы.
    moments: [row.yesterday, row.today, row.tomorrow]
      .map(momentOf)
      .filter((moment): moment is Date => moment !== null),
  };
}

/** Станция отсканированного кода — и ничего больше: нужна снятию будильника. */
async function stationIdForCode(code: string): Promise<string | null> {
  if (!isPlausibleCode(code)) return null;
  const [row] = await getDb()
    .select({ stationId: stations.id })
    .from(stations)
    .where(eq(stations.code, code))
    .limit(1);
  return row?.stationId ?? null;
}

/**
 * Будильники станции в границах текущего прохода окна её чек-листов.
 *
 * «До конца окна чек-листа» (D090) держится этим отбором, а не уборкой по расписанию:
 * строка прошлого прохода просто перестаёт читаться. Фоновая работа, которая что-то
 * удаляет по часам, здесь была бы лишним механизмом с собственными сбоями.
 *
 * Отбор идёт по мигу звонка, а не по местной дате, и это и есть суть правки: будильник
 * на 00:30, поставленный в 23:40, принадлежит уже СЛЕДУЮЩИМ местным суткам и из выборки
 * «на сегодня» исчезал бы ровно в полночь — то есть не звонил бы.
 *
 * Неизвестный код отдаёт пустой список, а не отказ: экран на этом месте уже знает,
 * что код живой, а перебору знать про будильники нечего (D021).
 */
export async function listAlarms(
  code: string,
  now: Date,
): Promise<readonly AlarmView[]> {
  if (!isPlausibleCode(code)) return [];

  const hours = await alarmWindow(code, now);
  if (hours === null) return [];
  const { opensAt, closesAt } = hours;
  if (opensAt === null || closesAt === null) return [];

  return (
    getDb()
      .select({
        id: alarms.id,
        atLocalTime: sql<string>`to_char(${alarms.at} at time zone ${stores.timezone}, 'HH24:MI')`,
        label: alarms.label,
        ringsInSeconds: sql<number>`floor(extract(epoch from (${alarms.at} - ${now.toISOString()}::timestamptz)))::int`,
      })
      .from(alarms)
      .innerJoin(stations, eq(alarms.stationId, stations.id))
      .innerJoin(stores, eq(stations.storeId, stores.id))
      .where(
        and(
          eq(stations.code, code),
          gte(alarms.at, opensAt),
          lt(alarms.at, closesAt),
        ),
      )
      // Второй ключ сортировки обязателен: два будильника на одну минуту иначе идут
      // в неопределённом порядке, и список переставлялся бы от запроса к запросу.
      .orderBy(asc(alarms.at), asc(alarms.id))
  );
}

/**
 * Заводит будильник на текущий проход окна чек-листа.
 *
 * Предел — конец окна, а не местная полночь (D090). Пиццерия, работающая до 02:00,
 * ставит в 23:40 будильник на 00:30: он попадает в тот же проход окна, хотя местные
 * сутки за это время сменились. Названное время, которое в окно не попадает вовсе,
 * отвергается отдельным отказом — сотрудник ошибся часом, а не прислал негодное тело.
 *
 * Время, уже прошедшее ВНУТРИ окна, по-прежнему отвергается вслух. Молча перенести
 * его на следующий проход было бы удобнее в коде и хуже на кухне: записка, тихо
 * уехавшая в завтра, не прозвенит ни сегодня, ни на глазах у той смены, которая её
 * завела. Это выбор владельца, а не недосмотр.
 */
export async function setAlarm(
  input: unknown,
  now: Date,
): Promise<AlarmOutcome> {
  const parsed = parseAlarmInput(input);
  if (!parsed.ok) return refuse(parsed.reason);

  const { code, atLocalTime, label } = parsed.value;

  const rate = checkAlarmAllowed(code, now);
  if (!rate.allowed) return refuse("rate-limited", rate.retryAfterSeconds);

  const hours = await alarmWindow(code, now, atLocalTime);
  if (hours === null) return refuse("unknown-code");
  const { opensAt, closesAt } = hours;
  if (opensAt === null || closesAt === null) return refuse("outside-window");

  const withinWindow = hours.moments.filter(
    (moment) =>
      moment.getTime() >= opensAt.getTime() &&
      moment.getTime() < closesAt.getTime(),
  );
  if (withinWindow.length === 0) return refuse("outside-window");

  // Кандидаты идут по возрастанию, поэтому первый же ещё не наступивший и есть
  // ближайший миг звонка. Не наступило ни одного — время этого прохода уже позади.
  const fireAt = withinWindow.find(
    (moment) => moment.getTime() > now.getTime(),
  );
  if (fireAt === undefined) return refuse("past-time");

  const [existing] = await getDb()
    .select({ count: sql<number>`count(*)::int` })
    .from(alarms)
    .where(
      and(
        eq(alarms.stationId, hours.stationId),
        gte(alarms.at, opensAt),
        lt(alarms.at, closesAt),
      ),
    );
  // Потолок считается перед вставкой, а не правилом базы: две одновременные записи
  // могут проскочить на одну сверх предела, и это осознанно. Потолок здесь — заслон
  // от набивания станции с улицы, а не правило целостности, ради которого стоило бы
  // держать в базе счётчик со своей блокировкой.
  //
  // Считается он по тем же границам, что и показ: иначе на экране было бы меньше
  // строк, чем разрешено, а отказ «больше нельзя» всё равно приходил бы.
  if ((existing?.count ?? 0) >= ALARM_LIMITS.maxPerStationPerWindow) {
    return refuse("too-many");
  }

  await getDb().insert(alarms).values({
    stationId: hours.stationId,
    at: fireAt,
    label,
  });

  return { kind: "alarms", alarms: await listAlarms(code, now) };
}

/**
 * Снимает будильник станции отсканированного кода.
 *
 * Опознаватель приходит из браузера, то есть от кого угодно, — поэтому удаление всегда
 * ограничено станцией этого кода. Без этого условия один живой код с наклейки позволял бы
 * гасить будильники любой станции сети, и на той станции это выглядело бы как «планшет
 * перестал звонить сам по себе».
 *
 * Снятие несуществующего будильника отвечает так же, как снятие своего: различать их
 * значило бы отвечать перебору по-разному. Для экрана это к тому же верно по существу —
 * будильник, снятый со второго планшета минуту назад, снят, и сообщать об ошибке не о чем.
 */
export async function dropAlarm(
  input: unknown,
  now: Date,
): Promise<AlarmOutcome> {
  const parsed = parseAlarmRemoval(input);
  if (!parsed.ok) return refuse(parsed.reason);

  const { code, alarmId } = parsed.value;

  const rate = checkAlarmAllowed(code, now);
  if (!rate.allowed) return refuse("rate-limited", rate.retryAfterSeconds);

  const stationId = await stationIdForCode(code);
  if (stationId === null) return refuse("unknown-code");

  await getDb()
    .delete(alarms)
    .where(and(eq(alarms.id, alarmId), eq(alarms.stationId, stationId)));

  return { kind: "alarms", alarms: await listAlarms(code, now) };
}
