// Проходы окон, из которых собирается сетка отчёта: какие сутки попали в период, по
// какой версии считается каждые из них и сколько к моменту просмотра успело пройти.
//
// Ни одного запроса: всё местное время уже посчитано базой (D026) и приходит сюда
// строками. Разделение нарочное — правило «что вообще попало в отчёт» проверяется
// без базы, а с базой проверяется только то, что она и отдаёт.
import type { ChecklistWindow, Section, ShiftMode } from "@/blocks/data";
import { parseLocalTime, windowLength } from "@/blocks/data";

import type { RoundsDay } from "./rounds-grid";

const MINUTES_IN_DAY = 24 * 60;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Режим смены, когда его никто не переставлял. Тот же, что у тревог и у станции. */
const DEFAULT_MODE: ShiftMode = "normal";

/** Чек-лист области отчёта вместе с местным «сейчас» его пиццерии. */
export interface ReportChecklist {
  readonly checklistId: string;
  readonly storeId: string;
  readonly window: ChecklistWindow;
  /** Местные календарные сутки пиццерии на момент просмотра, «ГГГГ-ММ-ДД». */
  readonly localDate: string;
  /** Местное время пиццерии на момент просмотра, «ЧЧ:ММ». */
  readonly localTime: string;
}

/**
 * Опубликованная версия чек-листа: содержимое и местная дата публикации.
 *
 * Дата, а не момент: сутки — единица отчёта, и делить один проход окна между двумя
 * расписаниями нельзя, иначе у суток окажется два несовместимых набора колонок.
 */
export interface ReportVersion {
  readonly checklistId: string;
  readonly publishedLocalDate: string;
  readonly sections: readonly Section[];
}

/** Перестановка режима смены: за одни сутки их может быть несколько. */
export interface ReportShiftMode {
  readonly storeId: string;
  readonly localDate: string;
  readonly mode: ShiftMode;
}

export interface RoundsDaysInput {
  readonly checklists: readonly ReportChecklist[];
  readonly versions: readonly ReportVersion[];
  /** В порядке перестановки: последняя за сутки и действует. */
  readonly shiftModes: readonly ReportShiftMode[];
  /** Сколько местных суток показывает отчёт, считая сегодняшние. */
  readonly dayCount: number;
}

/**
 * Местная дата со сдвигом на целые сутки. Считается по календарю, а не вычитанием
 * суток из момента: сутки перевода часов длятся 23 или 25 часов, а дата от этого
 * не меняется.
 */
export function shiftLocalDate(localDate: string, deltaDays: number): string {
  const [year, month, day] = localDate.split("-").map(Number);
  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day)
  ) {
    throw new RangeError(`Местная дата не разобрана: «${localDate}»`);
  }
  const shifted = new Date(Date.UTC(year, month - 1, day + deltaDays));
  return shifted.toISOString().slice(0, 10);
}

/** Местная дата в момент UTC-полуночи: сравнивать сутки по календарю, а не по часам. */
function midnightOf(localDate: string): number {
  return Date.parse(`${localDate}T00:00:00Z`);
}

/** Сколько суток от одной местной даты до другой. */
function daysBetween(from: string, to: string): number {
  const delta = midnightOf(to) - midnightOf(from);
  if (Number.isNaN(delta)) {
    throw new RangeError(`Местная дата не разобрана: «${from}» → «${to}»`);
  }
  return Math.round(delta / MS_PER_DAY);
}

/**
 * Версия, действовавшая в эти сутки: последняя опубликованная не позже них.
 *
 * `null` — чек-листа в этот день ещё не существовало: ждать было нечего, и пропуск
 * за такие сутки был бы выдуманным.
 *
 * Публикация посреди смены берётся целиком на эти сутки, а не делит их: отметки,
 * сделанные утром по прежнему шагу, в новую сетку не лягут и попадут в счёт
 * `strayMarkCount`, который отчёт называет вслух. Разделить сутки надвое значило бы
 * показать два набора колонок за один проход окна.
 */
function versionOnDate(
  versions: readonly ReportVersion[],
  localDate: string,
): ReportVersion | null {
  let chosen: ReportVersion | null = null;
  for (const version of versions) {
    if (version.publishedLocalDate > localDate) continue;
    if (
      chosen === null ||
      version.publishedLocalDate >= chosen.publishedLocalDate
    ) {
      chosen = version;
    }
  }
  return chosen;
}

