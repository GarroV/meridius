// Проверка доступности: axe-core внутри настоящих сценариев Playwright — на экране
// заполнения (публичный, телефон) и на экранах админки (рабочий стол, под входом).
//
// Правило прогона: нарушения не прячутся ни тегами, ни `disableRules`, ни `exclude`.
// Если axe находит нарушение — сценарий остаётся красным, а починка разметки не входит
// в эту задачу (решает блок-агент). Вторая проверка — `passes.length > 0` — нужна,
// чтобы пустой прогон (страница не догрузилась, селектор промахнулся) не выглядел как
// пройденная проверка.
import { randomUUID } from "node:crypto";

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { AxeResults } from "axe-core";
import { Pool } from "pg";

import type { Answer, Section } from "@/blocks/data";

import { E2E_ADMIN_PASSWORD } from "./admin-credentials";
import { e2eDatabaseUrl } from "./database";
import { seedFillStand } from "./fill-fixtures";

const PHONE_VIEWPORT = { width: 375, height: 812 } as const;
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const UNKNOWN_CODE = "неизвестный-код";

async function runAxe(page: Page): Promise<AxeResults> {
  return new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
}

/**
 * Обе проверки сразу: список нарушений читаемый (иначе по красному тесту нельзя
 * понять, что чинить), и axe действительно что-то проверил.
 */
function expectAccessible(results: AxeResults): void {
  expect(
    results.violations.map(
      (violation) =>
        `${violation.id}: ${violation.help} → ${violation.nodes
          .map((node) => node.target.join(" "))
          .join(", ")}`,
    ),
  ).toStrictEqual([]);
  expect(results.passes.length).toBeGreaterThan(0);
}

/**
 * Вход в админку. Возвращается, только когда клиентский переход на главную ДОЕХАЛ —
 * а не когда появилась её разметка.
 *
 * Почему разница есть (T086). Форма входа — серверное действие с `redirect`, то есть на
 * главную браузер уходит клиентским переходом, без загрузки документа. Разметку новой
 * страницы React показывает раньше, чем переставляет метаданные документа: `<title>`
 * прошлой страницы уже снят, `<title>` новой ещё не вставлен. Замер наблюдателем внутри
 * страницы (10.09.2026): `609ms title=0 home=1`, `622ms title=1 home=1` — окно в один
 * кадр, в котором главная в DOM уже есть, а `<title>` у документа нет вовсе.
 *
 * `getByTestId("admin-home").waitFor()` заканчивается ровно на первом из этих двух
 * кадров, поэтому постусловие «вошли и стоим на главной» держалось не всегда: документ
 * в этот момент наполовину прошлая страница, и что угодно, прочитанное из него, описывает
 * не ту страницу. В общем прогоне один сервер отвечает сотне сценариев из нескольких
 * воркеров, метаданные приезжают отдельным куском потока сильно позже разметки, окно
 * растягивается — и проверка доступности главной падала примерно через раз на
 * `document-title: Documents must have <title> element`. Отдельно она всегда проходила:
 * без нагрузки окно закрывается за 13 мс.
 *
 * Данные тут ни при чём, хотя со стороны выглядело именно так: главная админки
 * (`src/app/admin/page.tsx`) вообще ничего не читает из базы — это статичный список
 * разделов. Соседние сценарии не мешали, мешала неоконченная навигация.
 *
 * Ожидание не прячет нарушение: список нарушений axe остаётся нетронутым (ни
 * `disableRules`, ни `exclude`), а страница, у которой `<title>` не появится вовсе,
 * уронит этот шаг по таймауту с текстом ниже.
 */
async function signIn(page: Page): Promise<void> {
  await page.goto("/admin/login");
  await page.getByLabel("Пароль").fill(E2E_ADMIN_PASSWORD);
  await page.getByTestId("login-submit").click();
  await page.getByTestId("admin-home").waitFor();

  await expect
    .poll(
      () => page.evaluate(() => document.querySelectorAll("head title").length),
      {
        message:
          "После входа документ так и не получил <title>: клиентский переход на главную " +
          "не доехал, либо у страницы действительно нет заголовка.",
        timeout: 10_000,
      },
    )
    .toBe(1);
}

interface AdminSeed {
  readonly countryId: string;
  readonly storeId: string;
  readonly checklistId: string;
  readonly submissionId: string;
}

function firstId(rows: { id: string }[], what: string): string {
  const id = rows[0]?.id;
  if (id === undefined) throw new Error(`Строка не вставилась: ${what}`);
  return id;
}

function answer(
  itemId: string,
  value: string | number | boolean,
  comment?: string,
): Answer {
  const at = Date.now();
  return comment === undefined
    ? { itemId, value, at }
    : { itemId, value, at, comment };
}

/**
 * Страна → пиццерия → станция → чек-лист с черновиком и опубликованной версией →
 * заполнение. Один заход даёт непустые данные сразу для справочника, списка
 * чек-листов, редактора, листа QR-кодов, ленты и карточки заполнения.
 *
 * Данные заводятся прямо в базе, а не через экраны: сценарий проверяет доступность
 * разметки, а не чужие блоки, и общий приём уже принят в `qr.spec.ts`/`feed.spec.ts`.
 */
