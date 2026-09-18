// Проверка того, что приходит из браузера, — до попадания в бизнес-логику
// (принципы проекта, «Проверка ввода на границах системы»).
//
// Проверок две, и они разные по природе:
//  1. `parseSubmission` — форма тела: типы, длины, пределы. Ничего не знает о чек-листе.
//  2. `matchAnswersToSnapshot` — смысл: ответы обязаны относиться к пунктам той версии,
//     что была отдана клиенту, а проваленный критичный пункт — нести комментарий.
//
// Схема написана руками, а не библиотекой: у продукта одна форма тела на весь публичный
// маршрут, и зависимость ради неё — лишний код в единственной точке записи, открытой
// интернету. Разбор возвращает новый объект и никогда не пропускает поля входа дальше.
import type { Answer, Item, Section } from "@/blocks/data";
import {
  flattenItems,
  isFailed,
  requiresCommentOnFailure,
} from "@/blocks/data";

import { isPlausibleCode } from "./station";
import { parseTableRows } from "./table-journal";

/**
 * Верхние границы входа. Числа — заслон от мусора, а не рабочая мерка: чек-лист станции
 * это единицы-десятки пунктов (принципы 1 и 2), комментарий — короткая записка
 * («порвался уплотнитель, вызвал техника»), а не докладная.
 */
export const FILL_INPUT_LIMITS = {
  maxAnswers: 500,
  maxItemIdLength: 128,
  maxTextLength: 1000,
  maxCommentLength: 500,
  // Пропуск экрана: метка времени и подпись base64url от sha256 (43 знака). Предел
  // стоит здесь, рядом с остальной формой тела, чтобы сверка подписи не считалась
  // на строке произвольной длины.
  maxTicketLength: 128,
} as const;

export const UUID_PATTERN =
  /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

/** Отказ, который экран умеет объяснить сотруднику. */
export type FillRefusal =
  | "malformed"
  | "empty"
  | "comment-required"
  | "unknown-code"
  | "rate-limited"
  // Обхода сейчас не ждут: чек-лист закрыт, сетка на сегодня кончилась или пункт
  // выпал по режиму смены. Для сотрудника все три — одно и то же, и разбирать их
  // на экране не нужно; в каком именно состоянии станция, видно на ней самой.
  | "no-round"
  // Будильник на время, которое в этом проходе окна уже прошло. Отдельный отказ, а не
  // «мусор»: сотрудник ошибся на минутах, а не прислал негодное тело, и сказать ему надо
  // разное.
  | "past-time"
  // Будильник на время вне часов работы чек-листа — либо названо время за окном, либо
  // у станции сейчас не открыт ни один чек-лист. Живёт будильник до конца окна (D090),
  // и за его пределами ему просто негде быть.
  | "outside-window"
  // Будильников на станции в этом проходе окна уже столько, сколько разрешено
  // (`ALARM_LIMITS`).
  | "too-many"
  // Пропуск экрана выдан больше суток назад (`FILL_TICKET_MAX_AGE_MS`). Подпись
  // при этом верна: экран просто провисел открытым слишком долго, и лечится это
  // обновлением страницы, а не «сервер сломался».
  | "stale";

export interface ParsedSubmission {
  readonly code: string;
  readonly versionId: string;
  /** Пропуск, выданный сервером вместе с экраном. Разбирает его `ticket.ts`. */
  readonly ticket: string;
  readonly answers: readonly Answer[];
}

export type Parsed<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: FillRefusal };

const MALFORMED = { ok: false, reason: "malformed" } as const;

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function parseAnswer(input: unknown): Answer | null {
  if (!isRecord(input)) return null;

  const { itemId, value, comment, at } = input;
  if (typeof itemId !== "string") return null;
  if (itemId === "" || itemId.length > FILL_INPUT_LIMITS.maxItemIdLength) {
    return null;
  }
  if (typeof at !== "number" || !Number.isFinite(at)) return null;

  // Журнал табличного пункта — единственное значение-список; его форма и пределы
  // живут в `table-journal.ts`, там же, где их считает экран (D074).
  const rows = Array.isArray(value) ? parseTableRows(value) : null;
  if (Array.isArray(value) && rows === null) return null;

  const isValue =
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value)) ||
    (typeof value === "string" &&
      value.length <= FILL_INPUT_LIMITS.maxTextLength) ||
    rows !== null;
  if (!isValue) return null;

  const parsedValue = rows ?? (value as Answer["value"]);
  if (comment === undefined) return { itemId, value: parsedValue, at };
  if (typeof comment !== "string") return null;
  if (comment.length > FILL_INPUT_LIMITS.maxCommentLength) return null;
  return { itemId, value: parsedValue, comment, at };
}

