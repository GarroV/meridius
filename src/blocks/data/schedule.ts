// Расписание периодической проверки: когда её ждут и какой проход идёт сейчас.
//
// Всё здесь — чистые функции над местным временем пиццерии. Часовой пояс применяет
// PostgreSQL (D026), и второго календаря в JavaScript продукт не заводит: два способа
// считать местное время расходятся на переводе часов, и расходятся молча.
//
// Система координат — МИНУТЫ ОТ НАЧАЛА ОКНА, а не от полуночи. Так окно через полночь
// (22:00–02:00) перестаёт быть особым случаем: проход окна всегда идёт вперёд от нуля,
// и ни одно сравнение не обязано помнить, перевалило ли за сутки.
import { isItemInMode } from "./severity";
import type {
  ChecklistWindow,
  Item,
  ScheduleSegment,
  ShiftMode,
} from "./types";

const MINUTES_IN_DAY = 24 * 60;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/;

/** Один проход периодической проверки: [начало, конец) в минутах от начала окна. */
export interface Interval {
  readonly startMinutes: number;
  readonly endMinutes: number;
}

/**
 * «ЧЧ:ММ» в минуты от полуночи. `null` — это не время.
 *
 * Секунды допускаются, потому что колонки `time` PostgreSQL возвращает как «08:00:00»:
 * без этого расписание, прочитанное из базы, не совпало бы с расписанием, написанным
 * человеком, — и не совпало бы тихо.
 */
