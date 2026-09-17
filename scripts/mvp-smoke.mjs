#!/usr/bin/env node
// Сквозной смоук MVP на ПОДНЯТОМ продукте (T049…T051, а после переезда — T079).
//
// Проходит весь путь продукта настоящими действиями в браузере, а не запросами к базе:
// завёл страну и пиццерию → добавил станцию → создал чек-лист с критичным пунктом →
// опубликовал → напечатал лист QR → открыл ссылку станции на телефоне шириной 375 px →
// заполнил, провалив критичный пункт с комментарием → нашёл заполнение в ленте.
//
// Сценарий параметризован адресом, поэтому один и тот же прогон годится и для локальной
// площадки, и для площадки после раскатки.
//
//   node scripts/mvp-smoke.mjs --url http://localhost:3100 --password <пароль админки>
//                              [--out reports/mvp-smoke]
//
// Каждый шаг снимается в PNG: снимки — это то, что показывают человеку, а не пересказ.
//
// СМОУК УБИРАЕТ ЗА СОБОЙ САМ (T089). Он проходит продукт настоящими действиями, значит
// оставляет настоящие строки, а средствами самого продукта их не удалить: заполнения
// не удаляются вовсе (история неприкосновенна), а чек-лист с заполнениями продукт
// снимает с работы, а не стирает. Поэтому уборка идёт через слой доступа и требует
// базы: без DATABASE_URL смоук ОТКАЗЫВАЕТСЯ СТАРТОВАТЬ, а не заводит данные, которые
// потом некому убрать. Прежний ручной рецепт уборки соблюдался ровно до первого раза,
// когда о нём забыли, — и к 07.09.2026 в базе висело восемь лишних чек-листов.
//
// Уборка идёт трижды, и это не перестраховка:
//   на входе  — снять брошенное прошлыми прогонами (убитый Ctrl-C до `finally` не доходит);
//   в finally — снять своё, в том числе после падения посередине;
//   по сигналу — то же самое, когда прогон обрывают руками.
// После уборки перепись базы сверяется с описанием демо-контура: расхождение значит
// либо остаток прогона, либо потерянные демо-данные, и молчать о нём нельзя.
import { mkdirSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";

import { chromium } from "@playwright/test";

// Хук ставится ДО первого импорта из src/: Node не знает ни псевдонима `@/`,
// ни импортов без расширения, на которых написан весь код продукта.
register("./src-resolve-hook.mjs", import.meta.url);

try {
  process.loadEnvFile();
} catch {
  // .env может не быть — тогда работают переменные окружения снаружи.
}

const {
  blocksChanged,
  censusDifferences,
  contourCensus,
  countDetachedChecklists,
  readCensus,
  smokeNames,
  sweepSmokeRuns,
} = await import("../src/blocks/demo/index.ts");
// Умолчание адреса — общий источник порта (src/blocks/core/app-port.ts), а не свой
// литерал: иначе смоук без --url молча проверял бы соседа на общем порте.
const { appPort } = await import("../src/blocks/core/app-port.ts");

// Значение круглосуточного окна берётся из того же места, где его держит форма, а не
// литералом: поле окна уже уезжало с ключей (`any`) на пары времени («00:00|24:00»),
// и смоук молча остался на старом значении — падал на выборе окна, хотя продукт был цел.
const { WINDOW_PRESETS, windowFieldValue } =
  await import("../src/blocks/editor/window-field.ts");
const anyWindowPreset = WINDOW_PRESETS.find(
  (preset) => preset.labelKey === "windowAny",
);
if (!anyWindowPreset) {
  throw new Error(
    "в WINDOW_PRESETS нет круглосуточного окна: смоук обязан проходить в любой час, а выбрать такое окно нечем",
  );
}
const ANY_WINDOW_VALUE = windowFieldValue(anyWindowPreset.value);

const PHONE = { width: 375, height: 812 };
const DESKTOP = { width: 1440, height: 960 };
// Шаг ожидания: на localhost хватает 20 с, по внешнему адресу через туннель — нет.
const STEP_TIMEOUT = Number(argumentRaw("timeout") ?? 30_000);

/** Значение флага командной строки или undefined. */
function argumentRaw(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index !== -1 && index + 1 < process.argv.length
    ? process.argv[index + 1]
    : undefined;
}

/**
 * Осталась ли выбранной станция в редакторе.
 *
 * Значение читается с самого селектора: перерисовка после серверного действия
 * возвращает список заново, и потерянный выбор виден только так.
 */
async function stationBound(page, label, timeout = STEP_TIMEOUT) {
  const select = page.getByTestId("checklist-station");
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const selected = await select
      .locator("option:checked")
      .innerText()
      .catch(() => "");
    if (selected.trim() === label) return true;
    await page.waitForTimeout(300);
  }
  return false;
}

