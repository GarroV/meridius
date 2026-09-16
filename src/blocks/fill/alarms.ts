// Будильники станции: третья точка записи продукта, открытая интернету (D070, T139).
//
// Что это такое по существу. Сотрудник вручную вносит время и подпись — «вынести тесто
// в 14:30», — и планшет в это время звонит. Ни регулярности, ни справочника продуктов,
// ни учёта списаний за этим нет и не будет (D069): это записка под рукой, а не подсистема.
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
import { and, asc, eq, sql } from "drizzle-orm";

import { alarms, getDb, stations, stores } from "@/blocks/data";

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

interface AlarmPlace {
  readonly stationId: string;
  readonly localDate: string;
  readonly fireAt: Date;
}

/**
 * Станция отсканированного кода вместе с её сегодняшними местными сутками и мигом,
 * в который прозвонит названное время.
 *
 * Оба считает база из часового пояса пиццерии (D026), а не JavaScript: второго календаря
 * продукт не заводит, и на переводе часов он разошёлся бы с базой молча. Миг приходит
 * сюда полной отметкой в UTC («…Z») и только разбирается здесь: часовой пояс из неё уже
 * убран базой, так что разбор однозначен и от часов сервера не зависит.
 */
async function alarmPlace(
  code: string,
  atLocalTime: string,
  now: Date,
): Promise<AlarmPlace | null> {
  const localMoment = sql`((to_char(${localNow(now)}, 'YYYY-MM-DD') || ' ' || ${atLocalTime}::text)::timestamp at time zone ${stores.timezone})`;

  const [row] = await getDb()
    .select({
      stationId: stations.id,
      localDate: sql<string>`to_char(${localNow(now)}, 'YYYY-MM-DD')`,
      fireAtUtc: sql<string>`to_char(${localMoment} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`,
    })
    .from(stations)
    .innerJoin(stores, eq(stations.storeId, stores.id))
    .where(eq(stations.code, code))
    .limit(1);

  if (row === undefined) return null;
  return {
    stationId: row.stationId,
    localDate: row.localDate,
    fireAt: new Date(row.fireAtUtc),
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
 * Будильники станции на её сегодняшние местные сутки.
 *
 * «До конца местных суток станции» (D070) держится этим запросом, а не уборкой по
 * расписанию: вчерашняя строка просто перестаёт читаться. Фоновая работа, которая
 * что-то удаляет по часам, здесь была бы лишним механизмом с собственными сбоями.
 *
 * Неизвестный код отдаёт пустой список, а не отказ: экран на этом месте уже знает,
 * что код живой, а перебору знать про будильники нечего (D021).
 */
export async function listAlarms(
  code: string,
  now: Date,
): Promise<readonly AlarmView[]> {
  if (!isPlausibleCode(code)) return [];

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
          sql`${alarms.localDate} = (${localNow(now)})::date`,
        ),
      )
      // Второй ключ сортировки обязателен: два будильника на одну минуту иначе идут
      // в неопределённом порядке, и список переставлялся бы от запроса к запросу.
      .orderBy(asc(alarms.at), asc(alarms.id))
  );
}

/**
 * Заводит будильник на сегодня.
 *
 * Время, которое сегодня уже прошло, отвергается вслух. Молча перенести его на завтра
 * было бы удобнее в коде и хуже на кухне: будильник живёт до конца местных суток станции
 * (D070), и записка, тихо уехавшая в завтра, не прозвенит ни сегодня, ни на глазах у той
 * смены, которая её завела. Ночная смена через полночь так будильник поставить не может —
 * это названная граница, а не недосмотр.
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

  const place = await alarmPlace(code, atLocalTime, now);
  if (place === null) return refuse("unknown-code");

  if (place.fireAt.getTime() <= now.getTime()) return refuse("past-time");

  const [existing] = await getDb()
    .select({ count: sql<number>`count(*)::int` })
    .from(alarms)
    .where(
      and(
        eq(alarms.stationId, place.stationId),
        eq(alarms.localDate, place.localDate),
      ),
    );
  // Потолок считается перед вставкой, а не правилом базы: две одновременные записи
  // могут проскочить на одну сверх предела, и это осознанно. Потолок здесь — заслон
  // от набивания станции с улицы, а не правило целостности, ради которого стоило бы
  // держать в базе счётчик со своей блокировкой.
  if ((existing?.count ?? 0) >= ALARM_LIMITS.maxPerStationPerDay) {
    return refuse("too-many");
  }

  await getDb().insert(alarms).values({
    stationId: place.stationId,
    localDate: place.localDate,
    at: place.fireAt,
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
