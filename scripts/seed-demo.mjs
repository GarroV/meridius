#!/usr/bin/env node
// Заводит демонстрационный контур в базе из DATABASE_URL (T049).
//
// Прогон идемпотентен: второй запуск возвращает контур в то же состояние и не плодит
// дубликатов. Заполнения, сделанные на демо-станциях по ходу показа, снимаются вместе
// с прежним контуром — на то он и показательный.
//
// Запуск:  npm run seed:demo
import { register } from "node:module";

// Хук ставится ДО первого импорта из src/: без него Node не знает ни псевдонима `@/`,
// ни импортов без расширения, на которых написан весь код продукта.
register("./src-resolve-hook.mjs", import.meta.url);

try {
  process.loadEnvFile();
} catch {
  // .env может не быть — тогда работают переменные окружения снаружи.
}

if (!process.env.DATABASE_URL) {
  console.error("Нет DATABASE_URL: скопируйте .env.example в .env");
  process.exit(1);
}

const { seedDemo, describeSeedFailure } =
  await import("../src/blocks/demo/index.ts");
const { stationScanUrl } = await import("../src/blocks/qr/scan-url.ts");
// Порт — из общего источника, а не свой разбор process.env.PORT с числом-умолчанием
// (T200). Прежний разбор не знал про настройки копии: сид печатал ссылки станций на
// общий 3100, то есть на стенд соседа, и человек шёл сканировать чужой продукт.
const { appPort } = await import("../src/blocks/core/app-port.ts");

// Внешний адрес площадки остаётся сильнее умолчания: это законное переопределение
// (продукт за прокси), а не своё решение про порт.
const origin =
  process.env.PUBLIC_BASE_URL || `http://localhost:${String(appPort())}`;

try {
  const summary = await seedDemo();

  console.log("Демонстрационный контур готов.");
  console.log(`  снято строк прошлого контура: ${summary.removedRows}`);
  console.log(
    `  страна ${summary.country} · пиццерий ${summary.stores} · станций ${summary.stations}`,
  );
  console.log(
    `  блоков библиотеки ${summary.blocks} · чек-листов ${summary.checklists} · версий ${summary.versions} · заполнений ${summary.submissions}`,
  );
  console.log(
    "\nСсылки станций — то, что уходит внутрь напечатанного QR-кода:",
  );
  for (const item of summary.codes) {
    console.log(
      `  ${item.store} · ${item.station}\n    ${stationScanUrl(origin, item.code)}`,
    );
  }
} catch (error) {
  // Отказ печатается человеком читаемым текстом, а не трассой драйвера: сид запускают
  // перед показом, и `DrizzleQueryError` с `ri_triggers.c` не говорит запускающему
  // ни что помешало, ни что с этим делать (T173).
  console.error(describeSeedFailure(error));
  process.exitCode = 1;
} finally {
  // Пул слоя доступа живёт на globalThis (см. src/blocks/data/client.ts): без его
  // закрытия сценарий висит на открытом соединении вместо того, чтобы завершиться.
  // Имя обязано совпадать с тем, которое заводит слой доступа: после переименования
  // продукта здесь оставалось прежнее `dodoQrPool`, и строка не закрывала ничего.
  // Процесс при этом не зависал — он дожидался, пока драйвер сам закроет простаивающее
  // соединение по своему таймауту. Замер 10.09.2026: выход за 10 367 мс против 329 мс.
  await globalThis.meridiusPool?.end();
}
