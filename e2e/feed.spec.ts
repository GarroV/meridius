// Сквозной сценарий ленты заполнений: управляющий открывает ленту, сужает её фильтрами,
// открывает карточку и видит, что и когда заполнено.
//
// Главная проверка здесь — последняя: правка и публикация НОВОЙ версии чек-листа не
// меняют уже сохранённую карточку (принцип 3, D002). Это правило продукта, а не деталь
// реализации: если оно сломается, история перепишется задним числом и никто этого
// не заметит — сохранённое заполнение просто начнёт показывать другие пункты.
import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { Pool } from "pg";

import { E2E_ADMIN_PASSWORD } from "./admin-credentials";
import { e2eDatabaseUrl } from "./database";

const FEED_PATH = "/admin/feed";
// Телефон: на этой ширине боковое меню кабинета съедает 208 px, и всё, что не умеет
// сужаться, раздвигает не себя, а всю страницу.
const PHONE = { width: 375, height: 800 };

/** Пункты первой версии — те, которые сотрудник и видел. */
const V1_SECTIONS = [
  {
    id: "section-oven",
    title: { ru: "Печь и оборудование", en: "Oven" },
    source: "own",
    items: [
      {
        id: "item-oven",
        title: { ru: "Включить печь и вытяжку", en: "Turn on the oven" },
        type: "bool",
        critical: false,
      },
    ],
  },
  {
    id: "section-fridge",
    title: { ru: "Холодильники", en: "Fridges" },
    source: { blockId: "block-fridge" },
    items: [
      {
        id: "item-temp",
        title: {
          ru: "Температура холодильной камеры",
          en: "Fridge temperature",
        },
        type: "number",
        critical: true,
        min: 2,
        max: 4,
        hint: { ru: "+2…+4 °C", en: "+2…+4 °C" },
      },
      {
        id: "item-clean",
        title: { ru: "Убрать просроченные заготовки", en: "Remove leftovers" },
        type: "bool",
        critical: false,
      },
    ],
  },
];

/** Пункты второй версии: другие идентификаторы и другие заголовки — совпадений нет. */
const V2_SECTIONS = [
  {
    id: "section-new",
    title: { ru: "Переписанная секция", en: "Rewritten section" },
    source: "own",
    items: [
      {
        id: "item-new",
        title: { ru: "Пункт из новой версии", en: "Item from the new version" },
        type: "bool",
        critical: false,
      },
    ],
  },
];

interface Seeded {
  readonly label: string;
  readonly storeName: string;
  readonly kitchenName: string;
  readonly cashName: string;
  /** Станция, на которой ещё ни разу не заполняли: на ней проверяется пустое состояние. */
  readonly idleName: string;
  readonly checklistId: string;
  readonly versionId: string;
  readonly failedSubmissionId: string;
  readonly cleanSubmissionId: string;
}

function answer(itemId: string, value: unknown, comment?: string) {
  const at = Date.now();
  return comment === undefined
    ? { itemId, value, at }
    : { itemId, value, at, comment };
}

/**
 * Данные сценария кладутся прямо в базу, а не заводятся через экраны справочника и
 * редактора: сценарий проверяет ленту, и падение в чужом блоке искали бы не там.
 * Названия уникальны на прогон — файлы сценариев идут параллельно.
 */