/** Форма тела отправки. Наружу выходит новый объект: полей входа в нём нет. */
export function parseSubmission(input: unknown): Parsed<ParsedSubmission> {
  if (!isRecord(input)) return MALFORMED;

  const { code, versionId, ticket, answers } = input;
  if (typeof code !== "string" || !isPlausibleCode(code)) return MALFORMED;
  if (typeof versionId !== "string" || !UUID_PATTERN.test(versionId)) {
    return MALFORMED;
  }
  // Здесь проверяется только форма: подпись пропуска сверяет `ticket.ts`, и делает
  // это после предела частоты — считать HMAC на каждое тело с улицы незачем.
  if (
    typeof ticket !== "string" ||
    ticket === "" ||
    ticket.length > FILL_INPUT_LIMITS.maxTicketLength
  ) {
    return MALFORMED;
  }
  if (!Array.isArray(answers)) return MALFORMED;
  if (answers.length > FILL_INPUT_LIMITS.maxAnswers) return MALFORMED;

  const parsed: Answer[] = [];
  for (const entry of answers) {
    const answer = parseAnswer(entry);
    if (answer === null) return MALFORMED;
    parsed.push(answer);
  }

  return { ok: true, value: { code, versionId, ticket, answers: parsed } };
}

function matchesType(item: Item, value: Answer["value"]): boolean {
  if (item.type === "bool") return typeof value === "boolean";
  if (item.type === "number") return typeof value === "number";
  if (item.type === "table") return matchesColumns(item, value);
  return typeof value === "string";
}

/**
 * Журнал против колонок СНИМКА: клетка по колонке, которой в снимке нет, не
 * принимается вовсе.
 *
 * Снимок главный (принцип 3, D002): заполнение хранит те колонки, которые сотрудник
 * видел, и дописать в него клетку от колонки, появившейся позже, значит задним числом
 * менять историю. Отказ, а не тихая чистка: тело, собранное не нашим экраном, — это
 * не «немного лишнего», а чужая форма.
 */
function matchesColumns(item: Item, value: Answer["value"]): boolean {
  if (!Array.isArray(value)) return false;
  const known = new Set((item.columns ?? []).map((column) => column.id));
  return value.every((row) =>
    Object.keys(row).every((columnId) => known.has(columnId)),
  );
}

/**
 * Ответы против снимка версии, отданной клиенту.
 *
 * Неполный чек-лист принимается: кнопка в браузере недозаполненный отправить не даёт,
 * но отвергнуть почти готовое заполнение значит потерять работу сотрудника, а неполнота
 * и так видна в ленте (принцип 2). Не принимается пустой список — сохранять нечего.
 *
 * Правило «проваленный критичный пункт требует комментарий» держится здесь, а не только
 * кнопкой: тело запроса отправляет кто угодно, а обещание дано управляющему.
 */
export function matchAnswersToSnapshot(
  sections: readonly Section[],
  answers: readonly Answer[],
): Parsed<readonly Answer[]> {
  if (answers.length === 0) return { ok: false, reason: "empty" };

  const items = new Map(
    flattenItems([...sections]).map((item) => [item.id, item]),
  );
  const seen = new Set<string>();

  for (const answer of answers) {
    const item = items.get(answer.itemId);
    if (item === undefined) return MALFORMED;
    if (seen.has(answer.itemId)) return MALFORMED;
    seen.add(answer.itemId);
    if (!matchesType(item, answer.value)) return MALFORMED;

    const needsComment =
      requiresCommentOnFailure(item) &&
      isFailed(item, answer) &&
      (answer.comment ?? "").trim() === "";
    if (needsComment) return { ok: false, reason: "comment-required" };
  }

  return { ok: true, value: answers };
}

/**
 * Поштучные отметки времени — в границы заполнения, известные серверу.
 *
 * Когда сотрудник коснулся каждого пункта, сервер не видит и увидеть не может:
 * между открытием экрана и отправкой он не участвует. Поэтому отметки остаются
 * со стороны браузера — но перестают выходить за отрезок, оба конца которого
 * назначил сервер: начало из пропуска, конец — миг приёма. Так в базу не попадает
 * «пункт отмечен в 1970 году» или «завтра в 3:00».
 *
 * Управляющему эти отметки больше НЕ показываются (D112, T220): сотрудник подходит
 * к чек-листу раз в час-два и отмечает несколько пунктов сразу, поэтому время
 * пункта означает момент подхода, а не выполнения. Зажим при этом нужен по-прежнему
 * — он защищает хранимые данные, а не экран.
 *
 * Наружу выходят новые объекты: ответы, пришедшие из тела, не правятся на месте.
 */
export function clampAnswerTimes(
  answers: readonly Answer[],
  startedAt: number,
  now: Date,
): readonly Answer[] {
  const upper = Math.max(now.getTime(), startedAt);
  return answers.map((answer) => ({
    ...answer,
    at: Math.min(Math.max(answer.at, startedAt), upper),
  }));
}
