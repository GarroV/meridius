// Регулярность пункта на экране редактора: закрытые списки выбора и короткая подпись чипа.
//
// Файл чистый и БЕЗ импорта входа `@/blocks/data`: его тянет клиентская разметка строки
// пункта, а вход блока data ведёт за собой пул подключений и драйвер `pg`, которого в
// браузере нет (тем же путём отсюда уже уезжал `isUuid`, T121). Из data берётся только
// модуль расписания — он чистые функции над временем.
import { overlappingSegments, parseLocalTime } from "@/blocks/data/schedule";
import type { ChecklistWindow, Item, ScheduleSegment } from "@/blocks/data";

const MINUTES_IN_DAY = 24 * 60;

/**
 * Частота повторения сигнала о просрочке (D068). Список ЗАКРЫТ решением владельца:
 * открытое число означало бы «каждые три минуты» на планшете, который стоит в зале.
 * «Молчать» — это отсутствие значения, а не ноль: два способа записать одно состояние
 * расходятся молча.
 */
export const REMIND_OPTIONS: readonly number[] = [10, 20, 60];

export function isRemindOption(value: unknown): value is number {
  return typeof value === "number" && REMIND_OPTIONS.includes(value);
}

/**
 * Шаги обхода, предлагаемые в окне настройки. Пакет пилота живёт на целых часах
 * (`scripts/import-checklists.mjs` считает шаг из `everyHours`), получасовой шаг
 * оставлен запасом. Список закрытый по той же причине, что и окно смены: у обхода
 * по сути три-четыре частоты, а свободный ввод минут — лишние касания и опечатки.
 */
export const STEP_OPTIONS: readonly number[] = [30, 60, 120, 180, 240];

/**
 * Шаги для списка вместе с уже записанным нестандартным.
 *
 * Тот же приём, что у окна смены (T129): расписание, заведённое импортом или прежней
 * редакцией списка, показывается своим пунктом, иначе открытие окна настройки молча
 * переписало бы шаг на ближайший из списка.
 */
export function stepOptionsFor(everyMinutes: number | undefined): number[] {
  if (everyMinutes === undefined || STEP_OPTIONS.includes(everyMinutes)) {
    return [...STEP_OPTIONS];
  }
  return [...STEP_OPTIONS, everyMinutes].sort((a, b) => a - b);
}

/** Состояние чипа в строке пункта: по нему разметка выбирает подпись. */
export type ChipSummary =
  | { readonly kind: "none" }
  | {
      readonly kind: "single";
      readonly from: string;
      readonly to: string;
      readonly everyMinutes: number;
    }
  | { readonly kind: "many"; readonly count: number };

/**
 * Что показывает чип. Подпись собирает разметка — она двуязычна и склоняет числительные;
 * здесь только факт, чтобы его можно было проверить без браузера.
 */
export function chipSummary(item: Item): ChipSummary {
  const schedule = item.schedule ?? [];
  const [first] = schedule;
  if (schedule.length === 0 || first === undefined) return { kind: "none" };
  if (schedule.length === 1) {
    return {
      kind: "single",
      from: first.from,
      to: first.to,
      everyMinutes: first.everyMinutes,
    };
  }
  return { kind: "many", count: schedule.length };
}