/** Дождаться, пока элементов станет не меньше `expected`. */
async function waitForCount(locator, expected, timeout = STEP_TIMEOUT) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if ((await locator.count()) >= expected) return;
    await locator.page().waitForTimeout(200);
  }
  throw new Error(
    `не дождался ${String(expected)} элементов: их ${String(await locator.count())}`,
  );
}

/**
 * Дождаться, пока у элемента появится нужное состояние.
 *
 * Проверка «прочитал атрибут сразу после касания» верна только на быстром localhost:
 * через туннель ответ приходит позже, и такой смоук падает на работающем продукте.
 */
async function hasState(locator, expected, timeout = STEP_TIMEOUT) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if ((await locator.getAttribute("data-state")) === expected) return true;
    await locator.page().waitForTimeout(200);
  }
  return false;
}

function argument(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  if (index !== -1 && index + 1 < process.argv.length)
    return process.argv[index + 1];
  if (fallback !== undefined) return fallback;
  throw new Error(`не задан обязательный параметр --${name}`);
}

const BASE_URL = argument(
  "url",
  `http://localhost:${String(appPort())}`,
).replace(/\/$/, "");
const PASSWORD = argument("password");
const OUT_DIR = path.resolve(argument("out", "reports/mvp-smoke"));

const label = Math.random().toString(36).slice(2, 7);
// Имена берутся у блока demo, а не сочиняются здесь: уборка ищет свои строки по той же
// метке. Разъедься эти два места — смоук заводил бы одно, а убирал другое, и остатки
// снова копились бы молча. Метку несёт и название чек-листа: он переживает свою станцию
// (`checklists.station_id` — `on delete set null`), и без метки отвязанный чек-лист было
// бы нечем отличить от чек-листа, который методист отвязал сам.
const {
  country: COUNTRY,
  store: STORE,
  station: STATION,
  checklist: CHECKLIST,
} = smokeNames(label);
const COMMENT = "Two sauce buckets are unlabelled, moved to the fridge.";
// Подпись будильника — на языке экрана: страна смоука заводится с локалью `en`.
const ALARM = "Take the dough out of the proofer";

let step = 0;
const done = [];

function say(text) {
  console.log(`  ${text}`);
}

/** Проверка, которая обязана падать: смоук без падений ничего не доказывает. */
function check(condition, what) {
  if (!condition) throw new Error(`ПРОВАЛ шага «${what}»`);
  say(`✓ ${what}`);
}

/**
 * Снимок экрана целиком или названного узла, когда показывают не экран, а деталь:
 * панель на 375 px занимает шестую часть кадра, и на общем снимке владелец не
 * различит ни надписей, ни пиктограмм — того самого, ради чего показ и делается.
 */
async function shot(page, name, target) {
  step += 1;
  const file = path.join(
    OUT_DIR,
    `${String(step).padStart(2, "0")}-${name}.png`,
  );
  await (target === undefined
    ? page.screenshot({ path: file, fullPage: true })
    : target.screenshot({ path: file }));
  done.push(file);
  say(`снимок: ${path.relative(process.cwd(), file)}`);
}

function heading(text) {
  console.log(`\n▸ ${text}`);
}

