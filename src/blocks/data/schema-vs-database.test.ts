// Схема и миграции обязаны говорить одно и то же.
//
// `schema.ts` — источник генерации миграций (`drizzle.config.ts`), а миграции пишутся
// руками (D089). Значит расхождение между ними живёт молча: миграция уже накатила
// ограничение, схема про него не знает, все прогоны зелёные — и следующая сгенерированная
// миграция это ограничение СНИМЕТ, потому что генератор сравнивает базу со схемой, а не
// с историей. Проверено: до этого теста генератор выдавал `login_attempts` вообще без
// CHECK-ограничений, которые в базе стоят с миграции 0010 (T221).
//
// Поэтому проверка идёт не по списку имён, а сравнением двух множеств целиком: всё, что
// объявлено в `schema.ts`, и всё, что на самом деле есть в базе после наката миграций.
// Новая таблица и новое ограничение попадают под неё сами, без правки этого файла.
import { is, sql } from "drizzle-orm";
import { PgTable, getTableConfig } from "drizzle-orm/pg-core";
import { afterAll, expect, test } from "vitest";

import * as schema from "./schema";
import { closeTestDb, getTestDb } from "./testing/db";

const db = getTestDb();

afterAll(closeTestDb);

type ChecksByTable = Record<string, string[]>;

/** CHECK-ограничения, объявленные в `schema.ts`, по таблицам. */
function declaredChecks(): ChecksByTable {
  const byTable: ChecksByTable = {};
  for (const value of Object.values(schema)) {
    if (!is(value, PgTable)) continue;
    const config = getTableConfig(value);
    byTable[config.name] = config.checks.map((one) => one.name).sort();
  }
  return byTable;
}

/** CHECK-ограничения, которые после наката миграций реально стоят в базе. */
async function checksInDatabase(): Promise<ChecksByTable> {
  const tables = await db.execute<{ table_name: string }>(
    sql`select tablename as table_name from pg_tables where schemaname = 'public'`,
  );
  const byTable: ChecksByTable = {};
  for (const row of tables.rows) byTable[row.table_name] = [];

  const constraints = await db.execute<{
    table_name: string;
    constraint_name: string;
  }>(sql`
    select rel.relname as table_name, con.conname as constraint_name
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where con.contype = 'c' and nsp.nspname = 'public'
  `);
  for (const row of constraints.rows) {
    byTable[row.table_name]?.push(row.constraint_name);
  }

  for (const names of Object.values(byTable)) names.sort();
  return byTable;
}

test("CHECK-ограничения в schema.ts и в базе после миграций — одни и те же", async () => {
  const inDatabase = await checksInDatabase();

  expect(inDatabase).toStrictEqual(declaredChecks());
});
