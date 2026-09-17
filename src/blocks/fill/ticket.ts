// Пропуск на отправку заполнения — то, чем сервер заменил «время начала»,
// которое раньше называл браузер.
//
// Зачем вообще: длительность заполнения — единственный признак добросовестности,
// который продукт показывает управляющему. D003 снял ради неё и гео, и пороги
// скорости. Пока начало отсчёта приходило в теле запроса, эта длительность была
// ровно тем числом, которое отправитель захотел написать: признак не значил
// ничего, но выглядел как значащий, а это хуже, чем его отсутствие.
//
// Как устроено: экран выдаётся вместе с пропуском, в котором стоит серверное
// время выдачи и подпись. Браузер возвращает пропуск нетронутым, сервер сверяет
// подпись и берёт начало заполнения оттуда. Подделать начало — значит подделать
// подпись, то есть знать секрет площадки.
//
// Тот же пропуск закрывает и повтор: время выдачи внутри процесса уникально
// (`uniqueIssuedAt`), поэтому пара «версия + начало» опознаёт ровно одну отправку,
// и вторая с тем же пропуском записи не заводит (`repeat.ts`).
import { createHmac, timingSafeEqual } from "node:crypto";

import type { Parsed } from "./validation";

/**
 * Секрет подписи. Тот же, которым подписывается сессия админки, но ключ из него
 * выводится отдельный (`TICKET_PURPOSE`): подпись пропуска и подпись сессии
 * криптографически независимы, и пропуск, переложенный в куку, ничего не значит.
 *
 * Своей переменной у блока нет сознательно: у продукта один оператор и одна
 * площадка, а вторая обязательная переменная — это ещё одна раскатка, на которой
 * публичный экран молча отказывает в каждой отправке. Блок `auth` уже отказывается
 * принимать на `NODE_ENV=production` секрет из `.env.example`, то есть площадка с
 * примерным секретом — это площадка без входа в админку, а значит без продукта.
 */
const SECRET_VARIABLE = "SESSION_SECRET";
const TICKET_PURPOSE = "meridius.fill.ticket.v1";

// 32 знака ≈ 192 бита при base64: подпись перестаёт быть подбираемой. Та же мерка,
// что у подписи сессии, — она задаёт стойкость обеих.
const MIN_SECRET_LENGTH = 32;

/**
 * Сколько живёт пропуск. Это не «максимальная длительность заполнения»: время
 * выдачи теперь серверное, поэтому долгое заполнение — правда, а не сбитые часы
 * планшета, и укорачивать его незачем.
 *
 * Предел стоит по другой причине: пропуск — это право один раз записать заполнение
 * на эту станцию, и право без конца остаётся правом навсегда. Сутки заведомо
 * длиннее любой смены и заведомо короче «навсегда».
 */
export const FILL_TICKET_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface FillTicketSubject {
  readonly code: string;
  readonly versionId: string;
}

/**
 * Время выдачи, неповторимое в пределах процесса.
 *
 * Пара «версия + начало» служит опознавателем отправки, поэтому два экрана,
 * выданных в одну миллисекунду на одну версию, слились бы в одну запись — и
 * заполнение второго сотрудника молча превратилось бы в квитанцию первого.
 * Сдвиг на миллисекунду вперёд этого не допускает и на длительность не влияет.
 *
 * Считается это внутри процесса, как и счётчик частоты рядом: продукт работает
 * одним процессом (`rate-limit.ts` держит свои окна там же).
 */
let lastIssuedAt = 0;

function uniqueIssuedAt(at: Date): number {
  const next = Math.max(at.getTime(), lastIssuedAt + 1);
  lastIssuedAt = next;
  return next;
}

function ticketKey(): Buffer {
  const secret = process.env[SECRET_VARIABLE];
  if (secret === undefined || secret.trim() === "") {
    throw new Error(
      `${SECRET_VARIABLE}: переменная окружения не задана, подписать пропуск экрана заполнения нечем. См. .env.example`,
    );
  }
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `${SECRET_VARIABLE}: короче ${String(MIN_SECRET_LENGTH)} знаков — подпись пропуска подбирается. Сгенерировать: openssl rand -base64 48`,
    );
  }
  // Ключ пропуска выводится из секрета площадки, а не берётся им самим: подпись
  // сессии и подпись пропуска не должны быть одной и той же функцией.
  return createHmac("sha256", secret).update(TICKET_PURPOSE).digest();
}

function sign(issuedAt: number, subject: FillTicketSubject): string {
  return createHmac("sha256", ticketKey())
    .update(
      `${TICKET_PURPOSE}\n${String(issuedAt)}\n${subject.code}\n${subject.versionId}`,
    )
    .digest("base64url");
}

function sameSignature(given: string, expected: string): boolean {
  // Длина сравнивается отдельно: `timingSafeEqual` на разной длине бросает.
  if (given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

/**
 * Пропуск для экрана, который сейчас уходит в браузер.
 *
 * Привязан к коду станции и к версии: пропуск, полученный на одной станции,
 * не открывает запись на другую, даже если та отдала ту же версию.
 */
export function issueFillTicket(subject: FillTicketSubject, at: Date): string {
  const issuedAt = uniqueIssuedAt(at);
  return `${String(issuedAt)}.${sign(issuedAt, subject)}`;
}

/**
 * Начало заполнения по пропуску — или отказ.
 *
 * Отказ у испорченного пропуска тот же, что у любого негодного тела (`malformed`):
 * различать их значило бы рассказывать перебору, насколько он близко (D021).
 * Отдельно назван только просроченный пропуск — это единственный случай, который
 * лечится действием сотрудника, и сказать ему надо «обновите экран», а не «сломалось».
 */
export function readFillTicket(
  raw: string,
  subject: FillTicketSubject,
  now: Date,
): Parsed<number> {
  const separator = raw.indexOf(".");
  if (separator <= 0) return { ok: false, reason: "malformed" };

  const issuedAt = Number(raw.slice(0, separator));
  if (!Number.isSafeInteger(issuedAt) || issuedAt <= 0) {
    return { ok: false, reason: "malformed" };
  }
  if (!sameSignature(raw.slice(separator + 1), sign(issuedAt, subject))) {
    return { ok: false, reason: "malformed" };
  }
  if (now.getTime() - issuedAt > FILL_TICKET_MAX_AGE_MS) {
    return { ok: false, reason: "stale" };
  }

  // Часы сервера шагнули назад между выдачей экрана и отправкой: отрицательного
  // отрезка в истории быть не должно, и «0 секунд» здесь честнее минуса.
  return { ok: true, value: Math.min(issuedAt, now.getTime()) };
}

/** Только для проверок: сбросить счётчик неповторимости между прогонами. */
export function forgetIssuedTickets(): void {
  lastIssuedAt = 0;
}
