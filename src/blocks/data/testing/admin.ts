// Служебные операции над самой базой: создать и удалить. Нужны прогону тестов —
// тестовая база готовится с нуля, а откат миграций проверяется на выброшенной копии,
// чтобы не мешать параллельным файлам тестов.
import { Pool } from "pg";

import { claimStand, foreignStandMessage, ownStand } from "@/blocks/core/stand";

function quoteIdentifier(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

function databaseNameFrom(url: URL): string {
  return decodeURIComponent(url.pathname.replace(/^\//, ""));
}

/** Подключение к служебной базе `postgres` того же сервера. */
function adminUrl(url: URL): string {
  const admin = new URL(url.toString());
  admin.pathname = "/postgres";
  return admin.toString();
}

export function unreachableDatabase(url: URL, cause: unknown): Error {
  return new Error(
    `База ${url.host} недоступна. Поднимите её: docker compose -p <имя-стенда> up -d db. ` +
      `Причина: ${cause instanceof Error ? cause.message : String(cause)}`,
  );
}

async function onAdminConnection<T>(
  url: URL,
  action: (pool: Pool) => Promise<T>,
): Promise<T> {
  const pool = new Pool({ connectionString: adminUrl(url) });
  try {
    return await action(pool);
  } catch (cause) {
    throw unreachableDatabase(url, cause);
  } finally {
    await pool.end();
  }
}

/**
 * Отказывает, если сервер принадлежит другой копии репозитория (T101).
 *
 * Стоит перед созданием базы, а не после: прогон одной копии не должен ни заводить свои
 * базы на чужом сервере, ни считать чужой стенд своим. Ничейный сервер помечается своим
 * и ничего при этом не сносится — разбор в `@/blocks/core/stand`.
 */
async function assertOwnStand(url: URL): Promise<void> {
  const own = ownStand();
  const check = await onAdminConnection(url, (pool) => claimStand(pool, own));
  if (check.kind === "foreign") {
    throw new Error(foreignStandMessage(check, { target: url.host, own }));
  }
}

/** Создаёт базу, если её ещё нет. Имя подставляется идентификатором: параметры в CREATE DATABASE не работают. */
export async function ensureDatabase(url: URL): Promise<void> {
  const name = databaseNameFrom(url);
  await assertOwnStand(url);
  await onAdminConnection(url, async (pool) => {
    const existing = await pool.query(
      "select 1 from pg_database where datname = $1",
      [name],
    );
    if (existing.rowCount === 0) {
      await pool.query(`create database ${quoteIdentifier(name)}`);
    }
  });
}

export async function dropDatabase(url: URL): Promise<void> {
  const name = databaseNameFrom(url);
  await onAdminConnection(url, async (pool) => {
    await pool.query(
      `drop database if exists ${quoteIdentifier(name)} with (force)`,
    );
  });
}
