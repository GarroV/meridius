// Сквозной путь привязанного планшета: кабинет выпустил код — планшет им привязался —
// смена работает — кабинет отвязал (T298).
//
// Сценарий ОДИН и честный, а не пять мелких: цена дефекта здесь не в расчёте, а в длине
// цепочки. Кука, живая строка устройства, свежий код станции при каждой отрисовке и
// раздел кабинета держатся друг за друга, и каждый из них по отдельности зелен и на
// сломанном продукте — например, вкладка, которая помнит код станции, пройдёт всё, кроме
// перевыпуска.
//
// Вторая проверка в файле — единственная, что стоит рядом со сквозной: сброс
// недозаполненного на границе окна. Она утверждает, что ЧЕРНОВИК ПУСТ, и отдельно — что
// страница при этом НЕ перезагружалась: реализация через `router.refresh()` без снятия
// формы оставила бы отметки на экране, а проверка «страница обновилась» была бы зелёной.
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { Pool } from "pg";

import { E2E_ADMIN_PASSWORD } from "./admin-credentials";
import { e2eDatabaseUrl } from "./database";
import { lastSubmission, seedFillStand } from "./fill-fixtures";

const PAIR_PATH = "/pair";
const STATION_PATH = "/station";
const FEED_PATH = "/admin/feed";
/** Карточка станции — с T312 единственное место привязки планшета. */
function stationCard(stationId: string): string {
  return `/admin/stations/${stationId}`;
}

/** Планшет — не телефон: экран шире, и вкладка живёт на нём постоянно. */
const TABLET = { width: 1024, height: 768 } as const;

async function withPool<T>(work: (pool: Pool) => Promise<T>): Promise<T> {
  const pool = new Pool({ connectionString: e2eDatabaseUrl() });
  try {
    return await work(pool);
  } finally {
    await pool.end();
  }
}

async function signIn(page: Page): Promise<void> {
  await page.goto("/admin/login");
  // Не по подписи поля: язык кабинета зависит от браузера, а `name` — нет.
  await page.locator('input[name="password"]').fill(E2E_ADMIN_PASSWORD);
  await page.locator('input[name="login"]').fill("admin");
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("admin-home")).toBeVisible();
}

/** Выпускает код с карточки станции и возвращает его — тем же путём, что и управляющий. */
async function issuePin(page: Page, stationId: string): Promise<string> {
  await page.goto(stationCard(stationId));
  await page.getByTestId("pair-tablet").click();
  const code = page.getByTestId("pair-tablet-code");
  await expect(code).toBeVisible();
  return (await code.innerText()).trim();
}

async function answerBool(page: Page, itemId: string): Promise<void> {
  await page
    .locator(`[data-testid="fill-item"][data-item-id="${itemId}"]`)
    .click();
}

/**
 * Отвязка с карточки станции: «Отвязать» у планшета → подтверждение. Карточка
 * остаётся на той же станции и говорит, что планшета нет.
 */
async function unlinkFromStation(
  admin: Page,
  stationId: string,
): Promise<void> {
  await admin.goto(stationCard(stationId));
  const tablet = admin.getByTestId("paired-tablet");
  await expect(tablet).toHaveCount(1);
  await tablet.getByTestId("device-unlink").click();
  await admin.getByTestId("unlink-confirm").click();

  await expect(admin.getByTestId("no-tablet")).toBeVisible();
  await expect(tablet).toHaveCount(0);
  await expect(admin).toHaveURL(new RegExp(`${stationCard(stationId)}$`));
}

