// Настройка drizzle-kit: схема и миграции живут внутри блока data — единственного,
// кто ходит в базу. миграции пишутся руками (D089), `npm run db:migrate` их накатывает.
import { defineConfig } from "drizzle-kit";

try {
  // Node 24 читает .env сам; без файла работают переменные окружения снаружи.
  process.loadEnvFile();
} catch {
  // .env отсутствует — это нормально на площадке с внешними переменными.
}

// Умолчание — ровно то, что поднимает docker-compose.yml (и что записано в .env.example).
// Раньше здесь было исключение: без .env падал не только `db:migrate`, но и knip, который
// читает этот файл, — то есть весь `scripts/check` в свежем клоне (T063).
const DEFAULT_DATABASE_URL = "postgres://dodo:dodo@localhost:5433/meridius";

const configured = process.env["DATABASE_URL"];
const databaseUrl =
  configured === undefined || configured === ""
    ? DEFAULT_DATABASE_URL
    : configured;

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/blocks/data/schema.ts",
  out: "./src/blocks/data/migrations",
  dbCredentials: { url: databaseUrl },
  strict: true,
  verbose: true,
});
