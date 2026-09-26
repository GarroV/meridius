#!/usr/bin/env node
// Откат последней применённой миграции на базе из DATABASE_URL.
// Накат делает `npm run db:migrate` (scripts/db-migrate.mjs), обратного хода у него нет — он здесь.
import { Pool } from "pg";

import { rollbackLastMigration } from "../src/blocks/data/migrator.ts";

try {
  process.loadEnvFile();
} catch {
  // .env может не быть — тогда работают переменные окружения снаружи.
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Нет DATABASE_URL: скопируйте .env.example в .env");
  process.exit(1);
}

const pool = new Pool({ connectionString });
try {
  const tag = await rollbackLastMigration(pool);
  console.log(tag ? `Откачена миграция ${tag}` : "Откатывать нечего");
} finally {
  await pool.end();
}