async function signIn(page) {
  await page.goto(`${BASE_URL}/admin/login`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByTestId("login-submit").click();
  await page.getByTestId("admin-home").waitFor({ timeout: STEP_TIMEOUT });
}

/** Значение параметра адреса у ссылки — так со страницы забирается опознаватель строки. */
async function idFromLink(locator, parameter) {
  const href = await locator.getAttribute("href");
  if (href === null) throw new Error("у ссылки нет адреса");
  const value = new URL(href, BASE_URL).searchParams.get(parameter);
  if (value === null)
    throw new Error(`в адресе ${href} нет параметра ${parameter}`);
  return value;
}

async function createCatalog(page) {
  heading("Справочник: страна → пиццерия → станция");

  await page.goto(`${BASE_URL}/admin/catalog?create=country`, {
    waitUntil: "domcontentloaded",
  });
  await page.locator('form input[name="name"]').fill(COUNTRY);
  await page.locator('form select[name="locale"]').selectOption("en");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  const country = page.getByTestId("country-item").filter({ hasText: COUNTRY });
  await country.waitFor({ timeout: STEP_TIMEOUT });
  const countryId = await idFromLink(country, "country");
  check(Boolean(countryId), `страна «${COUNTRY}» заведена`);

  await page.goto(
    `${BASE_URL}/admin/catalog?country=${countryId}&create=store`,
    {
      waitUntil: "domcontentloaded",
    },
  );
  await page.locator('form input[name="name"]').fill(STORE);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  const store = page.getByTestId("store-item").filter({ hasText: STORE });
  await store.waitFor({ timeout: STEP_TIMEOUT });
  const storeId = await idFromLink(store, "store");
  check(Boolean(storeId), `пиццерия «${STORE}» заведена`);

  await page.goto(
    `${BASE_URL}/admin/catalog?country=${countryId}&store=${storeId}&create=station`,
    { waitUntil: "domcontentloaded" },
  );
  await page.locator('form input[name="name"]').fill(STATION);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  const row = page.getByTestId("station-row").filter({ hasText: STATION });
  await row.waitFor({ timeout: STEP_TIMEOUT });

  // Код станции — то, что уедет внутрь напечатанного QR: читаем его с экрана,
  // а не из базы, иначе смоук проверял бы не то, что видит человек.
  const code = (await row.locator("td").nth(2).innerText()).trim();
  check(
    /^[\da-z]{10}$/.test(code),
    `станция «${STATION}» заведена, код ${code}`,
  );

  await shot(page, "catalog");
  return { countryId, storeId, code };
}

async function createChecklist(page, catalog) {
  heading("Редактор: чек-лист с критичным пунктом, публикация версии");

  await page.goto(`${BASE_URL}/admin/checklists/new`, {
    waitUntil: "domcontentloaded",
  });
  // Поле названия ищется опознавателем, а не «единственным текстовым полем формы»:
  // с T185 рядом стоят два поля времени, и «единственное» перестало быть единственным.
  await page.getByTestId("new-checklist-title").fill(CHECKLIST);
  // Круглосуточное окно: смоук обязан проходить в любой час, а не только утром.
  await page.locator("#new-checklist-window").selectOption(ANY_WINDOW_VALUE);
  await page.getByTestId("create-checklist").click();
  await page.getByTestId("editor-screen").waitFor({ timeout: STEP_TIMEOUT });

  await page
    .getByTestId("checklist-station")
    .selectOption({ label: `${COUNTRY} · ${STORE} · ${STATION}` });
  // Выбор станции уходит на сервер и перерисовывает редактор. Пока перерисовка идёт,
  // клавиатурный ввод уезжает в элемент, который сейчас будет заменён, — на localhost
  // это успевало, по внешнему адресу пункты переставали создаваться вовсе.
  await page.waitForLoadState("networkidle");
  // Привязка станции уходит в черновик серверным действием. Проверяем, что она там
  // осталась: публикация читает черновик, и потерянная привязка даёт станцию без
  // чек-листа — заполнение по её QR открыть уже нельзя.
  const stationLabel = `${COUNTRY} · ${STORE} · ${STATION}`;
  const bound = await stationBound(page, stationLabel);
  check(bound, `чек-лист привязан к станции «${STATION}»`);

  const items = page.getByTestId("item-title");
  await items.first().click();
  await page.keyboard.type("Turn on the oven and the hood");
  await items.first().waitFor({ state: "visible", timeout: STEP_TIMEOUT });
  // После Enter ЖДЁМ появления следующего пункта: по внешнему адресу ответ идёт через
  // туннель, и следующая строка текста уезжала в пункт, которого ещё нет.
  await page.keyboard.press("Enter");
  await waitForCount(items, 2);
  await page.keyboard.type("Fryer temperature");
  await page.keyboard.press("Enter");
  await waitForCount(items, 3);
  await page.keyboard.type("Check labels on the sauces");

  await page.getByTestId("item-type").nth(1).selectOption("number");
  await page.getByTestId("item-min").first().fill("160");
  await page.getByTestId("item-max").first().fill("180");
  // Уровень пункта, а не флажок «критичный»: с появлением режимов смены (D055/D056)
  // редактор переключает три уровня переключателем `item-severity-<уровень>`, а
  // прежнего `item-critical` в разметке нет вовсе. Смоук на него всё ещё нажимал и
  // потому падал в редакторе — то есть сквозной сценарий не проходил с 07.09.2026,
  // и заметно это стало только когда смоук снова прогнали целиком.
  await page.getByTestId("item-severity-critical").nth(2).click();
  check(
    (await page
      .getByTestId("editor-item")
      .nth(2)
      .getAttribute("data-severity")) === "critical",
    "третий пункт помечен критичным",
  );

  await page.getByTestId("save-draft").click();
  await page
    .getByTestId("editor-meta")
    .filter({ hasText: "Draft saved" })
    .waitFor({
      timeout: STEP_TIMEOUT,
    });
  await shot(page, "editor");

  await page.getByTestId("publish").click();
  await page.getByTestId("editor-published").waitFor({ timeout: STEP_TIMEOUT });
  const published = await page.getByTestId("editor-published").innerText();
  check(published.includes("1"), `версия опубликована: «${published.trim()}»`);

  return catalog;
}

async function printQr(page, storeId) {
  heading("Печать: лист QR-кодов станций");

  await page.goto(`${BASE_URL}/admin/qr?store=${storeId}`, {
    waitUntil: "domcontentloaded",
  });
  await page.getByTestId("qr-sheet").waitFor({ timeout: STEP_TIMEOUT });
  const stickers = await page.getByTestId("qr-sticker").count();
  check(stickers >= 1, `лист печати собран, наклеек на нём ${stickers}`);
  check(
    (await page.getByTestId("qr-sticker").first().locator("svg").count()) === 1,
    "на наклейке нарисован сам код",
  );
  await shot(page, "qr-sheet");
}

async function fillFromPhone(browser, code) {
  heading("Телефон 375 px: заполнение по ссылке станции");

  const context = await browser.newContext({
    viewport: PHONE,
    hasTouch: true,
    isMobile: true,
    locale: "en-GB",
  });
  const page = await context.newPage();
  try {
    await page.goto(`${BASE_URL}/s/${code}`, { waitUntil: "domcontentloaded" });
    await page.getByTestId("fill-screen").waitFor({ timeout: STEP_TIMEOUT });
    check(
      await page.getByText(CHECKLIST).isVisible(),
      `ссылка станции открыла чек-лист «${CHECKLIST}»`,
    );

    // Ждём, пока экран оживёт: до гидратации касание по пункту ничего не меняет —
    // человек на кухне это увидит и тапнет снова, а смоук молча уезжал дальше
    // и упирался в неактивную кнопку отправки с «2 items left».
    await page.waitForLoadState("networkidle");

    const bools = page.locator('[data-testid="fill-item"][data-state]');
    const oven = bools.nth(0);
    await oven.tap();
    check(await hasState(oven, "yes"), "первый пункт отмечен выполненным");
    await page.getByTestId("fill-number").fill("172");

    // Критичный пункт проваливается вторым касанием: «да» → «нет».
    const critical = bools.nth(2);
    await critical.tap();
    await critical.tap();
    // Состояние ЖДЁМ, а не читаем сразу: по внешнему адресу ответ идёт через туннель,
    // и мгновенное чтение атрибута ловит предыдущее состояние — смоук падал на этом
    // шаге на живой площадке, хотя продукт работал.
    check(
      await hasState(critical, "no"),
      "критичный пункт отмечен как не выполненный",
    );

    const comment = page.getByTestId("fill-comment");
    await comment.waitFor({ timeout: STEP_TIMEOUT });
    check(
      await page.getByTestId("fill-submit").isDisabled(),
      "без объяснения провала отправка не даётся",
    );
    await comment.fill(COMMENT);

    // Будильник (D070) живёт на этом же экране, и смоук заводит его по-настоящему:
    // панель отказывает по времени, окну и частоте, и такой отказ обязан находить
    // смоук, а не станция. Время считается в UTC — страна заводится часовым поясом
    // по умолчанию (`UTC`), а окно чек-листа круглосуточное, поэтому ближайшие
    // минуты всегда внутри прохода.
    const ring = new Date(Date.now() + 10 * 60 * 1000);
    const ringAt = `${String(ring.getUTCHours()).padStart(2, "0")}:${String(
      ring.getUTCMinutes(),
    ).padStart(2, "0")}`;
    await page.getByTestId("alarm-time").fill(ringAt);
    await page.getByTestId("alarm-label").fill(ALARM);
    await page.getByTestId("alarm-add").tap();
    const ringRow = page.getByText(ALARM, { exact: true });
    const appeared = await ringRow
      .waitFor({ timeout: STEP_TIMEOUT })
      .then(() => true)
      .catch(() => false);
    if (!appeared) {
      // Отказ панели показывается человеку и обязан дойти до отчёта дословно: без
      // него провал выглядит как «строка не появилась», и причину ищут заново.
      const notice = page.getByTestId("alarm-notice");
      const why =
        (await notice.count()) > 0 ? await notice.innerText() : "молча";
      throw new Error(`будильник на ${ringAt} не завёлся: ${why}`);
    }
    check(true, `будильник на ${ringAt} заведён`);
    await shot(page, "fill-alarms", page.getByTestId("alarms-panel"));

    // Горизонтальной прокрутки на телефоне быть не должно — это требование экрана.
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    check(overflow <= 0, "горизонтальной прокрутки на 375 px нет");
    await shot(page, "fill-375px");

    await page.getByTestId("fill-submit").tap();
    await page.getByTestId("fill-sent").waitFor({ timeout: STEP_TIMEOUT });
    check(true, "заполнение отправлено");
    await shot(page, "fill-sent");
  } finally {
    await context.close();
  }
}

async function findInFeed(page) {
  heading("Лента: заполнение видно управляющему");

  await page.goto(`${BASE_URL}/admin/feed`, { waitUntil: "domcontentloaded" });
  const row = page.getByTestId("submission-row").filter({ hasText: STATION });
  await row.first().waitFor({ timeout: STEP_TIMEOUT });
  check((await row.count()) === 1, `в ленте одна строка станции «${STATION}»`);
  await shot(page, "feed");

  await row.first().getByRole("link").first().click();
  await page
    .getByTestId("submission-screen")
    .waitFor({ timeout: STEP_TIMEOUT });
  const card = await page.locator("body").innerText();
  check(
    card.includes(COMMENT),
    "карточка показывает комментарий к проваленному пункту",
  );
  check(
    card.includes("Check labels on the sauces"),
    "карточка показывает пункты снимка",
  );
  await shot(page, "submission");
}

/** Снять данные прогонов смоука и рассказать, сколько сняли. */
async function sweep(what) {
  const swept = await sweepSmokeRuns();
  if (swept.total === 0) {
    say(`${what}: снимать нечего`);
    return swept;
  }
  say(
    `${what}: снято строк ${swept.total} — стран ${swept.countries}, пиццерий ${swept.stores}, ` +
      `станций ${swept.stations}, чек-листов ${swept.checklists}, версий ${swept.versions}, ` +
      `заполнений ${swept.submissions}, режимов смены ${swept.shiftModes}`,
  );
  return swept;
}

/**
 * Сверка переписи базы с описанием демо-контура. Возвращает текст расхождения или
 * `undefined`. Число отвязанных чек-листов печатается рядом: именно оно объясняет,
 * откуда взялись лишние чек-листы, — в демо-контуре их нет ни одного.
 */
async function contourMismatch() {
  const differences = censusDifferences(await readCensus(), contourCensus());
  if (differences.length === 0) return undefined;

  const detached = await countDetachedChecklists();
  return (
    `в базе не демонстрационный контур:\n    ${differences.join("\n    ")}\n` +
    `  чек-листов без станции: ${detached} (в контуре их нет ни одного)`
  );
}

mkdirSync(OUT_DIR, { recursive: true });
console.log(`Сквозной смоук MVP по адресу ${BASE_URL}`);
console.log(`Снимки: ${OUT_DIR}\n`);

if (!process.env.DATABASE_URL) {
  console.error(
    "Нет DATABASE_URL. Смоук заводит настоящие данные, и убрать их может только\n" +
      "через базу: продукт заполнения не удаляет вовсе (история неприкосновенна).\n" +
      "Без доступа к базе прогон не начинается — иначе он оставил бы за собой мусор,\n" +
      "который потом никто не найдёт. Запустите смоук там, где база видна, или\n" +
      "пробросьте её к себе (ssh -L) и задайте DATABASE_URL.",
  );
  process.exit(1);
}

heading("Уборка до прогона: остатки брошенных прогонов");
try {
  await sweep("остатки прошлых прогонов");
} catch (error) {
  console.error(
    `\nБаза недоступна, прогон не начат: ${error.message}\n` +
      "Смоук не заводит данные, которые потом некому убрать.",
  );
  await globalThis.meridiusPool?.end();
  process.exit(1);
}

// Блоки библиотеки в контур не входят (граница идёт по стране), поэтому с описанием они
// не сверяются, а сверяются сами с собой: сколько было на входе, столько обязано остаться
// на выходе. Иначе смоук не стартовал бы ни на одном стенде с настоящим пакетом (T206).
const blocksBefore = (await readCensus()).blocks;

const mismatchBefore = await contourMismatch();
if (mismatchBefore !== undefined) {
  console.error(
    `\nПРОГОН НЕ НАЧАТ: ${mismatchBefore}\n` +
      "  Смоук сверяет базу с контуром и до, и после себя: на неизвестном стенде\n" +
      "  проверка «после прогона в базе ровно демо-контур» ничего не значила бы.\n" +
      "  Приведите стенд к эталону: npm run seed:demo",
  );
  await globalThis.meridiusPool?.end();
  process.exit(1);
}
say("перепись сходится с демо-контуром");

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: DESKTOP,
  locale: "en-US",
});
const page = await context.newPage();

