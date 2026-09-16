// Разбор того, что приходит из браузера, на границе редактора. Всё, что уходит в JSONB
// `checklist_versions.sections`, проходит здесь: это единственный контракт с экраном
// заполнения (docs/furca/plan.md), и лишнее поле, доехавшее до базы, останется там навсегда.
//
// Отказ приходит кодом, а не текстом: экран двуязычный, и сообщение выбирает он,
// а не слой данных.
import type {
  Item,
  ItemType,
  LocalizedText,
  ScheduleSegment,
  Section,
  Severity,
} from "@/blocks/data";
import { assertValidSchedule, isSeverity, parseLocalTime } from "@/blocks/data";

import { isRemindOption, REMIND_OPTIONS } from "./schedule-field";
import type { Locale } from "@/blocks/core/locale";

export type EditorErrorCode =
  | "badFormat"
  | "tooManySections"
  | "tooManyItems"
  | "textTooLong"
  | "badRange"
  | "badSchedule"
  | "emptyWindow"
  | "emptyTitle"
  | "notFound"
  | "nothingToPublish"
  | "unknownBlock";

/** Отказ разбора входных данных редактора. Код читает экран, текст — журнал сервера. */
export class EditorInputError extends Error {
  readonly code: EditorErrorCode;

  constructor(code: EditorErrorCode, message: string) {
    super(message);
    this.name = "EditorInputError";
    this.code = code;
  }
}

/**
 * Пределы разметки. Верхнюю границу размера JSONB держит сама база (256 КиБ), но её отказ
 * приходит ошибкой драйвера — методисту он ничего не объясняет. Эти числа заведомо ниже
 * и подобраны от жизни: чек-лист станции — это единицы-десятки пунктов (принципы 1 и 2).
 */
export const LIMITS = {
  sections: 50,
  items: 300,
  textLength: 500,
  /**
   * Отрезков в расписании одного пункта. Весь боевой пакет обходится двумя-тремя
   * (`docs/furca/specs/2026-09-14-rounds-and-expiry-design.md`); предел стоит не от
   * жадности, а чтобы список отрезков не превратился в тот же лист бумаги, ради ухода
   * от которого регулярность и задаётся отрезками (D075).
   */
  scheduleSegments: 8,
} as const;

// Языки контента продукта (D009). Третий добавляется словарём, а не кодом, поэтому
// список короткий и лежит рядом с разбором: всё, что не отсюда, до базы не доезжает.
const CONTENT_LOCALES: readonly Locale[] = ["ru", "en"];

const ITEM_TYPES: readonly ItemType[] = ["bool", "number", "text"];

// Время из формы приходит как "HH:MM"; 24:00 — законное значение time в PostgreSQL
// и единственный способ записать окно «без ограничения» там, где равные границы запрещены.
const TIME_PATTERN = /^(?<hours>[01]\d|2[0-4]):(?<minutes>[0-5]\d)$/;
const MAX_HOUR = 24;

// Опознаватели строк базы — uuid. Проверка нужна до запроса: чужая строка в колонке uuid
// роняет драйвер ошибкой 22P02, а экрану нужен обычный «не найдено».
// Сама проверка живёт в `./uuid` — файле без импортов: её зовут и с сервера, и из
// разметки, которая уезжает в браузер, а этот файл тянет за собой слой данных.
export { isUuid } from "./uuid";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(code: EditorErrorCode, message: string): never {
  throw new EditorInputError(code, message);
}

/** Текст пункта на языках продукта: чужие языки отбрасываются, пустые значения не хранятся. */
function parseLocalizedText(input: unknown): LocalizedText {
  if (!isRecord(input)) fail("badFormat", "Текст должен быть объектом языков");

  const text: LocalizedText = {};
  for (const locale of CONTENT_LOCALES) {
    const value = input[locale];
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed === "") continue;
    if (trimmed.length > LIMITS.textLength) {
      fail(
        "textTooLong",
        `Текст длиннее ${String(LIMITS.textLength)} знаков (${String(trimmed.length)})`,
      );
    }
    text[locale] = trimmed;
  }
  return text;
}

function isEmptyText(text: LocalizedText): boolean {
  return Object.keys(text).length === 0;
}

/** Название, без которого строка не имеет смысла: у чек-листа и у блока библиотеки. */
export function parseRequiredText(input: unknown): LocalizedText {
  const text = parseLocalizedText(input);
  if (isEmptyText(text)) fail("emptyTitle", "Название пустое на всех языках");
  return text;
}