test.describe("привязанный планшет", () => {
  test("код из кабинета доводит планшет до чек-листа станции, переживает перевыпуск кода и гаснет от отвязки", async ({
    browser,
  }) => {
    test.slow();

    // Arrange: станция с опубликованным чек-листом и кабинет управляющего.
    const stand = await seedFillStand("device");

    const cabinet = await browser.newContext();
    const admin = await cabinet.newPage();
    await signIn(admin);

    const tabletContext = await browser.newContext({ viewport: TABLET });
    const tablet = await tabletContext.newPage();

    // Act: код из кабинета — и планшет вводит его один раз в жизни.
    const pin = await issuePin(admin, stand.stationId);
    expect(pin).toMatch(/^\d{4}$/);

    await tablet.goto(PAIR_PATH);
    await tablet.getByTestId("pair-code").fill(pin);
    await tablet.getByTestId("pair-submit").click();

    // Assert: вкладка уехала на постоянный адрес и показывает чек-лист.
    await expect(tablet).toHaveURL(new RegExp(`${STATION_PATH}$`));
    await expect(tablet.getByTestId("fill-screen")).toBeVisible();
    const title = (await tablet.getByTestId("fill-title").innerText()).trim();
    expect(title).not.toBe("");

    // Смена работает: отметки уходят с планшета так же, как с телефона по наклейке.
    await answerBool(tablet, "i-oven");
    await tablet.getByTestId("fill-number").fill("172");
    await answerBool(tablet, "i-sauce");
    await tablet.getByTestId("fill-text").fill("смена спокойная");
    await tablet.getByTestId("fill-submit").click();
    // Экран отправки называет станцию и пиццерию — здесь и видно, ЧЬЮ смену закрыли.
    await expect(tablet.getByTestId("fill-sent")).toContainText(
      stand.stationName,
    );

    const stored = await lastSubmission(stand.stationId);
    expect(stored?.versionId).toBe(stand.versionId);

    // Отметка видна управляющему — ради этого экран и ставили на станцию. Лента живёт
    // на экране пиццерии (D179); адрес со станцией доводит туда сам.
    await admin.goto(`${FEED_PATH}?station=${stand.stationId}`);
    await expect(admin.getByTestId("store-stats-screen")).toBeVisible();
    await expect(admin.getByTestId("feed-table")).toContainText(
      stand.stationName,
    );

    // Перевыпуск кода станции (D006) вкладку не задевает: код в ней не хранится вовсе.
    // Меняется он прямо в базе, а не через справочник: сам перевыпуск проверен своим
    // сценарием (`catalog-reissue.spec.ts`), а здесь важно ровно то, что вкладка берёт
    // код заново. Пройти этот шаг на вкладке, запомнившей код, невозможно.
    const reissued = `e2e${Date.now().toString(36)}`;
    await withPool(async (pool) => {
      await pool.query(
        "update stations set code = $2, code_issued_at = now() where id = $1",
        [stand.stationId, reissued],
      );
    });
    expect(reissued).not.toBe(stand.code);

    await tablet.goto(STATION_PATH);
    await expect(tablet.getByTestId("fill-screen")).toBeVisible();
    await expect(tablet.getByTestId("fill-title")).toHaveText(title);

    // Отвязка из кабинета действует тем же мигом: подпись куки без живой строки
    // устройства не значит ничего.
    await unlinkFromStation(admin, stand.stationId);

    await tablet.goto(STATION_PATH);
    await expect(tablet.getByTestId("tablet-unpaired")).toBeVisible();
    await expect(tablet.getByTestId("fill-screen")).toHaveCount(0);

    await tabletContext.close();
    await cabinet.close();
  });

  test("карточка станции: без планшета → код рядом с инструкцией → планшет привязан → отвязка с последствием", async ({
    browser,
  }) => {
    test.slow();

    // Arrange: станция с чек-листом, ни одного планшета.
    const stand = await seedFillStand("devices-section");
    const cabinet = await browser.newContext();
    const admin = await cabinet.newPage();
    await signIn(admin);

    // Старый адрес «Устройств» со станцией ведёт на её карточку (T312).
    await admin.goto(`/admin/devices?station=${stand.stationId}`);
    await expect(admin).toHaveURL(
      new RegExp(`${stationCard(stand.stationId)}$`),
    );

    // Инструкция видна на самой карточке — четыре шага и настоящий адрес привязки.
    const guide = admin.getByTestId("pair-guide");
    await expect(guide).toBeVisible();
    await expect(guide.getByTestId("pair-guide-step")).toHaveCount(4);
    await expect(guide.getByTestId("pair-guide-address")).toHaveText(
      new RegExp(`^https?://[^/]+.*${PAIR_PATH}$`),
    );

    // Станция без планшета помечена явно.
    await expect(admin.getByTestId("no-tablet")).toBeVisible();

    // Act: код выпускается рядом с инструкцией.
    await admin.getByTestId("pair-tablet").click();
    const code = admin.getByTestId("pair-tablet-code");
    await expect(code).toBeVisible();
    const pin = (await code.innerText()).trim();
    expect(pin).toMatch(/^\d{4}$/);
    // Рядом с кодом — отсчёт и адрес для планшета.
    await expect(admin.getByTestId("pair-tablet-left")).toContainText(
      /\d:\d\d/,
    );
    await expect(admin.getByTestId("pair-tablet-where")).toContainText(
      PAIR_PATH,
    );
    await expect(
      admin.getByTestId("pair-guide").getByTestId("pair-guide-step"),
    ).toHaveCount(4);
    // Станция уже открыта: первый шаг ведёт к кнопке выше, а не «в список ниже».
    await expect(
      admin.getByTestId("pair-guide").getByTestId("pair-guide-step").first(),
    ).toContainText(/выше|above/);

    // Планшет: адрес из инструкции, четыре цифры — и он открывает чек-лист станции.
    const tabletContext = await browser.newContext({ viewport: TABLET });
    const tablet = await tabletContext.newPage();
    await tablet.goto(PAIR_PATH);
    await tablet.getByTestId("pair-code").fill(pin);
    await tablet.getByTestId("pair-submit").click();
    await expect(tablet).toHaveURL(new RegExp(`${STATION_PATH}$`));
    await expect(tablet.getByTestId("fill-screen")).toBeVisible();

    // Assert: на карточке станции планшет теперь виден.
    await admin.goto(stationCard(stand.stationId));
    await expect(admin.getByTestId("paired-tablet")).toHaveCount(1);

    // Вопрос об отвязке называет последствие, а Esc закрывает только вопрос —
    // карточка станции остаётся, человек не теряет, с чем работал.
    await admin.getByTestId("device-unlink").click();
    await expect(admin.getByTestId("unlink-dialog")).toContainText(
      stand.stationName,
    );
    await admin.keyboard.press("Escape");
    await expect(admin.getByTestId("unlink-dialog")).toHaveCount(0);
    await expect(admin.getByTestId("station-tablet-card")).toBeVisible();

    await unlinkFromStation(admin, stand.stationId);

    await tablet.goto(STATION_PATH);
    await expect(tablet.getByTestId("tablet-unpaired")).toBeVisible();

    await tabletContext.close();
    await cabinet.close();
  });

  test("на границе окна недозаполненное снимается: черновик пуст, а страница не перезагружалась", async ({
    browser,
  }) => {
    // Ожидание здесь настоящее: планшет ждёт СВОЮ границу окна, до минуты.
    test.setTimeout(180_000);

    // Arrange: окно чек-листа заканчивается на ближайшей минуте — планшет узнает об
    // этом сам, по своим часам, без перезагрузки страницы.
    const boundary = nextMinute();
    const stand = await seedFillStand("device-window", {
      windowStart: "00:00",
      windowEnd: minuteLabel(boundary),
    });

    const pin = await seedPin(stand.stationId);
    const context = await browser.newContext({ viewport: TABLET });
    const tablet = await context.newPage();
    await tablet.goto(PAIR_PATH);
    await tablet.getByTestId("pair-code").fill(pin);
    await tablet.getByTestId("pair-submit").click();
    await expect(tablet.getByTestId("fill-screen")).toBeVisible();

    const item = tablet.locator(
      '[data-testid="fill-item"][data-item-id="i-oven"]',
    );
    const emptyState = await item.getAttribute("data-state");
    await answerBool(tablet, "i-oven");
    await expect(item).not.toHaveAttribute("data-state", emptyState ?? "");

    // Метка в окне браузера: она переживает мягкое обновление и НЕ переживает
    // перезагрузку страницы. Без неё «черновик пуст» подтвердилось бы и полной
    // перезагрузкой, то есть проверка не отличала бы снятие формы от `location.reload()`.
    await tablet.evaluate(() => {
      (window as unknown as { __tabletMark?: number }).__tabletMark = 1;
    });

    // Окно продлевается ДО того, как часы сработают: после границы чек-лист остаётся
    // открытым и формой той же версии — меняется только окно. Иначе экран сменился бы
    // на «заполнять нечего», и пустой черновик ничего не доказывал бы.
    await withPool(async (pool) => {
      await pool.query(
        "update checklists set window_end = '23:59' where station_id = $1",
        [stand.stationId],
      );
    });

    // Assert: часы планшета сами довели экран до новой отрисовки, форма встала заново
    // и отметок в ней нет.
    await expect(item).toHaveAttribute("data-state", emptyState ?? "", {
      timeout: 90_000,
    });
    await expect(tablet.getByTestId("fill-screen")).toBeVisible();
    const mark = await tablet.evaluate(
      () => (window as unknown as { __tabletMark?: number }).__tabletMark,
    );
    expect(mark).toBe(1);

    await context.close();
  });
});

/** Ближайшая целая минута по UTC — пояс пиццерии фикстуры тоже UTC. */
function nextMinute(): Date {
  const now = new Date();
  const boundary = new Date(now);
  boundary.setUTCSeconds(0, 0);
  boundary.setUTCMinutes(
    boundary.getUTCMinutes() + (now.getUTCSeconds() > 35 ? 2 : 1),
  );
  return boundary;
}

function minuteLabel(at: Date): string {
  return `${String(at.getUTCHours()).padStart(2, "0")}:${String(at.getUTCMinutes()).padStart(2, "0")}`;
}

/**
 * Пин прямо в базе: вторая проверка не о кабинете, и лишний проход по его экранам
 * ломался бы не там, где ищут.
 */
async function seedPin(stationId: string): Promise<string> {
  const code = String(Math.floor(Math.random() * 10_000)).padStart(4, "0");
  await withPool(async (pool) => {
    await pool.query(
      `insert into device_pairings (code, station_id, expires_at)
       values ($1, $2, now() + interval '5 minutes')`,
      [code, stationId],
    );
  });
  return code;
}