async function seed(): Promise<Seeded> {
  const label = randomUUID().slice(0, 8);
  const pool = new Pool({ connectionString: e2eDatabaseUrl() });

  try {
    const country = await pool.query<{ id: string }>(
      "insert into countries (name, locale) values ($1, 'ru') returning id",
      [`Страна ${label}`],
    );
    const store = await pool.query<{ id: string }>(
      "insert into stores (country_id, name, timezone) values ($1, $2, 'UTC') returning id",
      [country.rows[0]?.id, `Пиццерия ${label}`],
    );
    const storeId = store.rows[0]?.id;

    const kitchen = await pool.query<{ id: string }>(
      "insert into stations (store_id, name, code) values ($1, $2, $3) returning id",
      [storeId, `Кухня ${label}`, `f${label}k`],
    );
    const cash = await pool.query<{ id: string }>(
      "insert into stations (store_id, name, code) values ($1, $2, $3) returning id",
      [storeId, `Касса ${label}`, `f${label}c`],
    );
    await pool.query(
      "insert into stations (store_id, name, code) values ($1, $2, $3)",
      [storeId, `Склад ${label}`, `f${label}s`],
    );
    const kitchenId = kitchen.rows[0]?.id;
    const cashId = cash.rows[0]?.id;

    const checklist = await pool.query<{ id: string }>(
      `insert into checklists (station_id, title, window_start, window_end)
       values ($1, $2, '00:00', '23:59') returning id`,
      [
        kitchenId,
        JSON.stringify({
          ru: `Открытие кухни ${label}`,
          en: `Kitchen opening ${label}`,
        }),
      ],
    );
    const checklistId = checklist.rows[0]?.id ?? "";

    const version = await pool.query<{ id: string }>(
      `insert into checklist_versions
         (checklist_id, version_number, status, station_id, sections, published_at)
       values ($1, 1, 'published', $2, $3, now()) returning id`,
      [checklistId, kitchenId, JSON.stringify(V1_SECTIONS)],
    );
    const versionId = version.rows[0]?.id ?? "";

    // Заполнение с проваленным критичным пунктом и комментарием — то, ради чего
    // управляющий и открывает ленту.
    const failed = await pool.query<{ id: string }>(
      `insert into submissions (version_id, station_id, snapshot, answers, started_at)
       values ($1, $2, $3, $4, now() - interval '204 seconds') returning id`,
      [
        versionId,
        kitchenId,
        JSON.stringify(V1_SECTIONS),
        JSON.stringify([
          answer("item-oven", true),
          answer("item-temp", 9, "Порвано уплотнение двери, вызвал техника"),
          answer("item-clean", true),
        ]),
      ],
    );

    const clean = await pool.query<{ id: string }>(
      `insert into submissions (version_id, station_id, snapshot, answers, started_at)
       values ($1, $2, $3, $4, now() - interval '72 seconds') returning id`,
      [
        versionId,
        kitchenId,
        JSON.stringify(V1_SECTIONS),
        JSON.stringify([
          answer("item-oven", true),
          answer("item-temp", 3),
          answer("item-clean", true),
        ]),
      ],
    );

    // Заполнение соседней станции ТОЙ ЖЕ пиццерии: на нём проверяется, что фильтр
    // действительно сужает. Критичный пункт здесь провален намеренно — у соседки
    // обязана быть СВОЯ тревога, иначе на полосе фильтр станции неотличим от фильтра
    // пиццерии и потеря станции по дороге проходит незамеченной (T126).
    const cashChecklist = await pool.query<{ id: string }>(
      `insert into checklists (station_id, title, window_start, window_end)
       values ($1, $2, '00:00', '23:59') returning id`,
      [
        cashId,
        JSON.stringify({ ru: `Открытие кассы ${label}`, en: `Cash ${label}` }),
      ],
    );
    const cashVersion = await pool.query<{ id: string }>(
      `insert into checklist_versions
         (checklist_id, version_number, status, station_id, sections, published_at)
       values ($1, 1, 'published', $2, $3, now()) returning id`,
      [cashChecklist.rows[0]?.id, cashId, JSON.stringify([V1_SECTIONS[1]])],
    );
    await pool.query(
      `insert into submissions (version_id, station_id, snapshot, answers, started_at)
       values ($1, $2, $3, $4, now() - interval '48 seconds')`,
      [
        cashVersion.rows[0]?.id,
        cashId,
        JSON.stringify([V1_SECTIONS[1]]),
        JSON.stringify([
          answer(
            "item-temp",
            11,
            "Касса: холодильник напитков не держит холод",
          ),
          answer("item-clean", true),
        ]),
      ],
    );

    const failedId = failed.rows[0]?.id;
    const cleanId = clean.rows[0]?.id;
    if (failedId === undefined || cleanId === undefined) {
      throw new Error("Заполнения для сценария не завелись");
    }

    return {
      label,
      storeName: `Пиццерия ${label}`,
      kitchenName: `Кухня ${label}`,
      cashName: `Касса ${label}`,
      idleName: `Склад ${label}`,
      checklistId,
      versionId,
      failedSubmissionId: failedId,
      cleanSubmissionId: cleanId,
    };
  } finally {
    await pool.end();
  }
}

