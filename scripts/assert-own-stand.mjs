#!/usr/bin/env node
// Отказывает, если база из DATABASE_URL стоит на сервере другой копии репозитория (T101).
//
// Зовётся из `./scripts/up` перед миграциями и сидом — то есть перед первой записью в
// рабочую базу. Имя рабочей базы у всех копий одинаковое, а порт хоста по умолчанию тоже
// один, поэтому копия, чей контейнер не поднялся (порт уже занят соседом), продолжает
// работать по чужому серверу и не узнаёт об этом ниоткуда. Разбор — `src/blocks/core/stand.ts`.
//
// Запуск руками:  node scripts/assert-own-stand.mjs [адрес базы]
import { register } from "node:module";

import { Pool } from "pg";

// Хук ставится ДО первого импорта из src/: без него Node не знает псевдонима `@/`.
// Поэтому модуль продукта грузится ниже через `await import`, а не статически.
register("./src-resolve-hook.mjs", import.meta.url);

try {
  process.loadEnvFile();
} catch {
  // .env может не быть — тогда работают переменные окружения снаружи.
}

const { claimStand, foreignStandMessage, ownStand } =
  await import("../src/blocks/core/stand.ts");

const connectionString = process.argv[2] ?? process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Нет DATABASE_URL: скопируйте .env.example в .env");
  process.exit(1);
}

const url = new URL(connectionString);
// Метка лежит в служебной базе `postgres`: она одна на сервер, и её видят все базы стенда.
const admin = new URL(url.toString());
admin.pathname = "/postgres";

const own = ownStand();
const pool = new Pool({ connectionString: admin.toString() });

let check;
try {
  check = await claimStand(pool, own);
} catch (cause) {
  console.error(
    `База ${url.host} недоступна: ${cause instanceof Error ? cause.message : String(cause)}\n` +
      "Поднимите её: docker compose -p <имя-стенда> up -d db",
  );
  process.exit(1);
} finally {
  await pool.end();
}

if (check.kind === "foreign") {
  console.error(foreignStandMessage(check, { target: url.host, own }));
  process.exit(1);
}

console.log(
  check.claimed
    ? `Стенд ${url.host} помечен как свой (${own.copyId}).`
    : `Стенд ${url.host} свой (${own.copyId}).`,
);
