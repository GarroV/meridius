// Статус чек-листа на сегодня (D179): заполнен, ждёт окна, окно открыто, пропущен.
//
// Правило чистое — без базы и без календаря: границы проходов, время заполнения и режим
// смены уже посчитаны запросом в местном времени пиццерии (`today-windows.ts`, D026), а
// здесь только сравниваются моменты. Ядро (constitution, «Ядро и обвязка»): неверный
// статус выглядит ровно как верный.
//
// Какой проход «сегодняшний». У обычного окна он один. У окна через полночь их два:
// закончившийся сегодня (вчерашний вечер) и начавшийся сегодня (сегодняшний вечер).
// Статус говорит об открытом сейчас проходе, если такой есть, иначе — о закончившемся
// сегодня. Тревога о пропуске (`isMissedToday`) смотрит только на закончившийся: в 23:00
// вечер открыт, но вчерашний пропуск от этого не перестаёт быть фактом (D054).

/** Один проход окна чек-листа: что о нём известно к моменту просмотра. */
export interface PassFacts {
  readonly startAt: Date;
  readonly endAt: Date;
  /** Последнее заполнение внутри прохода; `null` — не заполняли. */
  readonly filledAt: Date | null;
  /** В режиме смены этого прохода в чек-листе остался хотя бы один пункт (D055, D056). */
  readonly expected: boolean;
}

/** Два прохода «сегодня»; у обычного окна это один и тот же проход. */
export interface ChecklistDay {
  readonly endingToday: PassFacts;
  readonly startingToday: PassFacts;
}

export type TodayStatus =
  | { readonly kind: "filled"; readonly at: Date }
  /** Окно ещё не открылось; `at` — когда откроется. */
  | { readonly kind: "upcoming"; readonly at: Date }
  /** Окно открыто, заполнения нет; `at` — когда закроется. */
  | { readonly kind: "open"; readonly at: Date }
  /** Окно закрылось пустым; `at` — когда закрылось. */
  | { readonly kind: "missed"; readonly at: Date }
  /** Режим смены отменил чек-лист: от смены его не ждали. */
  | { readonly kind: "notExpected" }
  /** Пояс пиццерии базе неизвестен: окно посчитать нечем (T062). */
  | { readonly kind: "unknownZone" };

export type TodayStatusKind = TodayStatus["kind"];

function isOpen(pass: PassFacts, at: Date): boolean {
  return pass.startAt <= at && at < pass.endAt;
}

/** Проход, о котором говорит статус: открытый сейчас, иначе закончившийся сегодня. */
function currentPass(day: ChecklistDay, at: Date): PassFacts {
  return isOpen(day.startingToday, at) ? day.startingToday : day.endingToday;
}

/** Статус чек-листа на момент `at`. `null` — пояс пиццерии неизвестен. */
export function todayStatusOf(day: ChecklistDay | null, at: Date): TodayStatus {
  if (day === null) return { kind: "unknownZone" };
  const pass = currentPass(day, at);
  if (pass.filledAt !== null) return { kind: "filled", at: pass.filledAt };
  if (at < pass.startAt) return { kind: "upcoming", at: pass.startAt };
  if (!pass.expected) return { kind: "notExpected" };
  if (at < pass.endAt) return { kind: "open", at: pass.endAt };
  return { kind: "missed", at: pass.endAt };
}

/**
 * Проход, закончившийся сегодня, закрылся пустым, хотя его ждали, — тревога «чек-лист
 * не заполнен» (D053, D054). Одно правило на тревогу и на статус: две копии разъехались
 * бы молча.
 */
export function isMissedToday(pass: PassFacts, at: Date): boolean {
  return at >= pass.endAt && pass.filledAt === null && pass.expected;
}

/** Сводка статусов для плитки пиццерии. */
export interface TodayCounts {
  readonly filled: number;
  /** До окна и в открытом окне. */
  readonly waiting: number;
  readonly missed: number;
  /** Все чек-листы, включая отменённые режимом и с неизвестным поясом. */
  readonly total: number;
}

export function countToday(statuses: readonly TodayStatus[]): TodayCounts {
  const count = (kinds: readonly TodayStatusKind[]): number =>
    statuses.filter((status) => kinds.includes(status.kind)).length;
  return {
    filled: count(["filled"]),
    waiting: count(["upcoming", "open"]),
    missed: count(["missed"]),
    total: statuses.length,
  };
}
