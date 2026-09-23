// Пин привязки планшета: выпуск из кабинета и съедание на странице привязки (D132, D133).
//
// Запросы свои, а не заказаны в блоке `data`: так устроены границы проекта (D024) —
// схему ведёт `data`, а что с ней делает привязка, знает этот блок.
import { randomInt } from "node:crypto";

import { and, eq, gt, isNull, sql } from "drizzle-orm";

import { devicePairings, getDb } from "@/blocks/data";

import { PIN_LENGTH, PIN_TTL_SECONDS, isPin } from "./pin";

const MILLISECONDS = 1000;
const PIN_CEILING = 10_000;

/**
 * Сколько раз пробовать другой код, если выпало занятое значение. Занятыми бывают только
 * несъеденные пины (уникальность стоит по ним), то есть в продукте это единицы строк на
 * десять тысяч значений — три попытки закрывают это с запасом, а бесконечный цикл на
 * исчерпанном наборе висел бы молча.
 */
const ISSUE_ATTEMPTS = 3;

/** Нарушение уникальности PostgreSQL: выпало занятое значение кода. */
const PG_UNIQUE_VIOLATION = "23505";

/**
 * Код ошибки PostgreSQL, если он есть. Drizzle заворачивает ошибку драйвера, поэтому
 * настоящий код лежит в `cause`. Свой разбор, а не общий из `catalog/errors.ts`: границы
 * блоков не дают `device` зависеть от `catalog`, а ради шести строк переносить общий
 * модуль в `core` значит трогать чужой блок ради своей задачи.
 */
function pgErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const code: unknown = (error as { code?: unknown }).code;
  if (typeof code === "string") return code;
  const cause: unknown = (error as { cause?: unknown }).cause;
  return cause === undefined ? undefined : pgErrorCode(cause);
}

/** Выпущенный пин: сам код — чтобы показать его управляющему, срок — чтобы подписать. */
export interface IssuedPin {
  readonly code: string;
  readonly expiresAt: Date;
}

/**
 * Случайные четыре цифры. Источник — `node:crypto`, а не `Math.random`: это код доступа,
 * и предсказуемая последовательность значила бы, что следующий код известен заранее.
 */
function randomPin(): string {
  return String(randomInt(0, PIN_CEILING)).padStart(PIN_LENGTH, "0");
}

/**
 * Выпускает пин для станции.
 *
 * Тем же запросом уходят две вещи: прежний несъеденный пин ЭТОЙ станции (два живых кода на
 * одну станцию — повод ввести не тот) и истёкшие несъеденные пины вообще. Чистка живёт
 * здесь, а не в планировщике, потому что уникальность кода стоит частичным индексом среди
 * несъеденных: `now()` для индекса не годится, и без чистки десять тысяч значений однажды
 * кончились бы, а выпуск начал бы отказывать на ровном месте.
 */
export async function issuePairingPin(
  stationId: string,
  now: Date,
): Promise<IssuedPin> {
  const db = getDb();
  const expiresAt = new Date(now.getTime() + PIN_TTL_SECONDS * MILLISECONDS);

  for (let attempt = 0; attempt < ISSUE_ATTEMPTS; attempt++) {
    const code = randomPin();
    try {
      await db.execute(sql`
        with cleared as (
          delete from device_pairings
           where used_at is null
             and (expires_at <= ${now.toISOString()}::timestamptz
                  or station_id = ${stationId}::uuid)
        )
        insert into device_pairings (code, station_id, expires_at)
        values (${code}, ${stationId}::uuid, ${expiresAt.toISOString()}::timestamptz)
      `);
      return { code, expiresAt };
    } catch (error) {
      // Занятое значение — не сбой, а повод взять другое. Любая другая ошибка уходит
      // вызывающему как есть: молча выданный пин, которого нет в базе, был бы хуже.
      if (pgErrorCode(error) !== PG_UNIQUE_VIOLATION) throw error;
    }
  }

  throw new Error(
    "Привязка планшета: свободный код не нашёлся за несколько попыток — живых пинов слишком много",
  );
}

/**
 * Съедает пин и отдаёт станцию, к которой он привязывал. `null` — код не годится:
 * истёк, неверен или уже съеден, и различать эти случаи наружу нельзя.
 *
 * ОДИН запрос, а не «прочитать, проверить, записать»: у входа в кабинет ровно эта
 * последовательность обходится одновременными запросами (#93). Условие одноразовости
 * (`used_at is null`) и условие срока стоят в самом `update`, поэтому станцию получает
 * ровно один из одновременно вводящих — это проверено тестом на три параллельных ввода.
 */
export async function consumePairingPin(
  code: string,
  now: Date,
): Promise<{ readonly stationId: string } | null> {
  if (!isPin(code)) return null;

  const rows = await getDb()
    .update(devicePairings)
    .set({ usedAt: now })
    .where(
      and(
        eq(devicePairings.code, code),
        isNull(devicePairings.usedAt),
        gt(devicePairings.expiresAt, now),
      ),
    )
    .returning({ stationId: devicePairings.stationId });

  const row = rows[0];
  return row === undefined ? null : { stationId: row.stationId };
}
