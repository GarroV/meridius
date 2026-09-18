// Отправка заполнения: единственная точка записи продукта, открытая интернету.
//
// Порядок проверок здесь — не стилистика, а защита. Сначала форма тела (дёшево, без базы),
// потом частота (тоже без базы), и только затем два запроса. Иначе поток мусора с улицы
// доходил бы до пула соединений раньше, чем до отказа.
import {
  countFailedCritical,
  getShiftMode,
  getSubmission,
} from "@/blocks/data";

import { checkSubmitAllowed } from "./rate-limit";
import { findRepeatedSubmission, saveOnce } from "./repeat";
import { findStationVersion } from "./station";
import { readFillTicket } from "./ticket";
import type { FillRefusal } from "./validation";
import {
  clampAnswerTimes,
  matchAnswersToSnapshot,
  parseSubmission,
} from "./validation";

/**
 * Что узнаёт браузер об исходе.
 *
 * Ни идентификатора заполнения, ни названия станции, ни числа пунктов сверх того,
 * что сотрудник и так только что видел: ответ на публичном маршруте — это ровно то,
 * что узнаёт любой, кто подобрал код (D021). Отказы неразличимы по форме: у всех
 * один набор полей, поэтому перебор не отличает «кода нет» от «код есть, но не тот».
 */
export type SubmitOutcome =
  | {
      readonly kind: "saved";
      /** Время сервера, прочитанное обратно из базы: экран показывает то, что записано. */
      readonly submittedAt: number;
      readonly durationMs: number;
      readonly failedCritical: number;
    }
  | {
      readonly kind: "refused";
      readonly reason: FillRefusal;
      readonly retryAfterSeconds: number;
    };

function refuse(reason: FillRefusal, retryAfterSeconds = 0): SubmitOutcome {
  return { kind: "refused", reason, retryAfterSeconds };
}

/**
 * Принимает заполнение и записывает его на версию, отданную клиенту.
 *
 * Версия приходит из браузера, то есть от кого угодно, — поэтому она принимается,
 * только если её замороженная станция совпадает со станцией отсканированного кода
 * (`findStationVersion`). Архивная версия проходит намеренно: это и есть T041 —
 * пока сотрудник заполнял, методист опубликовал следующую, и заполнение обязано
 * лечь на ту, что была на экране, вместе со снимком её пунктов (принцип 3, D002).
 */
export async function submitFilling(
  input: unknown,
  now: Date,
): Promise<SubmitOutcome> {
  const parsed = parseSubmission(input);
  if (!parsed.ok) return refuse(parsed.reason);

  const { code, versionId, ticket, answers } = parsed.value;

  const rate = checkSubmitAllowed(code, now);
  if (!rate.allowed) return refuse("rate-limited", rate.retryAfterSeconds);

  // Начало заполнения — из пропуска, выданного сервером вместе с экраном, а не из
  // тела запроса. Длительность после D003 осталась единственным признаком
  // добросовестности, который видит управляющий: пока её называл отправитель,
  // она не значила ничего, а выглядела как значащая.
  const pass = readFillTicket(ticket, { code, versionId }, now);
  if (!pass.ok) return refuse(pass.reason);
  const startedAt = pass.value;

  const version = await findStationVersion(code, versionId);
  // Неизвестный код, перевыпущенный код и версия чужой станции дают один отказ:
  // различать их значило бы отвечать перебору по-разному.
  if (version === null) return refuse("unknown-code");

  const checked = matchAnswersToSnapshot(version.sections, answers);
  if (!checked.ok) return refuse(checked.reason);

  // Этот пропуск уже записан — значит, это повтор: двойное нажатие мимо экрана
  // или «отправить ещё раз» после того, как первый ответ потерялся по дороге.
  // Возвращается прежняя квитанция: работа принята, второй записи в ленте нет.
  // Это быстрый путь; повтор, пришедший одновременно с первой записью, поиск не
  // видит, и его ловит уже сама запись (`saveOnce`, правило базы T219).
  const repeated = await findRepeatedSubmission(version.versionId, startedAt);
  if (repeated !== null) return await receipt(repeated);

  // Режим читается на сервере, а не приходит из браузера: заполнение обязано помнить,
  // при каком режиме его собирали, и подделать эту запись отправкой нельзя (D055).
  const shift = await getShiftMode(version.storeId, now);

  const submissionId = await saveOnce({
    versionId: version.versionId,
    answers: [...clampAnswerTimes(checked.value, startedAt, now)],
    startedAt,
    mode: shift?.mode ?? "normal",
  });

  return await receipt(submissionId);
}

/**
 * Что уходит на экран после записи.
 *
 * Время и длительность читаются обратно из базы, а не считаются здесь: на экране
 * сотрудника должно стоять то, что легло в историю, а не то, что показали часы
 * приложения (отметки времени продукта — серверные, `now()` базы).
 */
async function receipt(submissionId: string): Promise<SubmitOutcome> {
  const saved = await getSubmission(submissionId);
  if (saved === null) return refuse("malformed");

  return {
    kind: "saved",
    submittedAt: saved.submittedAt.getTime(),
    durationMs: saved.durationMs,
    failedCritical: countFailedCritical(saved.snapshot, saved.answers),
  };
}
