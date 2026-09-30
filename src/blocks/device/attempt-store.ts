/**
 * Где лежит счёт попыток привязки планшета (#144).
 *
 * В базе, а не в памяти процесса: память снималась перезапуском, а на второй копии
 * приложения предел молча удваивался — каждая копия считала своё. Общая у всех копий и
 * переживающая перезапуск здесь только база.
 *
 * Устройство то же, что у счёта входа в кабинет (`auth/attempt-store.ts`, T212, T217), но
 * таблица и код свои: публичной поверхности привязки зависеть от блока входа запрещено
 * (T187), а счёт входа — его состояние.
 *
 * Главное — `countAttempt`: он ЗАНИМАЕТ место в счёте и тем же запросом говорит, какое
 * оно по порядку. Прочитать счёт и решать по прочитанному нельзя: читающий запрос ничего
 * не занимает, и залп одновременных попыток прошёл бы весь.
 *
 * Запросы свои, а не заказаны в блоке `data`, — так устроены границы проекта (D024).
 */
import { createHash } from "node:crypto";

import { and, eq, lte, sql } from "drizzle-orm";

import { deviceAttempts, getDb } from "@/blocks/data";

/** Место в счёте: какая это попытка в окне и когда окно началось. */
export interface AttemptCount {
  readonly startedAt: Date;
  readonly attempts: number;
}

/** Бюджет, область счёта в нём и ключ. Все три входят в отпечаток. */
export type AttemptKey = readonly [budget: string, scope: string, key: string];

/**
 * Потолок числа в строке. Отклонённые попытки тоже считаются, и без потолка залп растил
 * бы число без края; на приговор потолок не влияет — он выше любого предела.
 */
const ATTEMPTS_CEILING = 1_000_000;

/**
 * Отпечаток ключа, а не сам ключ: ключ приходит снаружи (адрес из заголовка), а для счёта
 * нужно только равенство. Разделитель — нулевой байт: в заголовке его не бывает, поэтому
 * склеить чужую тройку подбором нельзя.
 */
function fingerprintOf([budget, scope, key]: AttemptKey): string {
  return createHash("sha256")
    .update(`${budget}\u0000${scope}\u0000${key}`)
    .digest("hex");
}

/**
 * Занять место в счёте и узнать, какое оно по порядку — одним запросом.
 *
 * `expiredBefore` — граница устаревания: окно, начавшееся не позже неё, кончилось, и
 * попытка открывает новое. Окно объявляет вызывающий, он её и считает.
 */
export async function countAttempt(
  key: AttemptKey,
  now: Date,
  expiredBefore: Date,
): Promise<AttemptCount> {
  const expired = sql`${deviceAttempts.windowStartedAt} <= ${expiredBefore}`;
  const [row] = await getDb()
    .insert(deviceAttempts)
    .values({
      attemptKey: fingerprintOf(key),
      budget: key[0],
      windowStartedAt: now,
      attempts: 1,
    })
    .onConflictDoUpdate({
      target: deviceAttempts.attemptKey,
      set: {
        attempts: sql`case when ${expired} then 1 else least(${deviceAttempts.attempts} + 1, ${ATTEMPTS_CEILING}) end`,
        windowStartedAt: sql`case when ${expired} then ${now} else ${deviceAttempts.windowStartedAt} end`,
      },
    })
    .returning({
      startedAt: deviceAttempts.windowStartedAt,
      attempts: deviceAttempts.attempts,
    });

  // ON CONFLICT DO UPDATE всегда возвращает строку. Пустой ответ — под ногами не та
  // таблица; это отказ, а не повод пустить попытку несосчитанной.
  if (row === undefined) {
    throw new Error("Счёт попыток привязки не вернул строку");
  }
  return row;
}

/**
 * Убрать кончившиеся окна одного бюджета. Расти таблице не даёт не уборка, а сам ключ
 * (клиент считается корзиной, `rate-limit.ts`); уборка лишь не держит мёртвые окна между
 * всплесками. По бюджету, а не всю таблицу: «сейчас» у бюджетов общее только в продукте,
 * а проверки идут параллельно каждая со своим мигом и сметали бы счёт соседа посреди него.
 */
export async function sweepExpiredAttempts(
  budget: string,
  expiredBefore: Date,
): Promise<void> {
  await getDb()
    .delete(deviceAttempts)
    .where(
      and(
        eq(deviceAttempts.budget, budget),
        lte(deviceAttempts.windowStartedAt, expiredBefore),
      ),
    );
}
