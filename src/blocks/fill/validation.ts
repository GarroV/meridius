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

/**
 * Верхние границы входа. Числа — заслон от мусора, а не рабочая мерка: чек-лист станции
 * это единицы-десятки пунктов (принципы 1 и 2), комментарий — короткая записка
 * («порвался уплотнитель, вызвал техника»), а не докладная.
 *
 * `maxFillDurationMs` — 12 часов: заполнение длиннее смены не бывает, и всё, что старше,
 * означает сбитые часы устройства, а не долгое заполнение.
 */
export const FILL_INPUT_LIMITS = {
  maxAnswers: 500,
  maxItemIdLength: 128,
  maxTextLength: 1000,
  maxCommentLength: 500,
  maxFillDurationMs: 12 * 60 * 60 * 1000,
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
  // Будильник на время, которое сегодня уже прошло. Отдельный отказ, а не «мусор»:
  // сотрудник ошибся на минутах, а не прислал негодное тело, и сказать ему надо разное.
  | "past-time"
  // Будильников на станции на сегодня уже столько, сколько разрешено (`ALARM_LIMITS`).
  | "too-many";

export interface ParsedSubmission {
  readonly code: string;
  readonly versionId: string;
  readonly startedAt: number;
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

  const isValue =
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value)) ||
    (typeof value === "string" &&
      value.length <= FILL_INPUT_LIMITS.maxTextLength);
  if (!isValue) return null;

  if (comment === undefined) return { itemId, value, at };
  if (typeof comment !== "string") return null;
  if (comment.length > FILL_INPUT_LIMITS.maxCommentLength) return null;
  return { itemId, value, comment, at };
}

/** Форма тела отправки. Наружу выходит новый объект: полей входа в нём нет. */
export function parseSubmission(input: unknown): Parsed<ParsedSubmission> {
  if (!isRecord(input)) return MALFORMED;

  const { code, versionId, startedAt, answers } = input;
  if (typeof code !== "string" || !isPlausibleCode(code)) return MALFORMED;
  if (typeof versionId !== "string" || !UUID_PATTERN.test(versionId)) {
    return MALFORMED;
  }
  if (typeof startedAt !== "number" || !Number.isFinite(startedAt)) {
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

  return { ok: true, value: { code, versionId, startedAt, answers: parsed } };
}

function matchesType(item: Item, value: Answer["value"]): boolean {
  if (item.type === "bool") return typeof value === "boolean";
  if (item.type === "number") return typeof value === "number";
  return typeof value === "string";
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
 * Время начала заполнения приходит с устройства сотрудника — доверия ему нет.
 * Будущее подтягивается к «сейчас» (иначе длительность отрицательная), а слишком
 * давнее — к границе окна: сбитые часы не должны рисовать в ленте заполнение,
 * которое якобы шло неделю.
 */
export function clampStartedAt(startedAt: number, now: Date): number {
  const upper = now.getTime();
  const lower = upper - FILL_INPUT_LIMITS.maxFillDurationMs;
  return Math.min(Math.max(startedAt, lower), upper);
}
