// Пределы попыток привязки планшета (#144).
//
// Без них перебор десяти тысяч значений пина стоит минуты, а живой пин всё это время ждёт
// на той стороне. Два правила держат модуль.
//
// Первое: счёт живёт в базе (`attempt-store.ts`), а не в памяти процесса. Память снималась
// перезапуском, а вторая копия приложения молча удваивала предел.
//
// Второе: бюджетов два, и счёт у них раздельный. Ввод кода на `/pair` публичен — его
// общий бюджет выбирает кто угодно из интернета. Выпуск кода в кабинете считается на
// учётку, и перебор на планшетной странице не оставляет управляющего без кода.
//
// Отказ базы — отказ в попытке, а не проход мимо счёта: пустить, не сумев посчитать,
// значит снять ограничитель ровно тогда, когда по продукту стучат.
import { createHash } from "node:crypto";

import { identifyClient, trustedProxyHops } from "@/blocks/fill/rate-limit";

import { countAttempt, sweepExpiredAttempts } from "./attempt-store";
import type { AttemptCount } from "./attempt-store";

/** Приговор попытке: пускать ли и, если нет, через сколько секунд повторять. */
export interface RateVerdict {
  readonly allowed: boolean;
  readonly retryAfterSeconds: number;
}

/** Предел одной области счёта: сколько попыток в окне допускается. */
interface Limit {
  readonly maxAttempts: number;
  readonly windowSeconds: number;
}

/**
 * Бюджет: имя (входит в отпечаток строки, поэтому бюджеты не делят счёт), предел на
 * одного клиента и — где клиента можно подделать — общий потолок.
 */
export interface Budget {
  readonly name: string;
  readonly perClient: Limit;
  readonly everyone?: Limit;
}

/** Бюджет ввода кода: общий предел на сеть у него обязателен, а не по желанию. */
export interface PairBudget extends Budget {
  readonly everyone: Limit;
}

const FIVE_MINUTES = 5 * 60;

/**
 * Ввод кода на планшете. Числа названы вслух, потому что они и есть защита.
 *
 * · `perClient` — 10 попыток за 5 минут с одного адреса. Человек у планшета набирает
 *   четыре цифры один раз и ошибается от силы дважды; десять — запас на дрожащие руки.
 * · `everyone` — 60 попыток за 5 минут на всю сеть. Работает ВСЕГДА, даже когда клиентов
 *   различить нечем (площадка не объявила посредника) или адрес подделан: за жизнь одного
 *   пина перебор пробует шестьдесят значений из десяти тысяч — шанс попасть меньше
 *   процента. Настоящей кухне столько не нужно: привязка бывает раз в год.
 */
export const PAIR_BUDGET: PairBudget = {
  name: "pair",
  perClient: { maxAttempts: 10, windowSeconds: FIVE_MINUTES },
  everyone: { maxAttempts: 60, windowSeconds: FIVE_MINUTES },
};

/**
 * Выпуск кода в кабинете — на учётку. Учётку, в отличие от адреса, подделать нельзя: она
 * из подписанной сессии, — поэтому общий потолок здесь не нужен, и управляющего одной
 * пиццерии не запирает соседняя. Десять кодов за пять минут — с запасом на «истёк,
 * выпущу новый» у нескольких станций подряд; больше — уже не человек у кнопки.
 */
export const ISSUE_BUDGET: Budget = {
  name: "issue",
  perClient: { maxAttempts: 10, windowSeconds: FIVE_MINUTES },
};

const MILLISECONDS = 1000;
const ALLOWED: RateVerdict = { allowed: true, retryAfterSeconds: 0 };

/**
 * Сколько корзин у клиентского счёта ввода. Адрес приходит подделываемым заголовком, и
 * строка на каждый адрес росла бы, пока хватает терпения перебирающему; корзин ровно
 * столько, и строк больше не станет. Цена — два адреса изредка делят десятку попыток.
 */
const CLIENT_BUCKETS = 10_000;

const CLIENT_SCOPE = "клиент";
const EVERYONE_SCOPE = "все";
const ACCOUNT_SCOPE = "учётка";

function bucketOf(client: string): string {
  const digest = createHash("sha256").update(client).digest();
  return String(digest.readUInt32BE(0) % CLIENT_BUCKETS);
}

