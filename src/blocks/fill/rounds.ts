// Отметка обхода: вторая точка записи продукта, открытая интернету.
//
// Порядок проверок тот же, что у отправки заполнения, и по той же причине: сначала
// форма тела (дёшево, без базы), потом частота (тоже без базы), и только затем база.
// Иначе поток мусора с улицы доходил бы до пула соединений раньше, чем до отказа.
//
// Проход, в который встанет отметка, здесь НЕ считается: его считает слой данных по
// местному времени пиццерии (D066). Отсюда уходит только «этот пункт отметили», а
// какой это был час — решает сервер.
import {
  flattenItems,
  getRounds,
  isFailed,
  requiresCommentOnFailure,
  saveCheck,
} from "@/blocks/data";
import type { AnswerValue, Item, Section } from "@/blocks/data";

import { checkRoundAllowed } from "./rate-limit";
import { findStationVersion, isPlausibleCode } from "./station";
import type { FillRefusal, Parsed } from "./validation";
import { FILL_INPUT_LIMITS, UUID_PATTERN } from "./validation";

/**
 * Что узнаёт браузер об исходе. Как и у отправки заполнения — ровно то, что сотрудник
 * и так видит на экране: время отметки и час, за который она зачтена. Ни станции, ни
 * чужой истории: ссылка публичная (D021).
 */
export type RoundOutcome =
  | {
      readonly kind: "marked";
      /** Местное время отметки, «ЧЧ:ММ»: экран показывает записанное, а не своё. */
      readonly atLocalTime: string;
      /** Час, за который обход зачтён, «ЧЧ:ММ» — он мог отличаться от ожидаемого. */
      readonly intervalLocalTime: string;
    }
  | {
      readonly kind: "refused";
      readonly reason: FillRefusal;
      readonly retryAfterSeconds: number;
    };

export interface ParsedRoundMark {
  readonly code: string;
  readonly versionId: string;
  readonly itemId: string;
  readonly value: AnswerValue;
  readonly comment?: string;
}

const MALFORMED = { ok: false, reason: "malformed" } as const;

function refuse(reason: FillRefusal, retryAfterSeconds = 0): RoundOutcome {
  return { kind: "refused", reason, retryAfterSeconds };
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

/** Форма тела отметки. Наружу выходит новый объект: полей входа в нём нет. */
export function parseRoundMark(input: unknown): Parsed<ParsedRoundMark> {
  if (!isRecord(input)) return MALFORMED;

  const { code, versionId, itemId, value, comment } = input;
  if (typeof code !== "string" || !isPlausibleCode(code)) return MALFORMED;
  if (typeof versionId !== "string" || !UUID_PATTERN.test(versionId)) {
    return MALFORMED;
  }
  if (typeof itemId !== "string") return MALFORMED;
  if (itemId === "" || itemId.length > FILL_INPUT_LIMITS.maxItemIdLength) {
    return MALFORMED;
  }

  const isValue =
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value)) ||
    (typeof value === "string" &&
      value.length <= FILL_INPUT_LIMITS.maxTextLength);
  if (!isValue) return MALFORMED;

  if (comment === undefined) {
    return { ok: true, value: { code, versionId, itemId, value } };
  }
  if (typeof comment !== "string") return MALFORMED;
  if (comment.length > FILL_INPUT_LIMITS.maxCommentLength) return MALFORMED;
  return { ok: true, value: { code, versionId, itemId, value, comment } };
}

function findItem(sections: Section[], itemId: string): Item | undefined {
  return flattenItems(sections).find((item) => item.id === itemId);
}

/** Значение подходит типу пункта: «да/нет» числом не отмечают и наоборот. */
function matchesType(item: Item, value: AnswerValue): boolean {
  if (item.type === "bool") return typeof value === "boolean";
  if (item.type === "number") return typeof value === "number";
  return typeof value === "string";
}

/**
 * Принимает отметку обхода и записывает её в проход, идущий сейчас.
 *
 * Версия приходит из браузера, то есть от кого угодно, — поэтому принимается только
 * та, чья замороженная станция совпадает со станцией отсканированного кода
 * (`findStationVersion`). Без этой проверки один живой код с наклейки позволял бы
 * отмечать обходы на любой станции сети.
 *
 * `no-round` отдаётся до записи, а не ловится исключением из слоя данных: состояние
 * «обхода сейчас не ждут» — это нормальный ответ продукта, а исключение там означало бы,
 * что сломался продукт, и глотать его вместе с отказом нельзя.
 */
export async function markRound(
  input: unknown,
  now: Date,
): Promise<RoundOutcome> {
  const parsed = parseRoundMark(input);
  if (!parsed.ok) return refuse(parsed.reason);

  const { code, versionId, itemId, value, comment } = parsed.value;

  const rate = checkRoundAllowed(code, now);
  if (!rate.allowed) return refuse("rate-limited", rate.retryAfterSeconds);

  const version = await findStationVersion(code, versionId);
  // Неизвестный код, перевыпущенный код и версия чужой станции дают один отказ:
  // различать их значило бы отвечать перебору по-разному (D021).
  if (version === null) return refuse("unknown-code");

  const item = findItem(version.sections, itemId);
  if (item === undefined) return refuse("malformed");
  if (!matchesType(item, value)) return refuse("malformed");

  // Обещание управляющему держится здесь, а не только кнопкой в браузере: тело запроса
  // отправляет кто угодно. Провал верхних уровней без единого слова о причине не даёт
  // управляющему ничего, кроме тревоги без предмета.
  if (
    requiresCommentOnFailure(item) &&
    isFailed(item, { itemId, value, at: now.getTime() }) &&
    (comment === undefined || comment.trim() === "")
  ) {
    return refuse("comment-required");
  }

  const rounds = await getRounds(version.versionId, now);
  if (rounds === null) return refuse("no-round");
  const state = rounds.items.find((entry) => entry.itemId === itemId);
  if (state?.current == null) return refuse("no-round");

  const mark = await saveCheck({
    versionId: version.versionId,
    itemId,
    value,
    ...(comment === undefined ? {} : { comment }),
    at: now,
  });

  return {
    kind: "marked",
    atLocalTime: mark.atLocalTime,
    intervalLocalTime: state.current.startLocalTime,
  };
}
