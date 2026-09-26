#!/usr/bin/env node
// Накат миграций: `npm run db:migrate` на машине разработчика и одноразовый сервис
// `migrate` в прод-compose (`deploy/`). Один путь на оба места, и это не экономия:
// до этого прод катил бы миграции иначе, чем разработка, и расхождение жило бы
// ровно там, где его никто не гоняет каждый день.
//
// Почему не `drizzle-kit migrate`: он из devDependencies, а в образе миграций стоят
// только рабочие зависимости. Мигратор `drizzle-orm` — тот же самый код, которым
// drizzle-kit накатывает, с тем же журналом (`drizzle.__drizzle_migrations`), поэтому
// базы, накатанные раньше через drizzle-kit, он узнаёт и повторно ничего не применяет.
// Им же готовятся базы прогона тестов (`applyMigrations`).
//
// Код возврата — единственное, что читает compose: не ноль, и приложение не стартует
// (`depends_on: condition: service_completed_successfully`). Инцидент 25.09 — стенд
// поднялся на базе без свежих миграций и отказывал на каждом запросе — повториться так
// не может: без успешного наката приложения просто нет.
import { Pool } from "pg";

import { applyMigrations } from "../src/blocks/data/migrator.ts";

try {
  process.loadEnvFile();
} catch {
  // .env может не быть: в контейнере окружение приходит от compose.
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Нет DATABASE_URL: скопируйте .env.example в .env");
  process.exit(1);
}

const pool = new Pool({ connectionString });
try {
  await applyMigrations(pool);
  console.log("Миграции накатаны");
} catch (error) {
  console.error("Миграции не накатились:", error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
