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
// Прогон идемпотентен. Страна опознаётся по названию. Пиццерия — по КОДУ ТОЧКИ внутри
// страны (#141): переименование на экране больше не превращает следующий прогон в дубль.
// Пиццерия, заведённая до кода, находится по названию и получает код из файла. Запись
// старого формата (просто строка названия) опознаётся по названию, как раньше. Правила
// сопоставления — `planStoreImport` (`src/blocks/catalog/network-plan.ts`), с тестами.
//
// Формат пиццерии в файле: строка названия или `{ "name", "city"?, "code"? }`. Поле,
// которого в записи нет, импорт не трогает: старый файл не стирает ни город, ни код.
// Файл с кодом правит и название: снимок — источник справочника сети, поэтому каждое
// переименование печатается в отчёте отдельной строкой.
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
  NetworkPlanError,
  createCountry,
  createStore,
  listCountries,
  listStores,
  planStoreImport,
  readNetworkStore,
  updateCountry,
  updateStore,
} = await import("../src/blocks/catalog/index.ts");
// Команда площадки: вошедшего нет, импорт заводит справочник всей сети (D145).
const { WHOLE_NETWORK } = await import("../src/blocks/auth/scope.ts");

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
  // Все пиццерии разбираются и сверяются ДО первой записи: файл с ошибкой в последней
  // стране не должен оставить базу заведённой наполовину.
  try {
    return {
      ...doc,
      countries: doc.countries.map((country) => ({
        ...country,
        stores: country.stores.map(readNetworkStore),
      })),
    };
  } catch (error) {
    if (!(error instanceof NetworkPlanError)) throw error;
    console.error(`Файл «${path}»: ${error.message}`);
    process.exit(1);
  }
}

const network = readNetwork(filePath);

try {
  const existingCountries = new Map(
    (await listCountries(WHOLE_NETWORK)).map((row) => [row.name, row]),
  );

  const summary = {
    countriesCreated: 0,
    countriesUpdated: 0,
    storesCreated: 0,
    storesUpdated: 0,
    storesUnchanged: 0,
    renamed: [],
    unknown: [],
  };

  // Сопоставление проверяется для всех стран до первой записи: повтор кода в файле
  // (NetworkPlanError) не должен остановить импорт на середине.
  for (const country of network.countries) {
    try {
      planStoreImport([], country.stores, country.timezone);
    } catch (error) {
      if (!(error instanceof NetworkPlanError)) throw error;
      console.error(`${country.name}: ${error.message}`);
      process.exit(1);
    }
  }

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

    const existingStores = await listStores(countryId);
    const plan = planStoreImport(
      existingStores,
      country.stores,
      country.timezone,
    );
    const byId = new Map(existingStores.map((row) => [row.id, row]));
    for (const store of plan.creates) {
      await createStore({ countryId, ...store });
      summary.storesCreated += 1;
    }
    for (const update of plan.updates) {
      const row = byId.get(update.id);
      await updateStore(update.id, {
        name: update.set.name ?? row.name,
        timezone: update.set.timezone ?? row.timezone,
        city: update.set.city,
        code: update.set.code,
      });
      summary.storesUpdated += 1;
      if (update.set.name !== undefined) {
        summary.renamed.push(
          `${country.name}: «${update.previousName}» → «${update.set.name}»`,
        );
      }
    }
    summary.storesUnchanged += plan.unchanged;
    for (const name of plan.unknown) {
      summary.unknown.push(`${country.name}: ${name}`);
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
    `  пиццерий ${storesInFile}: заведено ${summary.storesCreated}, обновлено ${summary.storesUpdated}, без изменений ${summary.storesUnchanged}`,
  );
  console.log("  станции и чек-листы не заводились — это решение методиста");
  if (summary.renamed.length > 0) {
    console.log(
      `\nПереименовано по файлу (${summary.renamed.length}) — опознаны по коду точки:`,
    );
    for (const line of summary.renamed) console.log(`  — ${line}`);
  }
  if (summary.unknown.length > 0) {
    console.log(
      `\nВ базе есть пиццерии, которых нет в файле (${summary.unknown.length}) — не тронуты, решение по ним за человеком:`,
    );
    for (const line of summary.unknown) console.log(`  — ${line}`);
  }
} finally {
  await globalThis.meridiusPool?.end();
}
