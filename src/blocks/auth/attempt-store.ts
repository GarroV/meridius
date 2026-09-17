/**
 * Где лежит счёт неудачных попыток входа (T212).
 *
 * Раньше он лежал в памяти процесса, и это было записано как честное ограничение MVP.
 * Ограничением оно не было: перезапуск снимал «Повторите через 15 минут» мгновенно,
 * а процесс перезапускается сам — выкладка новой версии, падение, `restart:
 * unless-stopped` у стенда. То есть единственная граница продукта (D014: вошедший в
 * кабинет может всё) держалась на непрерывности процесса, а не на состоянии.
 *
 * Теперь счёт живёт в базе — там же, где всё остальное состояние продукта. Второго
 * хранилища ради счётчика не заводится: файл на диске пережил бы перезапуск процесса,
 * но не пересоздание контейнера, а общей у нескольких экземпляров приложения не была бы
 * ни та, ни другая память.
 *
 * Запросы свои, а не заказаны в блоке `data`, — так устроены границы проекта (D024).
 */
import { createHash } from "node:crypto";

import { eq, inArray, lte, sql } from "drizzle-orm";

import { getDb, loginFailures } from "@/blocks/data";

/** Окно неудач одного ключа: когда началось и сколько промахов в нём набралось. */
export interface FailureWindow {
  readonly startedAt: Date;
  readonly failures: number;
}

/**
 * Отпечаток ключа, а не сам ключ.
 *
 * Ключ клиента — адрес из заголовка обратного прокси: его присылает кто угодно, длины
 * он не имеет и человеку принадлежит. В базе продукта такому значению не место ни как
 * данным (людей продукт не опознаёт вовсе — D001), ни как строке из интернета. Для счёта
 * нужно только равенство ключей, а его отпечаток сохраняет полностью.
 *
 * Область счёта входит в отпечаток: без неё клиент с ключом «все» сел бы на строку
 * общего потолка и снимал бы её своим удачным входом.
 */
function fingerprint(scope: string, key: string): string {
  // Разделитель — нулевой байт: в значении заголовка его не бывает, поэтому склеить
  // чужую пару «область + ключ» подбором адреса нельзя.
  return createHash("sha256").update(`${scope}\u0000${key}`).digest("hex");
}

/** Окно ключа, как оно записано сейчас. Устаревшее окно узнаёт вызывающий по времени. */
export async function readFailureWindows(
  keys: readonly (readonly [scope: string, key: string])[],
): Promise<readonly (FailureWindow | undefined)[]> {
  const prints = keys.map(([scope, key]) => fingerprint(scope, key));
  const rows = await getDb()
    .select({
      attemptKey: loginFailures.attemptKey,
      windowStartedAt: loginFailures.windowStartedAt,
      failures: loginFailures.failures,
    })
    .from(loginFailures)
    .where(inArray(loginFailures.attemptKey, [...prints]));

  const byPrint = new Map(rows.map((row) => [row.attemptKey, row]));
  return prints.map((print) => {
    const row = byPrint.get(print);
    return row === undefined
      ? undefined
      : { startedAt: row.windowStartedAt, failures: row.failures };
  });
}

/**
 * Засчитать неудачу.
 *
 * Счёт идёт одним запросом в базе, а не чтением с последующей записью: попытки входа
 * приходят разом с нескольких соединений, и посчитанное в приложении «прочитал 4, пишу 5»
 * даёт перебирающему лишние попытки ровно тогда, когда он их и добивается.
 *
 * `expiredBefore` — граница устаревания окна: окно, начавшееся не позже её, кончилось,
 * и неудача открывает новое. Считает её вызывающий, потому что окно он же и объявляет.
 */
export async function countFailure(
  scope: string,
  key: string,
  now: Date,
  expiredBefore: Date,
): Promise<void> {
  const expired = sql`${loginFailures.windowStartedAt} <= ${expiredBefore}`;
  await getDb()
    .insert(loginFailures)
    .values({
      attemptKey: fingerprint(scope, key),
      windowStartedAt: now,
      failures: 1,
    })
    .onConflictDoUpdate({
      target: loginFailures.attemptKey,
      set: {
        failures: sql`case when ${expired} then 1 else ${loginFailures.failures} + 1 end`,
        windowStartedAt: sql`case when ${expired} then ${now} else ${loginFailures.windowStartedAt} end`,
      },
    });
}

/** Снять счёт одного ключа: так удачный вход отпускает того, кто знает пароль. */
export async function forgetFailures(
  scope: string,
  key: string,
): Promise<void> {
  await getDb()
    .delete(loginFailures)
    .where(eq(loginFailures.attemptKey, fingerprint(scope, key)));
}

/**
 * Убрать окна, которые кончились. Зовётся на каждой неудаче: таблица обязана оставаться
 * размером с текущий перебор, а не расти на каждый увиденный адрес.
 */
export async function sweepExpiredFailures(expiredBefore: Date): Promise<void> {
  await getDb()
    .delete(loginFailures)
    .where(lte(loginFailures.windowStartedAt, expiredBefore));
}

/** Полный сброс. Нужен тестам, которые делят одну базу. */
export async function forgetAllFailures(): Promise<void> {
  await getDb().delete(loginFailures);
}
