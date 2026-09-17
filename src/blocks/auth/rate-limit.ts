/**
 * Ограничение частоты неудачных попыток входа (T066, T212).
 *
 * Пароль один на всю сеть, кабинет смотрит в интернет, и до T066 перебор упирался только
 * в стоимость scrypt. Теперь считаются неудачи: пять с одного адреса за 15 минут и общий
 * потолок в 50 на всех.
 *
 * Счёт живёт в базе (`attempt-store.ts`), а не в памяти процесса. Это не украшение:
 * пока он лежал в памяти, отказ «Повторите через 15 минут» снимался перезапуском
 * процесса — то есть ограничитель держался на том, что процесс не перезапускали,
 * а перезапускается он сам (выкладка, падение, `restart: unless-stopped`).
 *
 * Отказ базы здесь — отказ во входе, а не проход мимо счёта: впустить, не сумев
 * посчитать, значит снять ограничитель ровно в тот момент, когда по продукту стучат.
 * Кабинет без базы всё равно пуст, поэтому цена такого отказа — экран ошибки, а не
 * открытая настежь форма.
 */
import {
  countFailure,
  forgetAllFailures,
  forgetFailures,
  readFailureWindows,
  sweepExpiredFailures,
} from "./attempt-store";
import type { FailureWindow } from "./attempt-store";

/** Приговор попытке: пускать ли и, если нет, через сколько секунд повторять. */
export interface ThrottleVerdict {
  readonly allowed: boolean;
  readonly retryAfterSeconds: number;
}

/** Предел одной области счёта: сколько неудач в окне допускается. */
export interface ThrottleLimit {
  readonly maxFailures: number;
  readonly windowSeconds: number;
}

const ALLOWED: ThrottleVerdict = { allowed: true, retryAfterSeconds: 0 };
const MILLISECONDS = 1000;

/**
 * Приговор по записанному окну. Вся арифметика отказа — здесь, отдельно от хранилища:
 * так правило «окно отсчитывается от первой неудачи» проверяется само по себе.
 *
 * Окно фиксированное: отсчёт идёт от первой неудачи, а не от последней. Так отказ
 * гарантированно кончается в названный срок — иначе попытки перебирающего продлевали бы
 * блокировку администратору бесконечно.
 */
export function verdictFor(
  window: FailureWindow | undefined,
  now: Date,
  limit: ThrottleLimit,
): ThrottleVerdict {
  if (window === undefined) return ALLOWED;

  const endsAt =
    window.startedAt.getTime() + limit.windowSeconds * MILLISECONDS;
  const at = now.getTime();
  if (at >= endsAt) return ALLOWED;
  if (window.failures < limit.maxFailures) return ALLOWED;

  return {
    allowed: false,
    retryAfterSeconds: Math.ceil((endsAt - at) / MILLISECONDS),
  };
}

/**
 * Пределы. Клиентский — жёсткий: пять промахов подряд человек не делает.
 * Общий — потолок на случай, когда клиентский обходят: адрес берётся из заголовка,
 * а заголовок подделывается, и без общего счёта перебор шёл бы с нового адреса каждый раз.
 * Общий предел заметно выше клиентского, чтобы чужие промахи не запирали администратора
 * при первой же случайной опечатке соседа.
 *
 * Общий потолок заодно держит размер таблицы: строка появляется только на попытке,
 * которую он впустил, а после него не впускается ни одна.
 */
export const LOGIN_LIMITS = {
  perClient: { maxFailures: 5, windowSeconds: 15 * 60 },
  everyone: { maxFailures: 50, windowSeconds: 15 * 60 },
} as const;

/** Области счёта. Входят в отпечаток ключа, поэтому клиент не сядет на общую строку. */
const CLIENT_SCOPE = "клиент";
const EVERYONE_SCOPE = "все";
/** У общего счёта ключ один на всех: он адресов не различает — в этом и смысл. */
const EVERYONE_KEY = "";

function scopes(client: string): readonly (readonly [string, string])[] {
  return [
    [CLIENT_SCOPE, client],
    [EVERYONE_SCOPE, EVERYONE_KEY],
  ];
}

/** Самое длинное окно: до него строка ещё может понадобиться, после — уже нет. */
function longestWindowSeconds(): number {
  return Math.max(
    LOGIN_LIMITS.perClient.windowSeconds,
    LOGIN_LIMITS.everyone.windowSeconds,
  );
}

function expiryEdge(now: Date, windowSeconds: number): Date {
  return new Date(now.getTime() - windowSeconds * MILLISECONDS);
}

/** Пускать ли эту попытку. Отказ называет больший из двух сроков ожидания. */
export async function checkLoginAllowed(
  client: string,
  now: Date,
): Promise<ThrottleVerdict> {
  const [clientWindow, everyoneWindow] = await readFailureWindows(
    scopes(client),
  );

  const refused = [
    verdictFor(clientWindow, now, LOGIN_LIMITS.perClient),
    verdictFor(everyoneWindow, now, LOGIN_LIMITS.everyone),
  ].filter((verdict) => !verdict.allowed);
  if (refused.length === 0) return ALLOWED;

  return {
    allowed: false,
    retryAfterSeconds: Math.max(
      ...refused.map((verdict) => verdict.retryAfterSeconds),
    ),
  };
}

/** Неверный пароль: считается и клиенту, и всем сразу. */
export async function registerLoginFailure(
  client: string,
  now: Date,
): Promise<void> {
  await sweepExpiredFailures(expiryEdge(now, longestWindowSeconds()));
  await Promise.all([
    countFailure(
      CLIENT_SCOPE,
      client,
      now,
      expiryEdge(now, LOGIN_LIMITS.perClient.windowSeconds),
    ),
    countFailure(
      EVERYONE_SCOPE,
      EVERYONE_KEY,
      now,
      expiryEdge(now, LOGIN_LIMITS.everyone.windowSeconds),
    ),
  ]);
}

/**
 * Удачный вход снимает оба счётчика: тот, кто знает пароль, — не перебор, и запирать
 * его из-за чужих промахов незачем.
 */
export async function forgetLoginFailures(client: string): Promise<void> {
  await Promise.all([
    forgetFailures(CLIENT_SCOPE, client),
    forgetFailures(EVERYONE_SCOPE, EVERYONE_KEY),
  ]);
}

/** Полный сброс. Нужен тестам, которые делят одну базу. */
export async function forgetAllLoginFailures(): Promise<void> {
  await forgetAllFailures();
}