async function seedAdminScreens(label: string): Promise<AdminSeed> {
  const suffix = randomUUID().slice(0, 8);
  const sections: Section[] = [
    {
      id: "section-oven",
      title: { ru: "Печь и оборудование", en: "Oven and equipment" },
      source: "own",
      items: [
        {
          id: "item-oven",
          title: { ru: "Включить печь", en: "Turn on the oven" },
          type: "bool",
          critical: false,
        },
        {
          id: "item-temp",
          title: { ru: "Температура холодильника", en: "Fridge temperature" },
          type: "number",
          critical: true,
          min: 2,
          max: 4,
        },
      ],
    },
  ];

  const pool = new Pool({ connectionString: e2eDatabaseUrl() });
  try {
    const country = firstId(
      (
        await pool.query<{ id: string }>(
          "insert into countries (name, locale) values ($1, 'ru') returning id",
          [`Страна a11y ${label} ${suffix}`],
        )
      ).rows,
      "countries",
    );
    const store = firstId(
      (
        await pool.query<{ id: string }>(
          "insert into stores (country_id, name, timezone) values ($1, $2, 'UTC') returning id",
          [country, `Пиццерия a11y ${label} ${suffix}`],
        )
      ).rows,
      "stores",
    );
    const station = firstId(
      (
        await pool.query<{ id: string }>(
          "insert into stations (store_id, name, code) values ($1, $2, $3) returning id",
          [store, `Станция a11y ${label} ${suffix}`, `a11y${suffix}`],
        )
      ).rows,
      "stations",
    );
    const checklist = firstId(
      (
        await pool.query<{ id: string }>(
          `insert into checklists (station_id, title, window_start, window_end)
           values ($1, $2::jsonb, '00:00:00', '23:59:00') returning id`,
          [
            station,
            JSON.stringify({
              ru: `Открытие кухни a11y ${label}`,
              en: `Kitchen opening a11y ${label}`,
            }),
          ],
        )
      ).rows,
      "checklists",
    );

    // Черновик: без него редактор открылся бы на пустой разметке (он читает только его).
    await pool.query(
      `insert into checklist_versions (checklist_id, status, sections)
       values ($1, 'draft', $2::jsonb)`,
      [checklist, JSON.stringify(sections)],
    );

    const version = firstId(
      (
        await pool.query<{ id: string }>(
          `insert into checklist_versions
             (checklist_id, status, version_number, station_id, sections, published_at)
           values ($1, 'published', 1, $2, $3::jsonb, now()) returning id`,
          [checklist, station, JSON.stringify(sections)],
        )
      ).rows,
      "checklist_versions",
    );

    const submission = firstId(
      (
        await pool.query<{ id: string }>(
          `insert into submissions (version_id, station_id, snapshot, answers, started_at)
           values ($1, $2, $3::jsonb, $4::jsonb, now() - interval '90 seconds') returning id`,
          [
            version,
            station,
            JSON.stringify(sections),
            JSON.stringify([
              answer("item-oven", true),
              answer("item-temp", 9, "Порвано уплотнение, вызвал техника"),
            ]),
          ],
        )
      ).rows,
      "submissions",
    );

    return {
      countryId: country,
      storeId: store,
      checklistId: checklist,
      submissionId: submission,
    };
  } finally {
    await pool.end();
  }
}

/**
 * Один блок библиотеки с одним пунктом. Отдельно от `seedAdminScreens`: библиотека
 * не зависит ни от страны, ни от станции. Заводить блок обязательно — на пустой
 * библиотеке рисуется другой экран, а проверить нужно тот, где есть и список,
 * и правка пунктов, и «где используется».
 */
async function seedLibraryBlock(label: string): Promise<string> {
  const suffix = randomUUID().slice(0, 8);
  const pool = new Pool({ connectionString: e2eDatabaseUrl() });
  try {
    return firstId(
      (
        await pool.query<{ id: string }>(
          "insert into blocks (title, items) values ($1::jsonb, $2::jsonb) returning id",
          [
            JSON.stringify({
              ru: `Блок a11y ${label} ${suffix}`,
              en: `Block a11y ${label} ${suffix}`,
            }),
            JSON.stringify([
              {
                id: `item-a11y-${suffix}`,
                title: { ru: "Проверить холодильник", en: "Check the fridge" },
                type: "bool",
                critical: false,
              },
            ]),
          ],
        )
      ).rows,
      "blocks",
    );
  } finally {
    await pool.end();
  }
}