function parseId(input: unknown, what: string): string {
  if (typeof input !== "string" || input.trim() === "") {
    fail("badFormat", `${what}: нет опознавателя`);
  }
  return input.trim();
}

/** Граница числового пункта: из формы приходит строкой, пустая означает «границы нет». */
function parseBound(input: unknown, what: string): number | undefined {
  if (input === undefined || input === null || input === "") return undefined;
  const value = typeof input === "string" ? Number(input.trim()) : input;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail("badFormat", `${what}: граница не число`);
  }
  return value;
}

function parseItemType(input: unknown): ItemType {
  if (
    typeof input !== "string" ||
    !(ITEM_TYPES as readonly string[]).includes(input)
  ) {
    fail("badFormat", `Неизвестный тип ответа: ${String(input)}`);
  }
  return input as ItemType;
}

/**
 * Пункт чек-листа. Пункт без названия — это пустая строка внизу списка, которую методист
 * ещё не заполнил: она пропускается (`null`), а не роняет сохранение всего чек-листа.
 */
/**
 * Уровень пункта из формы. Явное значение сильнее; при его отсутствии читается
 * старый признак `critical`, потому что в базе лежат черновики, заведённые до
 * появления уровней (D056, `severityOf`).
 */
function parseSeverity(input: Record<string, unknown>): Severity {
  const value = input["severity"];
  if (isSeverity(value)) return value;
  return input["critical"] === true ? "critical" : "normal";
}

/**
 * Один отрезок расписания. Время отрезка — местное «ЧЧ:ММ» БЕЗ 24:00: сутки обхода
 * замкнуты, и полночь в них называется 00:00. Тем же `parseLocalTime`, которым читает
 * отрезки блок `data`, — иначе редактор и расписание разошлись бы в том, что считать
 * временем, и разошлись бы молча.
 */
function parseSegment(input: unknown): ScheduleSegment {
  if (!isRecord(input)) {
    fail("badSchedule", "Отрезок расписания должен быть объектом");
  }

  const from = input["from"];
  const to = input["to"];
  if (typeof from !== "string" || typeof to !== "string") {
    fail("badSchedule", "У отрезка расписания нет границ");
  }
  const fromMinutes = parseLocalTime(from.trim());
  const toMinutes = parseLocalTime(to.trim());
  if (fromMinutes === null || toMinutes === null) {
    fail("badSchedule", `Время отрезка не разобрано: «${from}» — «${to}»`);
  }

  const raw = input["everyMinutes"];
  const everyMinutes = typeof raw === "string" ? Number(raw.trim()) : raw;
  if (typeof everyMinutes !== "number" || !Number.isInteger(everyMinutes)) {
    fail("badSchedule", `Шаг обхода не целое число: ${String(raw)}`);
  }

  return {
    from: formatMinutes(fromMinutes),
    to: formatMinutes(toMinutes),
    everyMinutes,
  };
}

/** Минуты от полуночи обратно во время отрезка. Своё, а не из data: там формат окна. */
function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/**
 * Расписание периодической проверки (D075). Пустой список и отсутствие поля — одно и
 * то же состояние «пункт обычный», и записывается оно ОДНИМ способом: полем, которого
 * нет. Иначе `isPeriodic` и разметка расходились бы на пустом списке.
 *
 * Смысловые правила берутся у самого блока `data` (`assertValidSchedule`): пустой
 * отрезок, шаг не больше нуля. Второй свод тех же правил здесь разошёлся бы с первым —
 * и разошёлся бы в сторону «редактор пропустил, обход не состоялся».
 */
function parseSchedule(input: unknown): ScheduleSegment[] | undefined {
  if (input === undefined || input === null) return undefined;
  if (!Array.isArray(input)) {
    fail("badSchedule", "Расписание — не список отрезков");
  }
  if (input.length === 0) return undefined;
  if (input.length > LIMITS.scheduleSegments) {
    fail(
      "badSchedule",
      `Отрезков больше ${String(LIMITS.scheduleSegments)}: ${String(input.length)}`,
    );
  }

  const schedule = input.map((segment) => parseSegment(segment));
  try {
    assertValidSchedule(schedule);
  } catch (cause) {
    // Отказ блока data — TypeError и RangeError; экрану нужен код, а не класс ошибки.
    fail("badSchedule", cause instanceof Error ? cause.message : String(cause));
  }
  return schedule;
}

/**
 * Частота повторения сигнала о просрочке (D068). Список закрыт решением владельца,
 * «молчать» — отсутствие значения. Без расписания не хранится вовсе: просрочке
 * взяться неоткуда, а поле, которое ни на что не влияет, следующий читатель примет
 * за работающее.
 */
