// Ограничитель попыток на странице привязки.
//
// Без него перебор десяти тысяч значений стоит минуты, а живой пин всё это время ждёт
// на той стороне. Счётчик сам берётся из блока `fill` — он там уже написан и проверен
// (`fill/rate-limit.ts`), а границы блоков это разрешают: `device` зависит от `fill`.
// Своя копия того же кольцевого счёта была бы вторым местом, где чинят одно и то же.
import {
  createRateLimiter,
  identifyClient,
  trustedProxyHops,
} from "@/blocks/fill/rate-limit";
import type { RateVerdict } from "@/blocks/fill/rate-limit";

/**
 * Числа названы вслух, потому что они и есть защита.
 *
 * · `perClient` — 10 попыток за 5 минут с одного адреса. Человек у планшета набирает
 *   четыре цифры один раз и ошибается от силы дважды; десять — запас на дрожащие руки.
 * · `everyone` — 60 попыток за 5 минут на всю сеть. Это тот предел, который работает
 *   ВСЕГДА, даже когда клиентов различить нечем (площадка не объявила посредника —
 *   см. `identifyClient`): за время жизни одного пина перебор успевает попробовать
 *   шестьдесят значений из десяти тысяч, то есть шанс попасть — меньше процента.
 *   Настоящей кухне столько попыток за пять минут не нужно: привязка бывает раз в год.
 */
const PAIR_LIMITS = {
  perClient: { maxHits: 10, windowSeconds: 5 * 60, maxTrackedKeys: 10_000 },
  everyone: { maxHits: 60, windowSeconds: 5 * 60, maxTrackedKeys: 1 },
} as const;

const EVERYONE = "все";

const perClient = createRateLimiter(PAIR_LIMITS.perClient);
const everyone = createRateLimiter(PAIR_LIMITS.everyone);

const ALLOWED: RateVerdict = { allowed: true, retryAfterSeconds: 0 };

/**
 * Пускать ли эту попытку ввода пина. Считается и клиент, и вся сеть сразу: предел на
 * клиента не применяется, когда клиентов нечем различать, и один он оставил бы перебор
 * без заслона вовсе.
 */
export function checkPairAllowed(
  client: string | null,
  now: Date,
): RateVerdict {
  const verdicts = [
    everyone.hit(EVERYONE, now),
    ...(client === null ? [] : [perClient.hit(client, now)]),
  ];
  const refused = verdicts.filter((verdict) => !verdict.allowed);
  if (refused.length === 0) return ALLOWED;

  return {
    allowed: false,
    retryAfterSeconds: Math.max(
      ...refused.map((verdict) => verdict.retryAfterSeconds),
    ),
  };
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
