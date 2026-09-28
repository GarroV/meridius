// Почему не выпустился пин — словами, которые подскажут управляющему, что делать (#162).
//
// До этого разбора экран печатал «попробуйте ещё раз» на любую неудачу, в том числе на
// отсутствующую таблицу: повтор не помогал никогда, а совет выглядел правдой. Поэтому
// «временно» — только то, про что известно, что оно проходит само; всё прочее, включая
// непонятное, объявляется поломкой и пишется в журнал сервера.
import { pgErrorCode } from "./pg-error";
import { PinsExhaustedError } from "./pin-errors";

/**
 * `temporary` — повтор через минуту поможет; `stationGone` — станции больше нет, нужно
 * обновить страницу; `broken` — повтор не поможет, нужен тот, кто обслуживает продукт.
 */
export type IssueFailure = "temporary" | "stationGone" | "broken";

/** Нарушение внешнего ключа: станцию удалили, пока её панель была открыта. */
const PG_FOREIGN_KEY_VIOLATION = "23503";

/**
 * Классы кодов PostgreSQL, которые проходят сами: `08` — обрыв подключения, `53` —
 * нехватка ресурсов (соединений, памяти), `57P` — сервер перезапускается или гасится,
 * `40` — откат из-за конфликта транзакций.
 */
const TEMPORARY_PG_PREFIXES = ["08", "53", "57P", "40"] as const;

/** Сетевые отказы подключения: база недоступна сейчас, а не сломана. */
const TEMPORARY_NETWORK_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "EPIPE",
  "EHOSTUNREACH",
  "ENOTFOUND",
  "EAI_AGAIN",
]);

/**
 * Таймаут пула `pg` приходит без кода, только текстом: «Connection terminated due to
 * connection timeout», «timeout exceeded when trying to connect». Сверка по тексту здесь
 * вынужденная — другой приметы у отказа нет.
 */
const TIMEOUT_MESSAGE =
  /connection timeout|timeout exceeded|connection terminated/i;

function messageOf(error: unknown): string {
  if (!(error instanceof Error)) return "";
  const cause = error.cause instanceof Error ? ` ${error.cause.message}` : "";
  return `${error.message}${cause}`;
}

export function classifyIssueFailure(error: unknown): IssueFailure {
  if (error instanceof PinsExhaustedError) return "temporary";

  const code = pgErrorCode(error);
  if (code === PG_FOREIGN_KEY_VIOLATION) return "stationGone";
  if (code !== undefined && TEMPORARY_NETWORK_CODES.has(code))
    return "temporary";
  if (
    code !== undefined &&
    TEMPORARY_PG_PREFIXES.some((prefix) => code.startsWith(prefix))
  ) {
    return "temporary";
  }
  if (TIMEOUT_MESSAGE.test(messageOf(error))) return "temporary";

  return "broken";
}