/**
 * Правка САМОЙ версии, по которой заполняли. Через продукт так сделать нельзя —
 * опубликованные версии неизменяемы, — и именно поэтому проверка нужна: снимок в
 * заполнении и есть вторая опора D002. Без этого шага сценарий проверял бы только
 * неизменяемость версий и молча проходил бы даже там, где карточка читает пункты из
 * версии, а снимок хранится впустую (проверено порчей: сценарий был зелёным).
 */
async function rewriteVersionInPlace(seeded: Seeded): Promise<void> {
  const pool = new Pool({ connectionString: e2eDatabaseUrl() });
  try {
    await pool.query(
      "update checklist_versions set sections = $2 where id = $1",
      [seeded.versionId, JSON.stringify(V2_SECTIONS)],
    );
  } finally {
    await pool.end();
  }
}

/** Публикация следующей версии — ровно то, что делает редактор: вставка новой строки. */
async function publishSecondVersion(seeded: Seeded): Promise<void> {
  const pool = new Pool({ connectionString: e2eDatabaseUrl() });
  try {
    await pool.query(
      "update checklist_versions set status = 'archived' where id = $1",
      [seeded.versionId],
    );
    await pool.query(
      `insert into checklist_versions
         (checklist_id, version_number, status, station_id, sections, published_at)
       values ($1, 2, 'published',
               (select station_id from checklist_versions where id = $2),
               $3, now())`,
      [seeded.checklistId, seeded.versionId, JSON.stringify(V2_SECTIONS)],
    );
  } finally {
    await pool.end();
  }
}

/** Списков в карточке фильтров четыре: страна, пиццерия, станция, период. */
const FILTER_SELECT_COUNT = 4;

/**
 * Выбор в фильтре. Список сам отправляет форму (кнопки «Показать» на эталоне нет),
 * поэтому после выбора надо дождаться перехода: иначе следующий шаг сценария
 * работает со старой страницей и «не находит» уже изменившиеся варианты.
 *
 * Возвращается, только когда переход ДОЕХАЛ, — а не когда сменился адрес (T106).
 *
 * Разница между этими двумя моментами и есть целая гонка. Смена адреса наступает при
 * commit нового документа: разметку страницы сервер уже отдал, а её скрипты ещё едут.
 * Список в этом окне выглядит совершенно рабочим — он в DOM, у него правильные
 * варианты, он принимает выбор, — и НЕ ДЕЛАЕТ НИЧЕГО: обработчик выбора появляется
 * только после гидратации, и до неё событие `change` уходит в пустоту. Следующий шаг
 * сценария после этого ждёт смены адреса, которой уже не будет никогда, и падает по
 * таймауту — «ожидание смены адреса после выбора фильтра».
 *
 * Замер зондом (11.09.2026) с искусственной задержкой раздачи скриптов на 3 с: первый
 * `pick` возвращался за 184 мс в состоянии `readyState=loading`, `stationInDom=true`,
 * `stationHydrated=false` — ровно в эту дыру, — и следующий `pick` падал по таймауту.
 * Без задержки окно закрывается за 1 мс: поэтому отдельный прогон был зелёным всегда,
 * а в общем (один сервер отвечает сотне сценариев из нескольких воркеров) окно
 * растягивается — отсюда «через раз». Тот же класс, что T086.
 *
 * Оба ожидания обязательны, и ни одно не заменяет второе:
 *  • смена адреса доказывает, что переход вообще начался. Без неё проверка «списки
 *    живые» прошла бы, не сходя со СТАРОЙ страницы: она-то давно живая;
 *  • `data-live` доказывает, что приехавшая страница жива. Без неё выбор на следующем
 *    шаге уходит в мёртвую разметку.
 *
 * Ожидание ничего не прячет: список, который не оживёт, уронит шаг по таймауту с
 * текстом ниже, а не пройдёт молча.
 */
