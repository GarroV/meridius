#!/usr/bin/env node
// Шаблоны из чек-листов одной пиццерии пачкой (D174).
//
// Шаблоны появились позже чек-листов: всё, что отлажено в пилоте, живёт чек-листами
// станций, а раздел «Шаблоны» пуст. Скрипт делает из каждого опубликованного чек-листа
// пиццерии шаблон без станции и страны — тем же ядром, что кнопка «Сделать шаблоном» в
// редакторе (`src/blocks/editor/make-template.ts`), а не своим SQL.
//
// По умолчанию только показывает план и ничего не меняет. Менять — с `--apply`.
// Прогон повторяем: чек-лист, из которого шаблон уже сделан, становится его копией и
// во второй раз в план не попадает.
//
// Запуск:  node scripts/templates-from-store.mjs "<пиццерия>" [--apply]
//          пиццерия — точное название (без учёта регистра) или её id.
import { register } from "node:module";

register("./src-resolve-hook.mjs", import.meta.url);

try {
  process.loadEnvFile();
} catch {
  // .env может не быть — тогда работают переменные окружения снаружи.
}

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const storeArg = args.find((arg) => !arg.startsWith("--"));

if (!storeArg) {
  console.error("Укажите пиццерию — название или id:");
  console.error(
    '  node scripts/templates-from-store.mjs "Demoland, Pilot" [--apply]',
  );
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("Нет DATABASE_URL: скопируйте .env.example в .env");
  process.exit(1);
}

const { getDb, stores } = await import("../src/blocks/data/index.ts");
const { listTemplateCandidates, makeTemplateFromChecklist, MakeTemplateError } =
  await import("../src/blocks/editor/make-template.ts");

function titleOf(title) {
  return title.ru ?? title.en ?? Object.values(title)[0] ?? "(без названия)";
}

const allStores = await getDb()
  .select({ id: stores.id, name: stores.name })
  .from(stores);
const wanted = storeArg.toLowerCase();
const matched = allStores.filter(
  (store) => store.id === storeArg || store.name.toLowerCase() === wanted,
);

if (matched.length !== 1) {
  console.error(
    matched.length === 0
      ? `Пиццерии «${storeArg}» нет. Есть:`
      : `Название «${storeArg}» неоднозначно — укажите id:`,
  );
  const list = matched.length === 0 ? allStores : matched;
  for (const store of list) console.error(`  ${store.id}  ${store.name}`);
  process.exit(1);
}

const store = matched[0];
const candidates = await listTemplateCandidates(store.id);

console.log(`Пиццерия: ${store.name}`);
if (candidates.length === 0) {
  console.log("Делать нечего: опубликованных чек-листов без шаблона нет.");
} else {
  console.log(`${apply ? "Делаю" : "Сделаю"} шаблоны из ${candidates.length}:`);
}

let made = 0;
let refused = 0;
for (const candidate of candidates) {
  const line = `  ${candidate.stationName} → «${titleOf(candidate.title)}»`;
  if (!apply) {
    console.log(line);
    continue;
  }
  try {
    const templateId = await makeTemplateFromChecklist(candidate.checklistId);
    made += 1;
    console.log(`${line}  шаблон ${templateId}`);
  } catch (error) {
    if (!(error instanceof MakeTemplateError)) throw error;
    refused += 1;
    console.log(`${line}  ОТКАЗ: ${error.reason}`);
  }
}

if (!apply && candidates.length > 0) {
  console.log("\nЭто план. Чтобы сделать — повторите с --apply.");
}
if (apply) console.log(`\nСделано: ${made}, отказов: ${refused}.`);

process.exit(refused > 0 ? 1 : 0);
