#!/usr/bin/env node
// Заводит справочник сети — страны и пиццерии внутри них — из файла ВНЕ репозитория.
//
// Только справочник: станции, чек-листы и заполнения скрипт не создаёт и не трогает.
// Пиццерии ложатся в базу пустыми, привязка чек-листов — решение методиста, а не импорта.
//
// Показательный контур не затрагивается: строки Demoland и всё, чего нет в файле,
// остаются как были. Обратное тоже верно — сид `seed:demo` снимает только свои строки
// (`src/blocks/demo/seed.ts`), поэтому `npm run up` не стирает заведённую этим скриптом сеть.
//
// Прогон идемпотентен и опознаёт строки ПО ИМЕНИ: страну — по названию, пиццерию —
// по названию внутри её страны. Своего кода у страны и пиццерии в схеме нет (D-решения
// справочника), а придумывать его импортом значило бы завести второй опознаватель
// рядом с тем, что видит методист на экране.
//
// Лишнего скрипт не удаляет НИКОГДА: пиццерия, которой нет в файле, может быть заведена
// методистом руками, а за ней уже стоит история заполнений (принцип 3). Такие строки
// печатаются отдельной строкой отчёта — решение по ним принимает человек.
//
// Запуск:  node scripts/import-network.mjs <путь к network.json>
//
// Пути по умолчанию нет сознательно: репозиторий публичный (D037), а справочник точек
// сети — внутренние данные, поэтому снимок живёт вне репозитория (D134), рядом с пакетом
// чек-листов.
import { readFileSync } from "node:fs";
import { register } from "node:module";

register("./src-resolve-hook.mjs", import.meta.url);

try {
  process.loadEnvFile();
} catch {
  // .env может не быть — тогда работают переменные окружения снаружи.
}

const filePath = process.argv[2];
if (!filePath) {
  console.error("Укажите путь к снимку справочника вне репозитория:");
  console.error("  node scripts/import-network.mjs ~/…/network.json");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("Нет DATABASE_URL: скопируйте .env.example в .env");
  process.exit(1);
}

const {
  createCountry,
  createStore,
  listCountries,
  listStores,
  updateCountry,
  updateStore,
} = await import("../src/blocks/catalog/index.ts");

function readNetwork(path) {
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch (error) {
    console.error(`Не прочитать файл сети «${path}»: ${error.message}`);
    process.exit(1);
  }
  const doc = JSON.parse(raw);
  if (!Array.isArray(doc.countries) || doc.countries.length === 0) {
    console.error(`В файле «${path}» нет стран: импортировать нечего`);
    process.exit(1);
  }
  for (const country of doc.countries) {
    const ok =
      typeof country.name === "string" &&
      typeof country.locale === "string" &&
      typeof country.timezone === "string" &&
      Array.isArray(country.stores);
    if (!ok) {
      console.error(
        `Страна в файле описана не полностью (нужны name, locale, timezone, stores): ${JSON.stringify(country)}`,
      );
      process.exit(1);
    }
  }
  return doc;
}

const network = readNetwork(filePath);

try {
  const existingCountries = new Map(
    (await listCountries()).map((row) => [row.name, row]),
  );

  const summary = {
    countriesCreated: 0,
    countriesUpdated: 0,
    storesCreated: 0,
    storesUpdated: 0,
    unknown: [],
  };

  for (const country of network.countries) {
    const known = existingCountries.get(country.name);
    let countryId;
    if (known === undefined) {
      countryId = await createCountry({
        name: country.name,
        locale: country.locale,
      });
      summary.countriesCreated += 1;
    } else {
      countryId = known.id;
      if (known.locale !== country.locale) {
        await updateCountry(countryId, {
          name: country.name,
          locale: country.locale,
        });
        summary.countriesUpdated += 1;
      }
    }

    const existingStores = new Map(
      (await listStores(countryId)).map((row) => [row.name, row]),
    );
    for (const name of country.stores) {
      const store = existingStores.get(name);
      if (store === undefined) {
        await createStore({ countryId, name, timezone: country.timezone });
        summary.storesCreated += 1;
      } else if (store.timezone !== country.timezone) {
        await updateStore(store.id, { name, timezone: country.timezone });
        summary.storesUpdated += 1;
      }
    }

    const inFile = new Set(country.stores);
    for (const name of existingStores.keys()) {
      if (!inFile.has(name)) summary.unknown.push(`${country.name}: ${name}`);
    }
  }

  const storesInFile = network.countries.reduce(
    (total, country) => total + country.stores.length,
    0,
  );
  console.log(
    `Справочник сети заведён из «${filePath}» (снимок ${network.capturedAt}).`,
  );
  console.log(
    `  стран ${network.countries.length}: заведено ${summary.countriesCreated}, обновлено ${summary.countriesUpdated}`,
  );
  console.log(
    `  пиццерий ${storesInFile}: заведено ${summary.storesCreated}, обновлено ${summary.storesUpdated}`,
  );
  console.log("  станции и чек-листы не заводились — это решение методиста");
  if (summary.unknown.length > 0) {
    console.log(
      `\nВ базе есть пиццерии, которых нет в файле (${summary.unknown.length}) — не тронуты, решение по ним за человеком:`,
    );
    for (const line of summary.unknown) console.log(`  — ${line}`);
  }
} finally {
  await globalThis.meridiusPool?.end();
}