function parseRemind(input: unknown, isPeriodic: boolean): number | undefined {
  if (!isPeriodic) return undefined;
  if (input === undefined || input === null || input === "") return undefined;
  const value = typeof input === "string" ? Number(input.trim()) : input;
  if (!isRemindOption(value)) {
    fail(
      "badSchedule",
      `Частота напоминания не из списка ${REMIND_OPTIONS.join("/")}: ${String(input)}`,
    );
  }
  return value;
}

function parseItem(input: unknown): Item | null {
  if (!isRecord(input)) fail("badFormat", "Пункт должен быть объектом");

  const title = parseLocalizedText(input["title"]);
  if (isEmptyText(title)) return null;

  const item: Item = {
    id: parseId(input["id"], "Пункт"),
    title,
    type: parseItemType(input["type"]),
    severity: parseSeverity(input),
  };

  const min = parseBound(input["min"], "Пункт");
  const max = parseBound(input["max"], "Пункт");
  if (min !== undefined && max !== undefined && min > max) {
    fail(
      "badRange",
      `Нижняя граница ${String(min)} выше верхней ${String(max)}`,
    );
  }

  const hint = parseLocalizedText(input["hint"] ?? {});
  const schedule = parseSchedule(input["schedule"]);
  const remind = parseRemind(
    input["remindEveryMinutes"],
    schedule !== undefined,
  );

  return {
    ...item,
    ...(min === undefined ? {} : { min }),
    ...(max === undefined ? {} : { max }),
    ...(isEmptyText(hint) ? {} : { hint }),
    ...(schedule === undefined ? {} : { schedule }),
    ...(remind === undefined ? {} : { remindEveryMinutes: remind }),
  };
}

/** Происхождение секции: свои пункты или вставленный блок библиотеки (D011). */
function parseSource(input: unknown): Section["source"] {
  if (input === "own" || input === undefined) return "own";
  if (isRecord(input) && typeof input["blockId"] === "string") {
    return { blockId: parseId(input["blockId"], "Блок библиотеки") };
  }
  fail("badFormat", "Непонятное происхождение секции");
}

function parseSection(input: unknown): Section {
  if (!isRecord(input)) fail("badFormat", "Секция должна быть объектом");

  const rawItems = input["items"];
  if (!Array.isArray(rawItems)) fail("badFormat", "Пункты секции — не список");

  const items: Item[] = [];
  for (const raw of rawItems) {
    const item = parseItem(raw);
    if (item !== null) items.push(item);
  }

  return {
    id: parseId(input["id"], "Секция"),
    title: parseLocalizedText(input["title"]),
    source: parseSource(input["source"]),
    items,
  };
}

/**
 * Разметка чек-листа целиком. Не список — отказ, а не пустой чек-лист: молча превратить
 * мусор в пустую разметку значит стереть методисту работу и не сказать об этом.
 */
export function parseSections(input: unknown): Section[] {
  if (!Array.isArray(input))
    fail("badFormat", "Разметка чек-листа — не список");
  if (input.length > LIMITS.sections) {
    fail(
      "tooManySections",
      `Секций больше ${String(LIMITS.sections)}: ${String(input.length)}`,
    );
  }

  const sections = input.map((section) => parseSection(section));
  const items = sections.reduce(
    (total, section) => total + section.items.length,
    0,
  );
  if (items > LIMITS.items) {
    fail(
      "tooManyItems",
      `Пунктов больше ${String(LIMITS.items)}: ${String(items)}`,
    );
  }
  return sections;
}

function parseTime(input: string, what: string): string {
  const match = TIME_PATTERN.exec(input.trim());
  if (match?.groups === undefined) fail("badFormat", `${what}: не время`);
  const hours = Number(match.groups["hours"]);
  const minutes = Number(match.groups["minutes"]);
  // 24:00 — единственная законная точка на границе суток; 24:30 её уже перешагивает.
  if (hours === MAX_HOUR && minutes !== 0) {
    fail("badFormat", `${what}: после 24:00 времени нет`);
  }
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`;
}

/**
 * Окно чек-листа. Конец раньше начала — обычное вечернее окно через полночь; равные
 * границы запрещены базой, потому что такой чек-лист не открылся бы никогда и молча.
 */
export function parseWindow(
  start: string,
  end: string,
): { start: string; end: string } {
  const parsed = {
    start: parseTime(start, "Начало окна"),
    end: parseTime(end, "Конец окна"),
  };
  if (parsed.start === parsed.end) {
    fail("emptyWindow", "Начало и конец окна совпадают: чек-лист не откроется");
  }
  return parsed;
}
