// T060: пул соединений без таймаутов. Настоящий PostgreSQL — единственный, кто знает,
// какой statement_timeout видит сессия и как пул ведёт себя, когда все соединения заняты:
// заглушкой это не проверить, а именно тут прячется риск зависшего под нагрузкой пула.
//
// T068: срок ожидания в очереди меряется виртуальным временем, а не секундомером.
// Прежняя проверка гонялась настенными часами: отказ ждали три секунды и сверяли со
// сторожем на шести. Такая проверка зависит от скорости машины (под инструментацией
// покрытия и параллельными файлами задержка планировщика измеряется секундами) и при
// этом слабее, чем кажется: любой срок меньше сторожа — хоть 5 000 мс — она принимала
// за верный. Ожидание в очереди целиком состоит из одного таймера внутри pg-pool
// (`connect()` кладёт запрос в `_pendingQueue` и заводит `setTimeout` на
// `connectionTimeoutMillis`), ввода-вывода в нём нет. Значит, таймеры можно подменить
// и истечь срок по команде: проверка становится точной (отказ ровно на своём сроке,
// не раньше и не позже) и перестаёт зависеть от загрузки машины.
import { sql } from "drizzle-orm";
import type { Pool, PoolClient } from "pg";
import { describe, expect, test, vi } from "vitest";

import { getDb } from "./client";

const EXPECTED_STATEMENT_TIMEOUT_MS = 10_000;
const EXPECTED_CONNECTION_TIMEOUT_MS = 3_000;
const EXPECTED_POOL_MAX = 10;

// Установка десяти настоящих соединений — единственная часть теста с вводом-выводом,
// и она идёт на настоящих часах. Запас взят с избытком: на загруженной машине
// рукопожатия с базой занимают заметно больше, чем в тишине, а падение по таймауту
// самого прогона выглядело бы как дефект продукта.
const TEST_TIMEOUT_MS = 30_000;

interface PoolHolder {
  meridiusPool?: Pool;
}

/**
 * Достаёт живой пул продукта из globalThis тем же приёмом, что и сам client.ts:
 * пул не экспортирован, а тест обязан видеть настоящие соединения, а не пересоздавать свои.
 */
function appPool(): Pool {
  getDb(); // getDb создаёт пул при первом обращении
  const pool = (globalThis as PoolHolder).meridiusPool;
  if (pool === undefined) {
    throw new Error("Пул продукта не создан: getDb() его не завёл");
  }
  return pool;
}

describe("пул соединений", () => {
  test("серверный предел времени запроса стоит на соединениях пула", async () => {
    const db = getDb();

    const result = await db.execute<{ setting: string }>(
      sql`select setting from pg_settings where name = 'statement_timeout'`,
    );

    expect(result.rows[0]?.setting).toBe(String(EXPECTED_STATEMENT_TIMEOUT_MS));
  });

  test(
    "пул отказывает ровно на своём сроке, когда все соединения заняты, а не копит очередь",
    async () => {
      const pool = appPool();
      const held: PoolClient[] = [];
      try {
        for (let index = 0; index < EXPECTED_POOL_MAX; index += 1) {
          held.push(await pool.connect());
        }

        // С этого места ввода-вывода нет: запрос сверх предела ложится в очередь,
        // и весь его срок — один таймер. Подменяем таймеры, чтобы срок истекал
        // по команде теста, а не по тому, насколько занята машина.
        vi.useFakeTimers();

        let outcome: string | undefined;
        const attempt = pool.connect().then(
          (extra) => {
            held.push(extra);
            return "выдал соединение сверх предела";
          },
          (error: unknown) =>
            `отказал: ${error instanceof Error ? error.message : String(error)}`,
        );
        void attempt.then((result) => {
          outcome = result;
        });

        // Запрос обязан именно встать в очередь, и проверяется это до всякого ожидания:
        // будь предел соединений выше заявленного, pg завёл бы одиннадцатое соединение,
        // очередь осталась бы пустой — а срок ожидания у такого запроса тот же самый,
        // и по одному лишь отказу подмену предела было бы не отличить.
        expect(pool.waitingCount).toBe(1);
        expect(pool.totalCount).toBe(EXPECTED_POOL_MAX);

        // За миллисекунду до срока запрос обязан ещё ждать: иначе отказ приходит
        // раньше настроенного, и предел на самом деле не тот, что заявлен.
        await vi.advanceTimersByTimeAsync(EXPECTED_CONNECTION_TIMEOUT_MS - 1);
        expect(outcome).toBeUndefined();

        // На сроке — отказ. Если бы пул копил очередь (предел не задан вовсе или
        // больше заявленного), запрос остался бы висеть и здесь — и проверка падает
        // сразу, а не по таймауту прогона: `outcome` так и остался бы пустым.
        await vi.advanceTimersByTimeAsync(1);
        expect(outcome ?? "запрос всё ещё ждёт в очереди").toMatch(
          /^отказал: .*timeout/i,
        );
      } finally {
        // Часы возвращаются до освобождения соединений: освобождение заводит
        // таймер простоя, и он должен быть настоящим, а не осиротевшим фальшивым.
        vi.useRealTimers();
        for (const client of held) client.release();
      }
    },
    TEST_TIMEOUT_MS,
  );
});
