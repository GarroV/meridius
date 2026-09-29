#!/usr/bin/env node
// Заводит партнёра: тенант, его страны и учётку входа в кабинет (D145).
//
//     node scripts/create-partner.mjs --tenant "Партнёр Казахстан" \
//       --country "Казахстан" [--country "Кыргызстан"] --login kz.manager
//     # затем ввести пароль и Ctrl-D (или подать его через pipe)
//
// Страны опознаются по названию и должны уже быть в справочнике. Повторный запуск с тем
// же --tenant добавляет страны и ещё одну учётку и ничего не снимает. Правила — в
// src/blocks/auth/provision.ts.
//
// Пароль читается из стандартного ввода, а не из аргумента: аргумент видно в истории
// оболочки и в списке процессов. Сам пароль никуда не сохраняется — в базе только хэш.
//
// Это инструмент оператора, а не ответ на вопрос «кто заводит партнёров в продукте»:
// тот вопрос открыт (docs/furca/blocks/auth.md, «Развилки»).
import { register } from "node:module";
import { stdin, stderr, stdout, argv, exit } from "node:process";
import { parseArgs } from "node:util";

register("./src-resolve-hook.mjs", import.meta.url);

try {
  process.loadEnvFile();
} catch {
  // .env может не быть — тогда работают переменные окружения снаружи.
}

let values;
try {
  ({ values } = parseArgs({
    args: argv.slice(2),
    options: {
      tenant: { type: "string" },
      country: { type: "string", multiple: true },
      login: { type: "string" },
    },
    strict: true,
  }));
} catch (error) {
  stderr.write(`${error.message}\n`);
  exit(2);
}
if (!values.tenant || !values.login || !values.country?.length) {
  stderr.write(
    "Нужны --tenant, --login и хотя бы один --country; пароль — на стандартный ввод.\n",
  );
  exit(2);
}
if (!process.env.DATABASE_URL) {
  stderr.write("Нет DATABASE_URL: скопируйте .env.example в .env\n");
  exit(1);
}

if (stdin.isTTY) stderr.write("Пароль учётки (ввод виден), затем Ctrl-D:\n");
const chunks = [];
for await (const chunk of stdin) chunks.push(chunk);
const password = Buffer.concat(chunks).toString("utf8").trim();

const { provisionPartner, MIN_PARTNER_PASSWORD_LENGTH } =
  await import("../src/blocks/auth/provision.ts");

const REASONS = {
  "tenant-name": "название тенанта пустое или длиннее 120 знаков",
  "hq-tenant": "это название тенанта УК — партнёра под ним завести нельзя",
  "no-countries": "не указано ни одной страны",
  "unknown-country": "страны нет в справочнике",
  "root-login": "логин admin занят учёткой УК из окружения",
  "login-shape":
    "логин — 3–64 знака: латиница, цифры, точка, дефис, подчёркивание",
  "login-taken": "такой логин уже есть",
  "short-password": `пароль короче ${MIN_PARTNER_PASSWORD_LENGTH} знаков`,
};

let code = 0;
try {
  const result = await provisionPartner({
    tenantName: values.tenant,
    countryNames: values.country,
    login: values.login,
    password,
  });
  if (result.ok) {
    stdout.write(
      `${result.tenantCreated ? "Заведён тенант" : "Дополнен тенант"} «${values.tenant.trim()}», учётка ${values.login.trim().toLowerCase()}.\n`,
    );
  } else {
    const detail = result.detail ? `: ${result.detail}` : "";
    stderr.write(`Отказ — ${REASONS[result.reason]}${detail}\n`);
    code = 1;
  }
} finally {
  await globalThis.meridiusPool?.end();
}
exit(code);
