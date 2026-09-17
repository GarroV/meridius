/**
 * Ограничение частоты попыток входа (T066, T212, T217).
 *
 * Пароль один на всю сеть, кабинет смотрит в интернет, и до T066 перебор упирался только
 * в стоимость scrypt. Теперь попыток отмерено: пять с одного адреса за 15 минут и общий
 * потолок в 50 на всех.
 *
 * Два правила держат этот модуль, и оба взяты не из вкуса, а из найденных дыр.
 *
 * Первое: счёт живёт в базе (`attempt-store.ts`), а не в памяти процесса (T212). Пока он
 * лежал в памяти, отказ «Повторите через 15 минут» снимался перезапуском — то есть
 * ограничитель держался на том, что процесс не перезапускали, а перезапускается он сам
 * (выкладка, падение, `restart: unless-stopped`).
 *
 * Второе: попытка ЗАНИМАЕТ место в счёте раньше, чем проверяется пароль, и приговор
 * выносится по занятому месту (T217). Прежде решение принималось отдельным читающим
 * запросом, а попытка записывалась после проверки пароля: читающий запрос ничего не
 * занимает, поэтому запросы, пришедшие разом, читали одинаковое «ещё не отказ» и
 * доходили до пароля все до одного — предел снимался одновременностью. Отсюда следствие,
 * которое надо знать: считаются попытки, в том числе отклонённые, а не одни промахи.
 * Удачный вход снимает счёт целиком, поэтому человеку с паролем это ничего не стоит.
 *
 * Отказ базы здесь — отказ во входе, а не проход мимо счёта: впустить, не сумев
 * посчитать, значит снять ограничитель ровно в тот момент, когда по продукту стучат.
 * Кабинет без базы всё равно пуст, поэтому цена такого отказа — экран ошибки, а не
 * открытая настежь форма.
 */
import { createHash } from "node:crypto";

import {
  countAttempt,
  forgetAttempts,
  sweepExpiredAttempts,
} from "./attempt-store";
import type { AttemptCount, AttemptKey } from "./attempt-store";

/** Приговор попытке: пускать ли и, если нет, через сколько секунд повторять. */
export interface ThrottleVerdict {
  readonly allowed: boolean;
  readonly retryAfterSeconds: number;
}

/** Предел одной области счёта: сколько попыток в окне допускается. */
export interface ThrottleLimit {
  readonly maxAttempts: number;
  readonly windowSeconds: number;
}

const ALLOWED: ThrottleVerdict = { allowed: true, retryAfterSeconds: 0 };
const MILLISECONDS = 1000;

/**
 * Приговор по занятому месту. Вся арифметика отказа — здесь, отдельно от хранилища:
 * так правило «окно отсчитывается от первой попытки» проверяется само по себе.
 *
 * Окно фиксированное: отсчёт идёт от первой попытки, а не от последней. Так отказ
 * гарантированно кончается в названный срок — иначе залп перебирающего продлевал бы
 * блокировку администратору бесконечно.
 *
 * Место считается вместе с текущей попыткой, поэтому предел сравнивается нестрого:
 * пятая попытка при пределе в пять ещё проходит, шестая — уже нет.
 */