/** Ключ режима смены: перестановки приходят по пиццерии и суткам. */
function modeKey(storeId: string, localDate: string): string {
  return `${storeId} ${localDate}`;
}

function modesOf(rows: readonly ReportShiftMode[]): Map<string, ShiftMode> {
  const modes = new Map<string, ShiftMode>();
  // Строки идут в порядке перестановки, поэтому последняя за сутки и остаётся.
  for (const row of rows)
    modes.set(modeKey(row.storeId, row.localDate), row.mode);
  return modes;
}

/**
 * Сутки прохода окна, попавшие в период отчёта.
 *
 * Период — те же местные календарные сутки, что и у ленты: одна и та же строка
 * фильтра обязана значить на двух экранах одно и то же. Проход попадает в отчёт, если
 * он ЗАДЕЛ период, а не только если начался внутри него: у окна через полночь
 * (20:00–02:00) вечерний проход кончается уже следующими сутками, и по началу
 * управляющий не увидел бы в «сегодня» ровно ту смену, которая сейчас и работает.
 */
function passDatesOf(checklist: ReportChecklist, dayCount: number): string[] {
  const start = parseLocalTime(checklist.window.start);
  const length = windowLength(checklist.window);
  if (start === null || length === null) return [];

  // Минуты считаются от местной полуночи сегодняшних суток: период — от начала
  // первых суток до конца сегодняшних, как и у ленты (`resolvePeriod`).
  const periodStart = -(dayCount - 1) * MINUTES_IN_DAY;
  const periodEnd = MINUTES_IN_DAY;

  const dates: string[] = [];
  // На сутки глубже периода: проход, начавшийся тогда, ещё может задеть его край.
  for (let back = dayCount; back >= 0; back -= 1) {
    const passStart = -back * MINUTES_IN_DAY + start;
    if (passStart >= periodEnd || passStart + length <= periodStart) continue;
    dates.push(shiftLocalDate(checklist.localDate, -back));
  }
  return dates;
}

/**
 * Сколько минут прохода прошло к моменту просмотра. По нему и только по нему сетка
 * решает, закрылся ли интервал.
 *
 * Считается от начала прохода до местного «сейчас» — без отдельного случая для окна
 * через полночь и без вопроса «какой проход идёт сейчас»: у прошедших суток число
 * заведомо больше длины окна, у сегодняшних режет сетку там, где стоит смена.
 */
function elapsedMinutes(checklist: ReportChecklist, passDate: string): number {
  const start = parseLocalTime(checklist.window.start);
  const now = parseLocalTime(checklist.localTime);
  if (start === null || now === null) return 0;

  const elapsed =
    daysBetween(passDate, checklist.localDate) * MINUTES_IN_DAY + now - start;
  // Ноль, а не отрицательное число: «проход ещё не начался» и «начался только что» —
  // одно состояние сетки, в ней всё впереди.
  return Math.max(elapsed, 0);
}

/**
 * Проходы окон за период отчёта — вход для `buildRoundsGrid`.
 *
 * Порядок: по чек-листу, внутри — по возрастанию суток. Сетка сортирует сутки сама,
 * но отчёт читают и по журналу запроса, а перемешанный порядок там нечитаем.
 */
export function buildRoundsDays(input: RoundsDaysInput): RoundsDay[] {
  const modes = modesOf(input.shiftModes);
  const days: RoundsDay[] = [];

  const ordered = [...input.checklists].sort((a, b) =>
    a.checklistId < b.checklistId ? -1 : a.checklistId > b.checklistId ? 1 : 0,
  );

  for (const checklist of ordered) {
    const versions = input.versions.filter(
      (version) => version.checklistId === checklist.checklistId,
    );

    for (const localDate of passDatesOf(checklist, input.dayCount)) {
      const version = versionOnDate(versions, localDate);
      if (version === null) continue;

      days.push({
        checklistId: checklist.checklistId,
        localDate,
        window: checklist.window,
        mode: modes.get(modeKey(checklist.storeId, localDate)) ?? DEFAULT_MODE,
        sections: version.sections,
        elapsedMinutes: elapsedMinutes(checklist, localDate),
      });
    }
  }

  return days;
}
