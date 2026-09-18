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
//
// Сверяются не имена, а ТЕКСТЫ условий (T238). Одних имён мало ровно в том случае, ради
// которого проверка и писалась: замена `attempts > 0` на `attempts >= 0` при сохранённом
// имени — это снятое правило целостности, о котором никто не узнает, потому что имя на
// месте и оба множества совпадают.
//
// Тексты не канонизируются руками. Одно и то же условие схема и база пишут по-разному, и
// разница не косметическая: `locale in ('ru','en')` база печатает как
// `locale = ANY (ARRAY['ru'::text, 'en'::text])`, а `length(label) between 1 and 240` — как
// `length(label) >= 1 AND length(label) <= 240`. Набор регулярных выражений, приводящий одно
// к другому, — это свой разбор SQL в тесте: он краснеет на синтаксическом шуме и, что хуже,
// чинится ослаблением сравнения, пока не перестанет ловить подмену. Поэтому канонизацию
// делает сам PostgreSQL: объявленное в схеме ограничение вешается на временную копию
// таблицы (`create temp table (like …)`, живёт до конца транзакции), и обе стороны
// читаются одним и тем же `pg_get_constraintdef`.
import { is, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { PgDialect, PgTable, getTableConfig } from "drizzle-orm/pg-core";
import { afterAll, expect, test } from "vitest";

import * as schema from "./schema";
import { closeTestDb, getTestDb } from "./testing/db";

const db = getTestDb();

afterAll(closeTestDb);

/** Таблица → имя CHECK-ограничения → текст условия, как его печатает база. */
type ChecksByTable = Record<string, Record<string, string>>;

const dialect = new PgDialect();

/**
 * Текст условия, объявленного в `schema.ts`, для подстановки в DDL.
 *
 * Значение внутри `check()` — выражение Drizzle, и в DDL оно обязано попасть текстом:
 * подстановок (`$1`) в DDL PostgreSQL не принимает. В схеме числа и так подставляются
 * через `sql.raw` (пределы размера JSONB, длина подписи), поэтому подстановок здесь не
 * бывает; если появятся — тест обязан сказать об этом словами, а не отказом базы.
 */
function declaredText(name: string, value: SQL): string {
  const query = dialect.sqlToQuery(value);
  if (query.params.length > 0) {
    throw new Error(
      `CHECK ${name} объявлен с подстановкой значения: в DDL она не пройдёт. Внесите значение в текст через sql.raw`,
    );
  }
  return query.sql;
}

/**
 * CHECK-ограничения, объявленные в `schema.ts`, в том виде, в каком их напечатала бы база.
 *
 * Каждая таблица схемы копируется во временную (`like`, то есть те же колонки тех же
 * типов — иначе выражение не к чему привязать), на копию вешаются объявленные условия, и
 * текст читается обратно тем же `pg_get_constraintdef`. Всё внутри одной транзакции:
 * временные таблицы живут в сеансе, а сеанс в пуле у каждого запроса может быть свой.
 * Настоящие таблицы при этом не трогаются вовсе.
 */
async function declaredChecks(): Promise<ChecksByTable> {
  return db.transaction(async (tx) => {
    const byTable: ChecksByTable = {};
    for (const value of Object.values(schema)) {
      if (!is(value, PgTable)) continue;
      const config = getTableConfig(value);
      byTable[config.name] = {};
      if (config.checks.length === 0) continue;

      try {
        await tx.execute(
          sql`create temp table ${sql.identifier(config.name)} (like ${sql.identifier("public")}.${sql.identifier(config.name)}) on commit drop`,
        );
      } catch (cause) {
        // Копировать нечего — таблица объявлена в схеме, а в базе её нет. Это тот же
        // класс расхождения, ради которого тест и написан, и сказать о нём надо словами:
        // иначе сверка падает отказом базы, и читающий ищет ошибку в самом тесте.
        throw new Error(
          `Таблица ${config.name} объявлена в schema.ts, но в базе её нет: не хватает миграции`,
          { cause },
        );
      }
      for (const one of config.checks) {
        await tx.execute(
          sql`alter table ${sql.identifier(config.name)} add constraint ${sql.identifier(one.name)} check (${sql.raw(declaredText(one.name, one.value))})`,
        );
      }
    }

    const rendered = await tx.execute<{
      table_name: string;
      constraint_name: string;
      definition: string;
    }>(sql`
      select rel.relname as table_name,
             con.conname as constraint_name,
             pg_get_constraintdef(con.oid, true) as definition
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      where con.contype = 'c' and rel.relnamespace = pg_my_temp_schema()
    `);
    for (const row of rendered.rows) {
      const table = byTable[row.table_name];
      if (table !== undefined) table[row.constraint_name] = row.definition;
    }
    return byTable;
  });
}

/** CHECK-ограничения, которые после наката миграций реально стоят в базе. */
async function checksInDatabase(): Promise<ChecksByTable> {
  const tables = await db.execute<{ table_name: string }>(
    sql`select tablename as table_name from pg_tables where schemaname = 'public'`,
  );
  const byTable: ChecksByTable = {};
  for (const row of tables.rows) byTable[row.table_name] = {};

  const constraints = await db.execute<{
    table_name: string;
    constraint_name: string;
    definition: string;
  }>(sql`
    select rel.relname as table_name,
           con.conname as constraint_name,
           pg_get_constraintdef(con.oid, true) as definition
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where con.contype = 'c' and nsp.nspname = 'public'
  `);
  for (const row of constraints.rows) {
    const table = byTable[row.table_name];
    if (table !== undefined) table[row.constraint_name] = row.definition;
  }
  return byTable;
}

test("CHECK-ограничения в schema.ts и в базе после миграций — одни и те же", async () => {
  const inDatabase = await checksInDatabase();

  expect(inDatabase).toStrictEqual(await declaredChecks());
});