export function parseLocalTime(value: string): number | null {
  const match = TIME_PATTERN.exec(value);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/** Минуты обратно во время. За сутками сворачивается: 25:00 — это 01:00. */
export function formatLocalTime(minutes: number): string {
  const inDay = ((minutes % MINUTES_IN_DAY) + MINUTES_IN_DAY) % MINUTES_IN_DAY;
  const hours = Math.floor(inDay / 60);
  return `${String(hours).padStart(2, "0")}:${String(inDay % 60).padStart(2, "0")}`;
}

export function isPeriodic(item: Item): boolean {
  return item.schedule !== undefined && item.schedule.length > 0;
}

/**
 * Длина прохода окна в минутах. Равные границы база не допускает
 * (`checklists_window_not_empty`), поэтому ноль сюда не приходит; окно через полночь
 * даёт длину больше остатка суток, и это верно.
 */
function windowLength(window: ChecklistWindow): number | null {
  const start = parseLocalTime(window.start);
  const end = parseLocalTime(window.end);
  if (start === null || end === null) return null;
  const length = (end - start + MINUTES_IN_DAY) % MINUTES_IN_DAY;
  return length === 0 ? MINUTES_IN_DAY : length;
}

/**
 * Сколько минут прошло от начала окна к этому местному времени.
 * `null` — время вне окна, то есть чек-лист в этот момент не работает.
 */
export function offsetInWindow(
  window: ChecklistWindow,
  localTime: string,
): number | null {
  const start = parseLocalTime(window.start);
  const length = windowLength(window);
  const at = parseLocalTime(localTime);
  if (start === null || length === null || at === null) return null;
  const offset = (at - start + MINUTES_IN_DAY) % MINUTES_IN_DAY;
  return offset < length ? offset : null;
}

function isSegment(value: unknown): value is ScheduleSegment {
  if (typeof value !== "object" || value === null) return false;
  const segment = value as Partial<ScheduleSegment>;
  return (
    typeof segment.from === "string" &&
    typeof segment.to === "string" &&
    typeof segment.everyMinutes === "number"
  );
}

/**
 * Проверка расписания на границе записи: импорт пакета и редактор зовут её ДО того,
 * как расписание уедет в неизменяемую версию. Сломанное расписание там неисправимо —
 * версии не переписываются (принцип 3, D002), — поэтому отказ громкий и на входе.
 */
export function assertValidSchedule(
  schedule: readonly ScheduleSegment[],
): void {
  if (!Array.isArray(schedule)) {
    throw new TypeError("Расписание должно быть списком отрезков");
  }
  for (const segment of schedule) {
    if (!isSegment(segment)) {
      throw new TypeError(
        `Отрезок расписания должен быть { from, to, everyMinutes }, получено ${JSON.stringify(segment)}`,
      );
    }
    const from = parseLocalTime(segment.from);
    const to = parseLocalTime(segment.to);
    if (from === null || to === null) {
      throw new RangeError(
        `Время отрезка не разобрано: «${segment.from}» — «${segment.to}»`,
      );
    }
    if (from === to) {
      throw new RangeError(
        `Пустой отрезок ${segment.from}—${segment.to}: он не дал бы ни одного обхода, и не дал бы молча`,
      );
    }
    if (!Number.isInteger(segment.everyMinutes) || segment.everyMinutes <= 0) {
      throw new RangeError(
        `Шаг должен быть целым числом минут больше нуля, получено ${String(segment.everyMinutes)}`,
      );
    }
  }
}

/**
 * Сетка проходов пункта за один проход окна, в минутах от его начала.
 *
 * Пустой список значит «сегодня этой проверки нет» и приходит по трём разным поводам:
 * пункт не периодический, пункт выпал по режиму смены (D067) или его отрезки лежат
 * целиком вне окна чек-листа. Все три — законные состояния, а не отказ.
 */
export function intervalsForItem(
  item: Item,
  window: ChecklistWindow,
  mode: ShiftMode,
): Interval[] {
  if (!isPeriodic(item)) return [];
  // Пункт, выпавший по уровню, сегодня не существует вовсе: он не создаёт ни проходов,
  // ни пропусков. Иначе критичная смена копила бы к вечеру гору тревог по работе,
  // которую сама же и отменила.
  if (!isItemInMode(item, mode)) return [];

  const windowStart = parseLocalTime(window.start);
  const length = windowLength(window);
  if (windowStart === null || length === null) return [];

  const schedule = item.schedule ?? [];
  assertValidSchedule(schedule);

  const intervals: Interval[] = [];
  for (const segment of schedule) {
    const from = parseLocalTime(segment.from);
    const to = parseLocalTime(segment.to);
    if (from === null || to === null) continue;

    const segmentLength = (to - from + MINUTES_IN_DAY) % MINUTES_IN_DAY;
    const offset = (from - windowStart + MINUTES_IN_DAY) % MINUTES_IN_DAY;

    // Отрезок примеряется к проходу ДВАЖДЫ — на своём смещении и на сутки раньше.
    // Без второй примерки отрезок, начинающийся до окна (06:00–10:00 при окне с 08:00),
    // неотличим от отрезка поздно в проходе: остаток от деления сворачивает «минус два
    // часа» в «плюс двадцать два», и обход молча пропадал бы вместо того, чтобы
    // обрезаться началом окна.
    for (const base of [offset - MINUTES_IN_DAY, offset]) {
      const segmentEnd = base + segmentLength;
      const lo = Math.max(base, 0);
      const hi = Math.min(segmentEnd, length);
      if (hi <= lo) continue;

      // Шаг отсчитывается от начала САМОГО отрезка, а не от места обрезки: иначе сетка
      // съезжала бы с круглых часов, стоило окну начаться не на границе шага.
      for (
        let start = base;
        start < segmentEnd;
        start += segment.everyMinutes
      ) {
        const startMinutes = Math.max(start, lo);
        const endMinutes = Math.min(start + segment.everyMinutes, hi);
        if (endMinutes <= startMinutes) continue;
        intervals.push({ startMinutes, endMinutes });
      }
    }
  }

  return intervals.sort((a, b) => a.startMinutes - b.startMinutes);
}

/**
 * Проход, идущий прямо сейчас. Граница принадлежит начинающемуся проходу:
 * ровно в 10:00 идёт десятичасовой, а не девятичасовой.
 */
export function currentInterval(
  intervals: readonly Interval[],
  offsetMinutes: number,
): Interval | null {
  return (
    intervals.find(
      (interval) =>
        offsetMinutes >= interval.startMinutes &&
        offsetMinutes < interval.endMinutes,
    ) ?? null
  );
}

/**
 * Проходы, которые уже закрылись. Только по ним может быть пропуск: идущий проход
 * ещё можно пройти, и объявлять его пропущенным значит торопить смену.
 */
export function closedIntervals(
  intervals: readonly Interval[],
  offsetMinutes: number,
): Interval[] {
  return intervals.filter((interval) => interval.endMinutes <= offsetMinutes);
}
