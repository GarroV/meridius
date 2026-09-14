// Отметки периодических проверок — обходов: обход прошли, появилась строка.
//
// Два правила держат весь модуль.
//
// Первое (D066): отметка всегда встаёт в проход, идущий СЕЙЧАС. Пропущенные проходы
// остаются пропущенными — отметка их не догоняет и не закрывает. Отказать сотруднику
// продукт при этом не может: он отмечает то, что действительно сделал, а сколько раз
// мимо прошли до него — вопрос к смене, а не к экрану.
//
// Второе (D053): пропуск нигде не хранится. Пропуск — это ОТСУТСТВИЕ строки против сетки
// расписания, и выводится он при чтении. Хранимый пропуск потребовал бы фоновой работы,
// которая его проставляет, и колонки состояния, которую после каждого сбоя чинят руками.
//
// Проход считает сервер по местному времени пиццерии (D026). С устройства он не приходит
// и прийти не может: планшет с уехавшими часами закрывал бы девятичасовой обход в
// одиннадцать, и девятичасовой переставал бы быть пропущенным.
import { and, asc, eq, sql } from "drizzle-orm";

import { getDb } from "./client";
import { flattenItems } from "./grading";
import {
  currentInterval,
  formatLocalTime,
  intervalsForItem,
  isPeriodic,
  offsetInWindow,
  parseLocalTime,
} from "./schedule";
import {
  checklistVersions,
  checklists,
  checks,
  stations,
  stores,
} from "./schema";
import { isItemInMode } from "./severity";
import { getShiftModeOnDate } from "./shift-modes";
import type {
  AnswerValue,
  ChecklistWindow,
  Item,
  Section,
  ShiftMode,
  VersionStatus,
} from "./types";

export interface SaveCheckInput {
  readonly versionId: string;
  readonly itemId: string;
  readonly value: AnswerValue;
  readonly comment?: string | undefined;
  /** Момент отметки. Время сервера, а не устройства: из него считается проход. */
  readonly at: Date;
}

/** Одна отметка обхода: кто-то прошёл проверку в этот проход. */
export interface CheckMark {
  readonly id: string;
  readonly itemId: string;
  /** Начало прохода в минутах от начала окна чек-листа. */
  readonly intervalStart: number;
  /** Местные сутки прохода окна, «ГГГГ-ММ-ДД». */
  readonly localDate: string;
  readonly at: Date;
  readonly value: AnswerValue;
  readonly comment: string | null;
}

/**
 * Состояние прохода на экране станции.
 * `done` — отметка есть; `missed` — проход закрылся без отметки; `open` — идёт сейчас;
 * `upcoming` — ещё не начался. Идущий проход пропущенным не считается: объявить его
 * пропуском значит торопить смену.
 */
export type IntervalState = "done" | "missed" | "open" | "upcoming";

export interface RoundInterval {
  readonly startMinutes: number;
  readonly endMinutes: number;
  /** Местное время начала прохода, «ЧЧ:ММ» — то, что читает смена. */
  readonly startLocalTime: string;
  readonly state: IntervalState;
  readonly marks: readonly CheckMark[];
}

export interface ItemRounds {
  readonly itemId: string;
  readonly intervals: readonly RoundInterval[];
  /** Проход, идущий прямо сейчас; `null` — сетка на сегодня кончилась. */
  readonly current: RoundInterval | null;
  readonly missedCount: number;
  /**
   * Отметки, не попавшие ни в один проход сегодняшней сетки: методист опубликовал
   * версию с другим шагом посреди смены, и утренние отметки в новую сетку не легли.
   * Показываются отдельно, а не выбрасываются: обход был сделан, и потерять его молча
   * хуже, чем показать не на своём месте.
   */
  readonly strayMarks: readonly CheckMark[];
}

export interface RoundsView {
  /** Местные сутки прохода окна: у окна через полночь это вчерашняя дата. */
  readonly localDate: string;
  readonly localTime: string;
  readonly offsetMinutes: number;
  readonly mode: ShiftMode;
  readonly window: ChecklistWindow;
  readonly items: readonly ItemRounds[];
}

interface VersionContext {
  status: VersionStatus;
  sections: Section[];
  checklistId: string;
  windowStart: string;
  windowEnd: string;
  stationId: string | null;
  storeId: string | null;
  localTime: string | null;
  localDate: string | null;
}

/** Станция, пиццерия и её местное время: всё, без чего проход не посчитать. */
interface Place {
  stationId: string;
  storeId: string;
  localTime: string;
  localDate: string;
}

/**
 * Версия вместе с окном её чек-листа и местным временем пиццерии на момент `at`.
 *
 * Станция берётся замороженная в версии, а не текущая у чек-листа: перенос чек-листа
 * между выдачей экрана и отметкой уводил бы обход в чужую историю (T056). Поэтому
 * присоединение станции внешнее — у черновика станции нет, и его нужно отличить от
 * несуществующей версии, а не потерять вместе с ней.
 */