/** Часы окна без секунд: колонки `time` приходят как «06:00:00», а отрезок пишется «06:00». */
function hhmm(value: string): string {
  const minutes = parseLocalTime(value);
  if (minutes === null) return value;
  const hours = Math.floor(minutes / 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/**
 * Конец окна как граница отрезка.
 *
 * «24:00» — законное время ОКНА: именно так записано окно «без ограничения», одно из
 * трёх готовых (`window-field.ts`). Но время ОТРЕЗКА таким быть не может: сутки обхода
 * замкнуты, `parseLocalTime` часов больше 23 не знает, и `assertValidSchedule` такой
 * отрезок отвергает — то есть самое широкое окно давало бы единственный отрезок,
 * который нельзя сохранить. Подставить 00:00 тоже нельзя: отрезок 00:00–00:00 схлопнется
 * в точку. «До конца суток» в этой модели — последняя минута суток, и она даёт ровно
 * те же проходы: при часовом шаге двадцать четыре, последний — 23:00–23:59.
 */
function windowEndForSegment(value: string): string {
  return parseLocalTime(value) === null ? "23:59" : hhmm(value);
}

/**
 * Отрезок, который подставляется кнопкой «добавить отрезок».
 *
 * Предлагается ПРОДОЛЖЕНИЕ последнего отрезка, а не окно целиком: неравномерная сетка
 * почти всегда «днём чаще, вечером реже», то есть второй отрезок начинается там, где
 * кончился первый. Первый отрезок берётся от начала окна чек-листа — за его пределами
 * обход всё равно не состоится, окно обрезает расписание.
 */
export function nextSegment(
  schedule: readonly ScheduleSegment[],
  window: ChecklistWindow,
): ScheduleSegment {
  const last = schedule.at(-1);
  const from = last === undefined ? hhmm(window.start) : hhmm(last.to);
  const to = windowEndForSegment(window.end);
  return {
    from,
    // Пустой отрезок запрещён (`assertValidSchedule`), а «от конца окна до конца окна»
    // получается ровно тогда, когда прошлый отрезок уже дошёл до края. Тогда предлагаем
    // отрезок от начала окна: методист поправит границы, а не получит отказ на кнопке.
    to: from === to ? hhmm(window.start) : to,
    everyMinutes: last?.everyMinutes ?? 60,
  };
}

/**
 * Сколько отрезков помещается в один пункт.
 *
 * Живёт здесь, а не в `validation.ts`: предел обязан знать и окно настройки (иначе
 * кнопка «добавить отрезок» набирает то, что сервер потом отвергнет отказом без
 * объяснения), а `validation.ts` в браузер не уезжает — он тянет вход блока data.
 * Разбор на сервере берёт это же число, чтобы два предела не разъехались молча.
 */
export const MAX_SEGMENTS = 8;

/** Минут суток, не занятых ни одним отрезком. Отрезки не пересекаются — значит, сумма. */
function freeMinutes(schedule: readonly ScheduleSegment[]): number {
  const taken = schedule.reduce((sum, segment) => {
    const from = parseLocalTime(segment.from);
    const to = parseLocalTime(segment.to);
    if (from === null || to === null) return sum;
    return sum + ((to - from + MINUTES_IN_DAY) % MINUTES_IN_DAY);
  }, 0);
  return Math.max(MINUTES_IN_DAY - taken, 0);
}

/**
 * Есть ли куда добавить ещё отрезок. По нему окно настройки гасит кнопку.
 *
 * Два повода отказать, и оба обязаны быть здесь. Первый — предел числа отрезков.
 * Второй — сутки, расписанные целиком: свободного времени не осталось, и кнопка
 * предложила бы отрезок поверх уже набранных, то есть пересечение (T161). Кнопка,
 * набирающая то, что правило запрещает, — это отказ на собственное нажатие методиста.
 */
export function canAddSegment(schedule: readonly ScheduleSegment[]): boolean {
  return schedule.length < MAX_SEGMENTS && freeMinutes(schedule) > 0;
}

/** Почему набранное расписание нельзя применить. */
export type ScheduleProblem =
  | { readonly kind: "empty"; readonly index: number }
  | {
      readonly kind: "overlap";
      readonly first: number;
      readonly second: number;
    };

/**
 * Что мешает применить набранное расписание, или `null`.
 *
 * Оба правила — те же, которыми отказывает запись (`assertValidSchedule`), и второе
 * берётся у неё целиком (`overlappingSegments`): свой свод тех же правил разошёлся бы
 * с первым молча. Ловим здесь, в окне настройки, а не отказом на сохранении: отказ
 * приходит через два экрана, когда методист уже не помнит, какие границы свёл.
 *
 * Пустой отрезок называется первым: он и виднее, и у отрезка нулевой длины пересечений
 * не бывает по определению — сказать про него «пересекается» значило бы увести в сторону.
 */
export function scheduleProblemOf(
  schedule: readonly ScheduleSegment[],
): ScheduleProblem | null {
  const empty = schedule.findIndex((segment) => segment.from === segment.to);
  if (empty !== -1) return { kind: "empty", index: empty };

  const overlap = overlappingSegments(schedule);
  if (overlap === null) return null;
  return { kind: "overlap", first: overlap[0], second: overlap[1] };
}

/**
 * Отрезок с изменённым полем. Возвращает НОВЫЙ список: состояние окна настройки —
 * обычное состояние React, и правка на месте в нём не перерисовывается.
 *
 * Номер вне списка означает, что разметка и состояние разошлись; такой правкой мы
 * молча дописали бы список с конца. Возвращаем тот же список — расхождение увидит
 * проверка, а не методист.
 */
export function replaceSegment(
  schedule: readonly ScheduleSegment[],
  index: number,
  patch: Partial<ScheduleSegment>,
): ScheduleSegment[] {
  if (index < 0 || index >= schedule.length) return [...schedule];
  return schedule.map((segment, at) =>
    at === index ? { ...segment, ...patch } : segment,
  );
}

/** Список без указанного отрезка. Пустой список означает «пункт снова обычный». */
export function removeSegment(
  schedule: readonly ScheduleSegment[],
  index: number,
): ScheduleSegment[] {
  return schedule.filter((_segment, at) => at !== index);
}