async function pick(
  page: Page,
  label: string,
  option: { label: string } | string,
): Promise<void> {
  const before = page.url();
  await page.getByLabel(label).selectOption(option);
  await page.waitForFunction((url) => globalThis.location.href !== url, before);

  await expect(
    page.locator('[data-testid="feed-filters"] select[data-live="true"]'),
    "Фильтры приехавшей страницы так и не ожили: переход не доехал, и следующий " +
      "выбор ушёл бы в разметку без обработчика — молча и без перехода.",
  ).toHaveCount(FILTER_SELECT_COUNT);
}

async function signIn(page: Page): Promise<void> {
  await page.goto("/admin/login");
  await page.getByLabel("Пароль").fill(E2E_ADMIN_PASSWORD);
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("admin-home")).toBeVisible();
}

test.describe("лента заполнений", () => {
  // Эталон и тексты сценария русские, поэтому и браузер русский.
  test.use({ locale: "ru-RU" });

  test("лента показывает заполнения станции, а три показателя считаются по тем же строкам", async ({
    page,
  }) => {
    const seeded = await seed();
    await signIn(page);

    await page.goto(FEED_PATH);
    await expect(page.getByTestId("feed-screen")).toBeVisible();

    // Сужаем до своей станции: в базе прогона лежат данные и других сценариев.
    // Сначала пиццерия: пока она не выбрана, станции названы путём — «Кухня» есть
    // в каждой пиццерии сети, и выбирать пришлось бы вслепую.
    await pick(page, "Пиццерия", { label: seeded.storeName });
    await pick(page, "Станция", { label: seeded.kitchenName });
    await expect(page.getByTestId("submission-row")).toHaveCount(2);

    // Строка ищется по идентификатору, а не по порядку: у обоих заполнений время
    // отправки ставит база в одну и ту же миллисекунду, и «первая» строка — лотерея.
    await expect(
      page
        .locator(`[data-submission-id="${seeded.failedSubmissionId}"]`)
        .getByTestId("outcome-tag"),
    ).toHaveAttribute("data-kind", "criticalFailed");
    await expect(
      page
        .locator(`[data-submission-id="${seeded.cleanSubmissionId}"]`)
        .getByTestId("outcome-tag"),
    ).toHaveAttribute("data-kind", "ok");

    // Показатели обязаны совпадать с тем, что показано: это одна и та же выборка.
    await expect(page.getByTestId("metric-submissions")).toHaveText("2");
    await expect(page.getByTestId("metric-critical")).toHaveText("1");
    await expect(page.getByTestId("metric-duration")).not.toHaveText("—");
  });

  test("полоса тревог показывает проваленный критичный пункт и ведёт в карточку", async ({
    page,
  }) => {
    const seeded = await seed();
    await signIn(page);

    await page.goto(FEED_PATH);
    await expect(page.getByTestId("feed-screen")).toBeVisible();
    await pick(page, "Пиццерия", { label: seeded.storeName });
    await pick(page, "Станция", { label: seeded.kitchenName });

    // Тревога одна: критичный пункт провален в одном заполнении из двух. Окно
    // чек-листа сценария 00:00–23:59, то есть за сегодня оно ещё не закрылось —
    // тревоги о незаполненном чек-листе здесь быть не должно.
    const strip = page.getByTestId("alarm-strip");
    await expect(strip).toBeVisible();
    await expect(strip.getByTestId("alarm-row")).toHaveCount(1);
    await expect(strip.getByTestId("alarm-row")).toHaveAttribute(
      "data-kind",
      "criticalFailed",
    );
    await expect(strip).toContainText(seeded.kitchenName);

    // Из тревоги открывается та самая карточка, а не лента заново.
    await strip.getByTestId("alarm-open").click();
    await expect(page.getByTestId("submission-screen")).toBeVisible();
    await expect(page).toHaveURL(
      new RegExp(`/admin/feed/${seeded.failedSubmissionId}`),
    );
  });

  /**
   * Полоса тревог обязана сужаться выбранной станцией: период на неё не влияет (D053),
   * а страна, пиццерия и станция влияют.
   *
   * Проверка заведена по T126, и вот почему она выглядит именно так. Отрицательный
   * прогон T106 ломал `view.ts` — разобранный `stationId` выбрасывался, — и сценарий
   * полосы оставался ЗЕЛЁНЫМ: у пиццерии тревожила ровно одна станция, и потеря
   * фильтра ничего не меняла. Здесь тревожат две станции одной пиццерии, поэтому
   * потерянный фильтр станции виден сразу: на полосе появляется чужая станция.
   */
  test("полоса тревог сужается выбранной станцией, а не только пиццерией", async ({
    page,
  }) => {
    const seeded = await seed();
    await signIn(page);

    await page.goto(FEED_PATH);
    await expect(page.getByTestId("feed-screen")).toBeVisible();
    await pick(page, "Пиццерия", { label: seeded.storeName });

    // На пиццерии тревожат обе станции: кухня и касса.
    const strip = page.getByTestId("alarm-strip");
    await expect(strip.getByTestId("alarm-row")).toHaveCount(2);

    await pick(page, "Станция", { label: seeded.kitchenName });

    await expect(strip.getByTestId("alarm-row")).toHaveCount(1);
    await expect(strip).toContainText(seeded.kitchenName);
    await expect(
      strip,
      "На полосе осталась станция, которую фильтр не выбирал: фильтр станции " +
        "потерялся по дороге от экрана до запроса тревог.",
    ).not.toContainText(seeded.cashName);
  });

  test("фильтр по станции сужает ленту, а сброс возвращает всё", async ({
    page,
  }) => {
    const seeded = await seed();
    await signIn(page);

    await page.goto(FEED_PATH);
    await pick(page, "Пиццерия", { label: seeded.storeName });
    await expect(page.getByTestId("submission-row")).toHaveCount(3);

    await pick(page, "Станция", { label: seeded.cashName });
    await expect(page.getByTestId("submission-row")).toHaveCount(1);
    await expect(page.getByTestId("submission-row")).toContainText(
      seeded.cashName,
    );

    await page.getByTestId("feed-reset").click();
    await expect(page.getByTestId("feed-screen")).toBeVisible();
    await expect(page.getByLabel("Станция")).toHaveValue("");
  });

  test("на телефоне лента не уезжает вбок вместе с меню и фильтрами", async ({
    page,
  }) => {
    // Проверка не про красоту, а про то, что экраном вообще можно пользоваться:
    // уехавшая вбок страница утаскивает и боковое меню, и полосу фильтров, и тревоги.
    // Ловится это только настоящим браузером на настоящей ширине: разметка при этом
    // остаётся той же самой, разъезжается вычисленная ширина колонки каркаса.
    await seed();
    await signIn(page);

    await page.setViewportSize(PHONE);
    await page.goto(FEED_PATH);
    await expect(page.getByTestId("feed-metrics")).toBeVisible();

    const size = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(
      size.scrollWidth,
      "Страница шире окна телефона: что-то на ней не умеет сужаться и тащит вбок " +
        "весь кабинет, а не только себя.",
    ).toBe(size.clientWidth);

    // Действия верхней полосы переносятся на вторую строку, а не исчезают за краем.
    await expect(page.getByTestId("feed-report-link")).toBeVisible();
    // Фильтр остаётся рабочим и на узком поле.
    await expect(page.getByLabel("Станция")).toBeVisible();
  });

  test("станция без заполнений объясняет, что делать дальше, а не молчит", async ({
    page,
  }) => {
    const seeded = await seed();
    await signIn(page);

    await page.goto(FEED_PATH);
    await pick(page, "Пиццерия", { label: seeded.storeName });
    // Станция в справочнике есть, а заполняли на ней ни разу — это не «пустой период».
    await pick(page, "Станция", { label: seeded.idleName });

    const empty = page.getByTestId("feed-empty");
    await expect(empty).toBeVisible();
    await expect(empty).toHaveAttribute("data-kind", "never");
    // Совет ведёт в тот раздел, который и назван: печатать коды — значит идти в QR.
    // Адрес проверяется буквой намеренно — это внешний договор экрана. В самом блоке
    // такой строки быть не должно, за этим следит `feed/routes.test.ts` (T118).
    await expect(empty.getByRole("link")).toHaveAttribute("href", "/admin/qr");
    // Показатели не исчезают вместе с лентой: ноль заполнений — это тоже ответ.
    await expect(page.getByTestId("metric-submissions")).toHaveText("0");
  });

  test("карточка показывает ответ, время и комментарий по каждому пункту", async ({
    page,
  }) => {
    const seeded = await seed();
    await signIn(page);

    await page.goto(`${FEED_PATH}/${seeded.failedSubmissionId}`);
    await expect(page.getByTestId("submission-screen")).toBeVisible();

    const rows = page.getByTestId("answer-row");
    await expect(rows).toHaveCount(3);

    const temperature = rows.filter({
      hasText: "Температура холодильной камеры",
    });
    await expect(temperature).toHaveAttribute("data-failed", "true");
    await expect(temperature).toContainText("9");
    await expect(temperature).toContainText("критичный");
    await expect(page.getByTestId("answer-comment")).toContainText(
      "Порвано уплотнение двери",
    );

    // Секция из библиотеки помечена как библиотечная (D011).
    await expect(page.getByTestId("answer-section").nth(1)).toContainText(
      "блок библиотеки",
    );
    await expect(page.getByTestId("submission-facts")).toContainText("2 из 3");
  });

  test("правка и публикация новой версии чек-листа не меняют сохранённую карточку", async ({
    page,
  }) => {
    const seeded = await seed();
    await signIn(page);

    const cardUrl = `${FEED_PATH}/${seeded.failedSubmissionId}`;
    await page.goto(cardUrl);
    const before = await page.getByTestId("answer-row").allInnerTexts();
    expect(before).toHaveLength(3);

    await publishSecondVersion(seeded);

    await page.goto(cardUrl);
    const after = await page.getByTestId("answer-row").allInnerTexts();

    // Ровно то же, что видел сотрудник: ни новых пунктов, ни исчезнувших старых.
    expect(after).toStrictEqual(before);
    await expect(page.getByTestId("submission-screen")).toContainText(
      "Температура холодильной камеры",
    );
    await expect(page.getByTestId("submission-screen")).not.toContainText(
      "Пункт из новой версии",
    );
    // И карточка честно говорит, по какой версии заполняли.
    await expect(page.getByTestId("snapshot-notice")).toContainText("v1");

    // Вторая опора того же правила: даже переписанная строка версии не меняет
    // карточку — пункты сотрудник видел в снимке заполнения, а не в версии.
    await rewriteVersionInPlace(seeded);
    await page.goto(cardUrl);

    expect(await page.getByTestId("answer-row").allInnerTexts()).toStrictEqual(
      before,
    );
    await expect(page.getByTestId("submission-screen")).not.toContainText(
      "Пункт из новой версии",
    );
  });

  test("ссылка на несуществующее заполнение объясняет отказ и возвращает в ленту", async ({
    page,
  }) => {
    await signIn(page);

    await page.goto(`${FEED_PATH}/00000000-0000-4000-8000-000000000000`);
    await expect(page.getByTestId("submission-not-found")).toBeVisible();
  });
});