async function loadVersionContext(
  versionId: string,
  at: Date,
): Promise<VersionContext | null> {
  const localTimestamp = sql`(${at.toISOString()}::timestamptz at time zone ${stores.timezone})`;

  const [row] = await getDb()
    .select({
      status: checklistVersions.status,
      sections: checklistVersions.sections,
      checklistId: checklists.id,
      windowStart: checklists.windowStart,
      windowEnd: checklists.windowEnd,
      stationId: checklistVersions.stationId,
      storeId: stores.id,
      // «ЧЧ:ММ» строкой, а не приведением к `time`: `now()` приносит микросекунды,
      // которых разбор времени не принимает, и расписание разошлось бы с базой молча.
      localTime: sql<string>`to_char(${localTimestamp}, 'HH24:MI')`,
      localDate: sql<string>`to_char(${localTimestamp}, 'YYYY-MM-DD')`,
    })
    .from(checklistVersions)
    .innerJoin(checklists, eq(checklistVersions.checklistId, checklists.id))
    .leftJoin(stations, eq(checklistVersions.stationId, stations.id))
    .leftJoin(stores, eq(stations.storeId, stores.id))
    .where(eq(checklistVersions.id, versionId))
    .limit(1);

  return row ?? null;
}

function placeOf(context: VersionContext): Place | null {
  const { stationId, storeId, localTime, localDate } = context;
  if (
    stationId === null ||
    storeId === null ||
    localTime === null ||
    localDate === null
  ) {
    return null;
  }
  return { stationId, storeId, localTime, localDate };
}

function windowOf(context: VersionContext): ChecklistWindow {
  return { start: context.windowStart, end: context.windowEnd };
}

/** Предыдущие календарные сутки. Считается по календарю, а не вычитанием суток из
 *  момента: перевод часов сдвинул бы момент, но даты не меняет. */
function previousLocalDate(localDate: string): string {
  const [year, month, day] = localDate.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    throw new RangeError(`Местная дата не разобрана: «${localDate}»`);
  }
  const shifted = new Date(Date.UTC(year, month - 1, day - 1));
  return shifted.toISOString().slice(0, 10);
}

/**
 * Местные сутки ПРОХОДА окна для текущего местного времени.
 *
 * У обычного окна это сегодняшние сутки. У окна через полночь (22:00–02:00) время до
 * конца окна относится к проходу, начавшемуся вчера: обход в час ночи принадлежит
 * вечерней смене, а не наступившему дню (D055).
 */
function passLocalDate(
  window: ChecklistWindow,
  localDate: string,
  localTime: string,
): string {
  const start = parseLocalTime(window.start);
  const end = parseLocalTime(window.end);
  const now = parseLocalTime(localTime);
  if (start === null || end === null || now === null) return localDate;
  if (start <= end) return localDate;
  return now >= start ? localDate : previousLocalDate(localDate);
}

function findItem(sections: Section[], itemId: string): Item | undefined {
  return flattenItems(sections).find((item) => item.id === itemId);
}

/**
 * Отметки одного прохода окна: по ЧЕК-ЛИСТУ, а не по версии. Методист публикует
 * следующую версию посреди смены (T041), и утренние обходы не имеют права исчезнуть
 * с экрана станции только потому, что экран теперь отдаёт другую версию.
 */
async function listMarks(
  checklistId: string,
  localDate: string,
): Promise<CheckMark[]> {
  return (
    getDb()
      .select({
        id: checks.id,
        itemId: checks.itemId,
        intervalStart: checks.intervalStart,
        localDate: checks.localDate,
        at: checks.at,
        value: checks.value,
        comment: checks.comment,
      })
      .from(checks)
      .innerJoin(checklistVersions, eq(checks.versionId, checklistVersions.id))
      .where(
        and(
          eq(checklistVersions.checklistId, checklistId),
          eq(checks.localDate, localDate),
        ),
      )
      // Второй ключ сортировки обязателен: отметки одной минуты иначе идут в неопределённом
      // порядке, и «последний обход» показывался бы разным от запроса к запросу.
      .orderBy(asc(checks.at), asc(checks.id))
  );
}

function stateOf(
  interval: { startMinutes: number; endMinutes: number },
  marks: readonly CheckMark[],
  offsetMinutes: number,
): IntervalState {
  if (marks.length > 0) return "done";
  if (interval.endMinutes <= offsetMinutes) return "missed";
  if (interval.startMinutes <= offsetMinutes) return "open";
  return "upcoming";
}

function roundsOfItem(
  item: Item,
  window: ChecklistWindow,
  mode: ShiftMode,
  offsetMinutes: number,
  marks: readonly CheckMark[],
): ItemRounds {
  const intervals = intervalsForItem(item, window, mode);
  const own = marks.filter((mark) => mark.itemId === item.id);
  const windowStart = parseLocalTime(window.start) ?? 0;

  const rounds = intervals.map((interval) => {
    const inside = own.filter(
      (mark) => mark.intervalStart === interval.startMinutes,
    );
    return {
      startMinutes: interval.startMinutes,
      endMinutes: interval.endMinutes,
      startLocalTime: formatLocalTime(windowStart + interval.startMinutes),
      state: stateOf(interval, inside, offsetMinutes),
      marks: inside,
    };
  });

  const covered = new Set(rounds.map((round) => round.startMinutes));

  return {
    itemId: item.id,
    intervals: rounds,
    current:
      rounds.find(
        (round) =>
          offsetMinutes >= round.startMinutes &&
          offsetMinutes < round.endMinutes,
      ) ?? null,
    missedCount: rounds.filter((round) => round.state === "missed").length,
    strayMarks: own.filter((mark) => !covered.has(mark.intervalStart)),
  };
}