/**
 * Приговор по занятому месту. Окно фиксированное — от первой попытки, поэтому отказ
 * кончается в названный срок и залп его не продлевает. Место считается вместе с текущей
 * попыткой: десятая при пределе в десять проходит, одиннадцатая — нет.
 */
function verdictFor(count: AttemptCount, now: Date, limit: Limit): RateVerdict {
  const endsAt = count.startedAt.getTime() + limit.windowSeconds * MILLISECONDS;
  const at = now.getTime();
  if (at >= endsAt || count.attempts <= limit.maxAttempts) return ALLOWED;
  return {
    allowed: false,
    retryAfterSeconds: Math.ceil((endsAt - at) / MILLISECONDS),
  };
}

function edge(now: Date, windowSeconds: number): Date {
  return new Date(now.getTime() - windowSeconds * MILLISECONDS);
}

/**
 * Уборка кончившихся окон — не чаще раза в минуту на процесс. Отметка в памяти осталась
 * сознательно: уборка — хозяйство, а не защита, и потерять отметку значит подмести лишний
 * раз, а не пустить лишнюю попытку.
 */
const SWEEP_EVERY_SECONDS = 60;
const sweptAt = new Map<string, number>();

async function sweepOccasionally(budget: Budget, now: Date): Promise<void> {
  const at = now.getTime();
  const last = sweptAt.get(budget.name);
  if (
    last !== undefined &&
    Math.abs(at - last) < SWEEP_EVERY_SECONDS * MILLISECONDS
  ) {
    return;
  }
  sweptAt.set(budget.name, at);
  // Самое длинное окно бюджета: до него строка ещё может понадобиться, после — уже нет.
  const longest = Math.max(
    budget.perClient.windowSeconds,
    budget.everyone?.windowSeconds ?? 0,
  );
  await sweepExpiredAttempts(budget.name, edge(now, longest));
}

/**
 * Занять место во всех названных счётах и вынести общий приговор. Считаются все сразу,
 * даже когда один уже отказал: иначе перебор, упёршийся в клиентский предел, перестал бы
 * тратить общий, и наоборот.
 */
async function spend(
  counts: readonly (readonly [scope: string, key: string, limit: Limit])[],
  budget: Budget,
  now: Date,
): Promise<RateVerdict> {
  await sweepOccasionally(budget, now);
  const verdicts = await Promise.all(
    counts.map(async ([scope, key, limit]) =>
      verdictFor(
        await countAttempt(
          [budget.name, scope, key],
          now,
          edge(now, limit.windowSeconds),
        ),
        now,
        limit,
      ),
    ),
  );
  const refused = verdicts.filter((verdict) => !verdict.allowed);
  if (refused.length === 0) return ALLOWED;
  return {
    allowed: false,
    retryAfterSeconds: Math.max(
      ...refused.map((verdict) => verdict.retryAfterSeconds),
    ),
  };
}

/**
 * Пускать ли эту попытку ввода кода. Считается и клиент, и вся сеть: предел на клиента
 * не применяется, когда клиентов нечем различать, и один он оставил бы перебор без
 * заслона. Бюджет передаётся проверками — своё имя изолирует их счёт от соседних файлов.
 */
export async function checkPairAllowed(
  client: string | null,
  now: Date,
  budget: PairBudget = PAIR_BUDGET,
): Promise<RateVerdict> {
  const counts: [string, string, Limit][] = [
    [EVERYONE_SCOPE, "", budget.everyone],
  ];
  if (client !== null) {
    counts.push([CLIENT_SCOPE, bucketOf(client), budget.perClient]);
  }
  return spend(counts, budget, now);
}

/** Пускать ли выпуск кода этой учёткой кабинета. */
export async function checkIssueAllowed(
  account: string,
  now: Date,
  budget: Budget = ISSUE_BUDGET,
): Promise<RateVerdict> {
  return spend([[ACCOUNT_SCOPE, account, budget.perClient]], budget, now);
}

/** Кто прислал попытку — тем же правилом, что и на экране заполнения. */
export function pairClientKey(
  forwardedFor: string | null,
  env: Record<string, string | undefined>,
): string | null {
  return identifyClient({
    forwardedFor,
    // Адреса соединения среда выполнения не даёт (см. `fill/rate-limit.ts`).
    peerAddress: null,
    trustedProxyHops: trustedProxyHops(env),
  });
}
