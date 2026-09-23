// Когда у привязанной вкладки само сменится состояние.
//
// Вкладка планшета висит открытой сутками, и разметку ей отрисовал сервер: сама она не
// узнает, что окно чек-листа закрылось или открылось следующее. Часы перерисовки в
// продукте уже есть (`fill/ui/refresh-clock.ts`), но заведены они внутри плашки просрочки,
// то есть существуют только у станции с обходами. Здесь считается та же величина для
// смены состояния ВООБЩЕ — конца открытого окна и открытия следующего.
//
// Время считается по местному времени пиццерии (D026): часы кухонного планшета врут, а
// окно чек-листа задано её местным временем.
import { and, eq, isNull } from "drizzle-orm";

import {
  checklistVersions,
  checklists,
  getDb,
  stations,
  stores,
} from "@/blocks/data";

const SECONDS_IN_DAY = 24 * 60 * 60;
const MILLISECONDS = 1000;

/** Окно чек-листа местным временем пиццерии: «06:00:00» — «12:00:00». */
export interface DayWindow {
  readonly start: string;
  readonly end: string;
}

/** Все окна станции и часовой пояс её пиццерии — всё, что нужно часам вкладки. */
export interface StationWindows {
  readonly windows: readonly DayWindow[];
  readonly timeZone: string;
}

/**
 * Окна опубликованных чек-листов станции. Именно опубликованных: чек-лист без версии не
 * открывается ни в одну минуту, и считать его границы значило бы будить вкладку впустую.
 */
export async function stationWindows(
  stationCode: string,
): Promise<StationWindows | null> {
  if (stationCode === "") return null;

  const rows = await getDb()
    .selectDistinct({
      start: checklists.windowStart,
      end: checklists.windowEnd,
      timeZone: stores.timezone,
    })
    .from(stations)
    .innerJoin(stores, eq(stations.storeId, stores.id))
    .innerJoin(checklists, eq(checklists.stationId, stations.id))
    .innerJoin(
      checklistVersions,
      and(
        eq(checklistVersions.checklistId, checklists.id),
        eq(checklistVersions.status, "published"),
        eq(checklistVersions.stationId, stations.id),
      ),
    )
    .where(and(eq(stations.code, stationCode), isNull(checklists.archivedAt)));

  const first = rows[0];
  if (first === undefined) return null;

  return {
    timeZone: first.timeZone,
    windows: rows.map((row) => ({ start: row.start, end: row.end })),
  };
}

const TIME_PARTS = 3;

/** «06:30:00» → 23400 секунд от начала местных суток. Негодное значение — `null`. */
function secondsOfClock(value: string): number | null {
  const parts = value.split(":");
  if (parts.length < 2 || parts.length > TIME_PARTS) return null;

  const numbers = parts.map(Number);
  if (numbers.some((part) => !Number.isInteger(part) || part < 0)) return null;

  const [hours = 0, minutes = 0, seconds = 0] = numbers;
  return hours * 60 * 60 + minutes * 60 + seconds;
}

/**
 * Сколько секунд прошло с начала местных суток пиццерии.
 *
 * Через `Intl`, а не арифметикой над смещением: переход на летнее время и получасовые
 * пояса иначе дают ошибку в час, и вкладка просыпалась бы не на границе окна.
 */
export function secondsOfDay(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);

  const value = (type: string): number =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");

  return value("hour") * 60 * 60 + value("minute") * 60 + value("second");
}

function isOpen(window: DayWindow, nowSeconds: number): boolean {
  const start = secondsOfClock(window.start);
  const end = secondsOfClock(window.end);
  if (start === null || end === null) return false;

  // Окно ночной пиццерии переходит через полночь: тогда открыто «после начала ИЛИ
  // до конца». Ровно то же условие стоит в запросе выбора версии.
  return start <= end
    ? nowSeconds >= start && nowSeconds < end
    : nowSeconds >= start || nowSeconds < end;
}

/** Сколько секунд до ближайшего наступления этого времени суток. Ноль — значит сутки. */
function untilClock(value: string, nowSeconds: number): number | null {
  const at = secondsOfClock(value);
  if (at === null) return null;

  const delta = (at - nowSeconds + SECONDS_IN_DAY) % SECONDS_IN_DAY;
  // Ровно сейчас — значит состояние уже сменилось, а следующий такой же миг через сутки.
  return delta === 0 ? SECONDS_IN_DAY : delta;
}

/** Что вкладке нужно знать о времени: когда проснуться и какое окно идёт сейчас. */
export interface TabletClock {
  /**
   * Через сколько секунд состояние сменится само. `null` — у станции нет ни одного
   * опубликованного чек-листа, и просыпаться не за чем.
   */
  readonly nextChangeInSeconds: number | null;
  /**
   * Опознаватель текущего окна. Сменился — форма снимается вместе с недозаполненным
   * черновиком: обновление страницы его НЕ уносит, черновик живёт в состоянии формы.
   * Внутри — миг конца открытого окна, а не «сколько осталось»: величина обязана быть
   * одной и той же всю дорогу до границы, иначе форма снималась бы на каждой отрисовке.
   */
  readonly windowKey: string;
  /**
   * Через сколько секунд откроется следующее окно, когда сейчас не открыто ни одного.
   * `null` — окно уже идёт или окон нет вовсе.
   */
  readonly opensInSeconds: number | null;
}

const NO_WINDOW_KEY = "нет-окна";

/** Считает часы вкладки по окнам станции и местному времени пиццерии. */
export function tabletClock(
  station: StationWindows | null,
  at: Date,
): TabletClock {
  if (station === null || station.windows.length === 0) {
    return {
      nextChangeInSeconds: null,
      windowKey: NO_WINDOW_KEY,
      opensInSeconds: null,
    };
  }

  const nowSeconds = secondsOfDay(at, station.timeZone);
  const open = station.windows.filter((window) => isOpen(window, nowSeconds));

  const boundaries = station.windows.flatMap((window) =>
    [untilClock(window.start, nowSeconds), untilClock(window.end, nowSeconds)]
      .filter((value): value is number => value !== null)
      .map((value) => value),
  );
  const nextChangeInSeconds =
    boundaries.length === 0 ? null : Math.min(...boundaries);

  const opensInSeconds =
    open.length > 0
      ? null
      : (() => {
          const starts = station.windows
            .map((window) => untilClock(window.start, nowSeconds))
            .filter((value): value is number => value !== null);
          return starts.length === 0 ? null : Math.min(...starts);
        })();

  // Ключ окна — миги концов всех открытых сейчас окон. Мгновением, а не остатком:
  // остаток меняется на каждой отрисовке, и форма снималась бы вместе с черновиком от
  // любого обновления страницы. Считается в целых секундах эпохи: через секунду остаток
  // меньше ровно на секунду, а сам миг тот же — именно это и делает ключ устойчивым.
  const nowEpochSeconds = Math.floor(at.getTime() / MILLISECONDS);
  const ends = open
    .map((window) => untilClock(window.end, nowSeconds))
    .filter((value): value is number => value !== null)
    .map((seconds) => String(nowEpochSeconds + seconds))
    .sort();

  return {
    nextChangeInSeconds,
    windowKey: ends.length === 0 ? NO_WINDOW_KEY : ends.join("+"),
    opensInSeconds,
  };
}