/**
 * Ставит отметку обхода в проход, идущий сейчас.
 *
 * Отказывает, когда прохода не существует: чек-лист сейчас не работает, пункт не
 * периодический, сетка на сегодня кончилась или пункт выпал по режиму смены (D067).
 * Все отказы громкие и называют причину — молчаливо принятая отметка «в никуда» хуже
 * отказа: сотрудник уверен, что обход зачтён, а надзор его не видит.
 */
export async function saveCheck(input: SaveCheckInput): Promise<CheckMark> {
  const context = await loadVersionContext(input.versionId, input.at);
  if (context === null) {
    throw new Error(`Версия чек-листа не найдена: ${input.versionId}`);
  }
  if (context.status === "draft") {
    throw new Error(
      "Версия в состоянии «черновик» — это предпросмотр методиста, отмечать обходы в ней нельзя",
    );
  }
  const place = placeOf(context);
  if (place === null) {
    throw new Error(
      "У этой версии не заморожена станция: на момент публикации чек-лист не был ни к одной привязан, обход отметить невозможно",
    );
  }

  const window = windowOf(context);
  const offsetMinutes = offsetInWindow(window, place.localTime);
  if (offsetMinutes === null) {
    throw new Error(
      `Чек-лист сейчас не работает: местное время ${place.localTime}, окно ${window.start}—${window.end}`,
    );
  }

  const item = findItem(context.sections, input.itemId);
  if (item === undefined) {
    throw new Error(`Пункта ${input.itemId} нет в этой версии чек-листа`);
  }
  if (!isPeriodic(item)) {
    throw new Error(
      `Пункт ${input.itemId} не периодический: у него нет расписания обходов`,
    );
  }

  const localDate = passLocalDate(window, place.localDate, place.localTime);
  const mode = await getShiftModeOnDate(place.storeId, localDate);
  if (!isItemInMode(item, mode)) {
    throw new Error(
      `Пункт ${input.itemId} сегодня не в работе: режим смены «${mode}» его не показывает`,
    );
  }

  const interval = currentInterval(
    intervalsForItem(item, window, mode),
    offsetMinutes,
  );
  if (interval === null) {
    throw new Error(
      `Обхода сейчас не ждут: в ${place.localTime} расписание пункта ${input.itemId} прохода не даёт`,
    );
  }

  const [inserted] = await getDb()
    .insert(checks)
    .values({
      stationId: place.stationId,
      versionId: input.versionId,
      itemId: input.itemId,
      localDate,
      intervalStart: interval.startMinutes,
      value: input.value,
      comment: input.comment ?? null,
      // Время отметки — тот самый миг, из которого посчитан проход, а не `now()` базы
      // мгновением позже: иначе строка и её проход могли бы разойтись на границе часа.
      at: input.at,
    })
    .returning({
      id: checks.id,
      itemId: checks.itemId,
      intervalStart: checks.intervalStart,
      localDate: checks.localDate,
      at: checks.at,
      value: checks.value,
      comment: checks.comment,
    });

  if (inserted === undefined) {
    throw new Error("Отметка обхода не сохранилась");
  }
  return inserted;
}

/**
 * Состояние обходов чек-листа на момент `at`: сетка проходов каждого периодического
 * пункта, отметки на ней и пропуски, выведенные из расписания.
 *
 * `null` — показывать нечего: версии нет, у неё не заморожена станция или чек-лист
 * сейчас не работает. Для экрана станции все три — одно и то же «сейчас обходов нет».
 *
 * Пункты, выпавшие по режиму смены, в список не попадают: сегодня их не существует
 * вовсе (D067). Отметки, сделанные до перестановки режима, остаются в базе и видны
 * в отчёте — экран смены их не показывает намеренно.
 */
export async function getRounds(
  versionId: string,
  at: Date,
): Promise<RoundsView | null> {
  const context = await loadVersionContext(versionId, at);
  if (context === null) return null;
  const place = placeOf(context);
  if (place === null) return null;

  const window = windowOf(context);
  const offsetMinutes = offsetInWindow(window, place.localTime);
  if (offsetMinutes === null) return null;

  const localDate = passLocalDate(window, place.localDate, place.localTime);
  const mode = await getShiftModeOnDate(place.storeId, localDate);
  const marks = await listMarks(context.checklistId, localDate);

  const items = flattenItems(context.sections)
    .filter((item) => isPeriodic(item) && isItemInMode(item, mode))
    .map((item) => roundsOfItem(item, window, mode, offsetMinutes, marks));

  return {
    localDate,
    localTime: place.localTime,
    offsetMinutes,
    mode,
    window,
    items,
  };
}