// Прогон, оборванный руками, до `finally` не доходит: `process.exit` внутри обработчика
// сигнала обрывает всё немедленно. Поэтому уборка вызывается прямо здесь.
let interrupted = false;
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    if (interrupted) return;
    interrupted = true;
    console.log(`\nПрогон оборван (${signal}) — убираю за собой.`);
    void (async () => {
      try {
        await sweep("данные оборванного прогона");
      } catch (error) {
        console.error(`уборка не удалась: ${error.message}`);
      } finally {
        await browser.close().catch(() => undefined);
        await globalThis.meridiusPool?.end();
        process.exit(130);
      }
    })();
  });
}

let failure;
try {
  await signIn(page);
  const catalog = await createCatalog(page);
  await createChecklist(page, catalog);
  await printQr(page, catalog.storeId);
  await fillFromPhone(browser, catalog.code);
  await findInFeed(page);
} catch (error) {
  failure = error;
  try {
    await shot(page, "failure");
  } catch {
    // Снимок мог не сняться (страница закрыта) — это не должно прятать саму ошибку.
  }
} finally {
  await context.close();
  await browser.close();
}

// Уборка идёт и после падения посередине: данные прогона существуют независимо от того,
// дошёл ли сценарий до конца, и незаконченный прогон оставляет их ровно так же.
heading("Уборка после прогона");
let cleanupFailure;
try {
  await sweep("данные этого прогона");
  const mismatchAfter = await contourMismatch();
  const blocksDrift = blocksChanged(blocksBefore, (await readCensus()).blocks);
  if (mismatchAfter !== undefined) cleanupFailure = mismatchAfter;
  else if (blocksDrift !== undefined) cleanupFailure = blocksDrift;
  else
    say("после прогона в базе ровно демо-контур, блоков библиотеки столько же");
} catch (error) {
  cleanupFailure = `уборка не удалась: ${error.message}`;
}

await globalThis.meridiusPool?.end();

if (failure !== undefined) {
  console.error(`\nСМОУК НЕ ПРОШЁЛ: ${failure.message}`);
  process.exitCode = 1;
}
if (cleanupFailure !== undefined) {
  console.error(`\nУБОРКА НЕ ЗАКРЫЛАСЬ: ${cleanupFailure}`);
  process.exitCode = 1;
}
if (failure === undefined && cleanupFailure === undefined) {
  console.log(`\nСКВОЗНОЙ СЦЕНАРИЙ MVP ПРОЙДЕН. Снимков: ${done.length}`);
}