export function verdictFor(
  count: AttemptCount,
  now: Date,
  limit: ThrottleLimit,
): ThrottleVerdict {
  const endsAt = count.startedAt.getTime() + limit.windowSeconds * MILLISECONDS;
  const at = now.getTime();
  if (at >= endsAt) return ALLOWED;
  if (count.attempts <= limit.maxAttempts) return ALLOWED;

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
 */
export const LOGIN_LIMITS = {
  perClient: { maxAttempts: 5, windowSeconds: 15 * 60 },
  everyone: { maxAttempts: 50, windowSeconds: 15 * 60 },
} as const;

/**
 * Сколько корзин у клиентского счёта.
 *
 * Клиент опознаётся не адресом, а корзиной — остатком от хэша адреса. Причина
 * та же, по которой у прежнего счёта в памяти стоял потолок числа клиентов: адрес
 * приходит подделываемым заголовком, и строка на каждый увиденный адрес означала бы
 * рост хранилища ровно настолько, насколько перебирающему хватит терпения. Корзин
 * ровно столько, сколько здесь написано, поэтому больше строк в таблице не появится
 * НИКОГДА — это свойство самого ключа, а не уборки, которая может не успеть.
 *
 * Чем это платится: два разных адреса могут попасть в одну корзину и делить пятёрку
 * попыток. При десяти тысячах корзин и горстке администраторов это событие
 * пренебрежимо, а цена ошибки несимметрична — лишний отказ человек переживёт, лишняя
 * попытка перебора достаётся тому, кто подбирает единственный пароль продукта.
 *
 * Прежний способ — вытеснять самые старые строки сверх потолка — отвергнут: под
 * перебором он вытеснял бы как раз запертых, то есть снимал бы блокировки ровно тогда,
 * когда они нужны.
 */
const CLIENT_BUCKETS = 10_000;

/** Области счёта. Входят в отпечаток ключа, поэтому клиент не сядет на общую строку. */
const CLIENT_SCOPE = "клиент";
const EVERYONE_SCOPE = "все";
/** У общего счёта ключ один на всех: он адресов не различает — в этом и смысл. */
const EVERYONE: AttemptKey = [EVERYONE_SCOPE, ""];

/** Корзина адреса. Хэш, а не остаток от самого адреса: адреса идут не подряд. */
export function bucketOf(client: string): string {
  const digest = createHash("sha256").update(client).digest();
  return String(digest.readUInt32BE(0) % CLIENT_BUCKETS);
}

function clientKey(client: string): AttemptKey {
  return [CLIENT_SCOPE, bucketOf(client)];
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

/**
 * Уборка кончившихся окон идёт не чаще раза в минуту на процесс.
 *
 * Отметка о последней уборке — единственное, что здесь осталось в памяти, и осталось
 * сознательно: уборка — хозяйство, а не защита. Потерять её при перезапуске значит
 * подмести лишний раз, а не пустить лишнюю попытку. Без ограничителя частоты уборка
 * шла бы на каждый запрос залпа, то есть работала бы на того, от кого защищаемся.
 */
const SWEEP_EVERY_SECONDS = 60;
let sweptAt: number | undefined;

async function sweepOccasionally(now: Date): Promise<void> {
  const at = now.getTime();
  if (
    sweptAt !== undefined &&
    Math.abs(at - sweptAt) < SWEEP_EVERY_SECONDS * MILLISECONDS
  ) {
    return;
  }
  sweptAt = at;
  await sweepExpiredAttempts(expiryEdge(now, longestWindowSeconds()));
}

/**
 * Занять место под попытку входа и сказать, пускать ли её.
 *
 * Зовётся ДО проверки пароля и ровно один раз на попытку: место занимается, даже если
 * пароль потом окажется верным. Тому, кто знает пароль, это ничего не стоит — удачный
 * вход снимает счёт (`forgetLoginAttempts`).
 */
export async function reserveLoginAttempt(
  client: string,
  now: Date,
): Promise<ThrottleVerdict> {
  await sweepOccasionally(now);

  const ofClient = await countAttempt(
    clientKey(client),
    now,
    expiryEdge(now, LOGIN_LIMITS.perClient.windowSeconds),
  );
  const forClient = verdictFor(ofClient, now, LOGIN_LIMITS.perClient);
  // Клиент уже за своим пределом — общий счёт не трогаем. Иначе один стучащийся запирал
  // бы кабинет всем подряд, просто отправляя побольше запросов со своего адреса.
  if (!forClient.allowed) return forClient;

  const ofEveryone = await countAttempt(
    EVERYONE,
    now,
    expiryEdge(now, LOGIN_LIMITS.everyone.windowSeconds),
  );
  return verdictFor(ofEveryone, now, LOGIN_LIMITS.everyone);
}

/**
 * Удачный вход снимает оба счёта: тот, кто знает пароль, — не перебор, и запирать
 * его из-за чужих промахов незачем.
 */
export async function forgetLoginAttempts(client: string): Promise<void> {
  await Promise.all([
    forgetAttempts(clientKey(client)),
    forgetAttempts(EVERYONE),
  ]);
}