test.describe("доступность: экран заполнения по QR", () => {
  // Телефон на кухне, английская локаль — как в основном сценарии заполнения
  // (`fill.spec.ts`): именно так экран открывают в жизни.
  test.use({
    viewport: PHONE_VIEWPORT,
    isMobile: true,
    hasTouch: true,
    locale: "en-GB",
  });

  test("чистый экран заполнения без нарушений доступности", async ({
    page,
  }) => {
    const stand = await seedFillStand("a11y-чистый");

    await page.goto(`/s/${stand.code}`);
    await page.getByTestId("fill-screen").waitFor();

    expectAccessible(await runAxe(page));
  });

  test("критичный пункт отмечен «не выполнено», раскрыт комментарий — без нарушений", async ({
    page,
  }) => {
    const stand = await seedFillStand("a11y-критичный");
    await page.goto(`/s/${stand.code}`);
    await page.getByTestId("fill-screen").waitFor();

    // `i-sauce` из STAND_SECTIONS критичный: два касания переводят его в «не выполнено»
    // и раскрывают поле комментария под самим пунктом (D018) — это другое состояние
    // разметки, и axe обязан проверить именно его.
    const item = page.locator(
      '[data-testid="fill-item"][data-item-id="i-sauce"]',
    );
    await item.tap();
    await item.tap();
    await page
      .locator('[data-testid="fill-comment"][data-item-id="i-sauce"]')
      .waitFor();

    expectAccessible(await runAxe(page));
  });

  test("экран отказа для неизвестного кода станции без нарушений доступности", async ({
    page,
  }) => {
    await page.goto(`/s/${UNKNOWN_CODE}`);
    await page.getByTestId("fill-invalid").waitFor();

    expectAccessible(await runAxe(page));
  });
});

test.describe("доступность: админка", () => {
  // Эталон админки русский, рабочий стол — обычные условия работы управляющего.
  test.use({ locale: "ru-RU" });

  test("экран входа без нарушений доступности", async ({ page }) => {
    await page.goto("/admin/login");
    await page.getByTestId("login-screen").waitFor();

    expectAccessible(await runAxe(page));
  });

  test("главная админки без нарушений доступности", async ({ page }) => {
    await signIn(page);
    await page.getByTestId("admin-home").waitFor();

    expectAccessible(await runAxe(page));
  });

  test("справочник с выбранной страной и пиццерией без нарушений доступности", async ({
    page,
  }) => {
    const seed = await seedAdminScreens("справочник");
    await signIn(page);

    await page.goto(
      `/admin/catalog?country=${seed.countryId}&store=${seed.storeId}`,
    );
    await page.getByTestId("catalog-screen").waitFor();

    expectAccessible(await runAxe(page));
  });

  test("окно подтверждения перевыпуска кода без нарушений доступности", async ({
    page,
  }) => {
    // Модальное окно — отдельное состояние разметки: на закрытом экране его в DOM
    // нет вовсе, и проверка справочника выше про него ничего не говорит (T260).
    const seed = await seedAdminScreens("перевыпуск");
    await signIn(page);

    await page.goto(
      `/admin/catalog?country=${seed.countryId}&store=${seed.storeId}`,
    );
    await page.getByTestId("reissue-button").first().click();
    await page.getByTestId("reissue-dialog").waitFor();

    expectAccessible(await runAxe(page));
  });

  test("список чек-листов без нарушений доступности", async ({ page }) => {
    await seedAdminScreens("список");
    await signIn(page);

    await page.goto("/admin/checklists");
    await page.getByTestId("checklists-screen").waitFor();

    expectAccessible(await runAxe(page));
  });

  test("редактор чек-листа без нарушений доступности", async ({ page }) => {
    const seed = await seedAdminScreens("редактор");
    await signIn(page);

    await page.goto(`/admin/checklists/${seed.checklistId}`);
    await page.getByTestId("editor-screen").waitFor();

    expectAccessible(await runAxe(page));
  });

  test("лист QR-кодов без нарушений доступности", async ({ page }) => {
    const seed = await seedAdminScreens("qr");
    await signIn(page);

    await page.goto(`/admin/qr?store=${seed.storeId}`);
    await page.getByTestId("qr-screen").waitFor();

    expectAccessible(await runAxe(page));
  });

  test("лента заполнений без нарушений доступности", async ({ page }) => {
    await seedAdminScreens("лента");
    await signIn(page);

    await page.goto("/admin/feed");
    await page.getByTestId("feed-screen").waitFor();

    expectAccessible(await runAxe(page));
  });

  test("карточка заполнения без нарушений доступности", async ({ page }) => {
    const seed = await seedAdminScreens("карточка");
    await signIn(page);

    await page.goto(`/admin/feed/${seed.submissionId}`);
    await page.getByTestId("submission-screen").waitFor();

    expectAccessible(await runAxe(page));
  });

  test("библиотека блоков без нарушений доступности", async ({ page }) => {
    const blockId = await seedLibraryBlock("библиотека");
    await signIn(page);

    // Открываем блок по адресу, а не «первый в списке»: к этому моменту в базе лежат
    // блоки от соседних сценариев, и без явного выбора проверялась бы разметка чужого.
    await page.goto(`/admin/library?block=${blockId}`);
    await page.getByTestId("block-editor").waitFor();

    expectAccessible(await runAxe(page));
  });
});
