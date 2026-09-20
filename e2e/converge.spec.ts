// ОДНА цепочка целиком: критерий готовности 3 спеки, от пустого справочника до ленты.
//
// Зачем отдельный файл, когда сквозных сценариев уже тридцать шесть. Те нарезаны по
// областям, и каждый готовит себе данные фикстурами прямо в базе — то есть проверено,
// что звенья работают, и не проверено, что они СОЕДИНЯЮТСЯ: что созданное кабинетом
// доходит до телефона, а отправленное телефоном возвращается в кабинет. Ровно в этом
// стыке жил дефект #135 (T274, issue #138).
//
// Поэтому здесь нет ни одной фикстуры: страна, пиццерия, станция, чек-лист, версия и
// заполнение заводятся ТОЛЬКО через интерфейс, теми же нажатиями, какими это делают
// методист и сотрудник. Код станции берётся не из базы и не из справочника, а читается
// ОБРАТНО С НАПЕЧАТАННОЙ НАКЛЕЙКИ — тем же способом, каким его читает камера
// (`decodeQrSvg`, общий с `qr.spec.ts`): иначе «код доходит до наклейки» осталось бы
// непроверенным звеном.
//
// Окно чек-листа — круглосуточное (00:00–24:00). Это не поблажка, а условие
// воспроизводимости: с утренним окном сценарий проходил бы или падал в зависимости от
// часа прогона, а сообщение о закрытом окне (T275) читалось бы как поломка цепочки.
import { expect, test } from "@playwright/test";
import type { Browser, Page } from "@playwright/test";

import { decodeQrSvg } from "../src/blocks/qr/testing/decode-svg";
import { E2E_ADMIN_PASSWORD } from "./admin-credentials";

const CATALOG_PATH = "/admin/catalog";
const CHECKLISTS_PATH = "/admin/checklists";
const FEED_PATH = "/admin/feed";

/** Ширина телефона сотрудника — решение D092, та же, на которой живёт экран заполнения. */
const PHONE = { width: 375, height: 812 } as const;

/** Круглосуточное окно: значение поля `window` (`window-field.ts`). */
const ALL_DAY_WINDOW = "00:00|24:00";

/**
 * Метка прогона. Прогоны идут параллельно в одной базе, поэтому всё заведённое этим
 * сценарием обязано быть узнаваемым: иначе «моё заполнение в ленте» подтверждалось бы
 * соседним сценарием.
 */
function label(): string {
  return `${String(Date.now()).slice(-6)}${String(Math.floor(Math.random() * 100))}`;
}

async function signIn(page: Page): Promise<void> {
  await page.goto("/admin/login");
  // По имени поля, а не по подписи: подпись зависит от языка интерфейса.
  await page.locator('input[name="password"]').fill(E2E_ADMIN_PASSWORD);
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("admin-home")).toBeVisible();
}

/**
 * Поля форм справочника ищутся по своим `id` (`new-country-name`, `new-store-timezone`,
 * `new-station-name`): своего опознавателя у них нет, а подпись «Название» стоит и в
 * карточке правки справа — Playwright справедливо отказывается выбирать за нас. `id`
 * при этом не зависит от языка интерфейса, в отличие от подписи.
 */
async function createCountry(page: Page, name: string): Promise<string> {
  await page.goto(`${CATALOG_PATH}?create=country`);
  await page.locator("#new-country-name").fill(name);
  await page.locator("#new-country-locale").selectOption("ru");
  await page.locator("#new-country-name").press("Enter");

  const country = page.getByTestId("country-item").filter({ hasText: name });
  await expect(country).toBeVisible();
  await country.click();
  await expect(page).toHaveURL(/country=/);
  return new URL(page.url()).searchParams.get("country") ?? "";
}

async function createStore(
  page: Page,
  countryId: string,
  name: string,
  timezone: string,
): Promise<string> {
  await page.goto(`${CATALOG_PATH}?country=${countryId}&create=store`);
  await page.locator("#new-store-name").fill(name);
  await page.locator("#new-store-timezone").selectOption(timezone);
  await page.locator("#new-store-name").press("Enter");

  const store = page.getByTestId("store-item").filter({ hasText: name });
  await expect(store).toBeVisible();
  await store.click();
  await expect(page).toHaveURL(/store=/);
  return new URL(page.url()).searchParams.get("store") ?? "";
}

async function createStation(
  page: Page,
  countryId: string,
  storeId: string,
  name: string,
): Promise<void> {
  await page.goto(
    `${CATALOG_PATH}?country=${countryId}&store=${storeId}&create=station`,
  );
  await page.locator("#new-station-name").fill(name);
  await page.locator("#new-station-name").press("Enter");
  await expect(
    page.getByTestId("station-row").filter({ hasText: name }),
  ).toBeVisible();
}

/**
 * Путь, записанный в НАПЕЧАТАННОМ коде станции. Читается с картинки, а не собирается
 * из кода в справочнике: между станцией и наклейкой есть свой путь, и он тоже звено.
 *
 * Хозяин адреса внутри кода — площадка (`PUBLIC_BASE_URL`), и он нарочно не тот, на
 * котором поднят сервер прогона, поэтому берётся только путь.
 */
async function stickerPath(page: Page, stationName: string): Promise<string> {
  const sticker = page
    .getByTestId("qr-sticker")
    .filter({ hasText: stationName });
  await expect(sticker).toHaveCount(1);
  const svg = await sticker.locator("svg").evaluate((node) => node.outerHTML);
  return new URL(decodeQrSvg(svg)).pathname;
}

test.describe("цепочка критерия 3: справочник → чек-лист → наклейка → телефон → лента", () => {
  // Страна сценария русская (язык экрана заполнения задаёт пиццерия, D122), поэтому и
  // кабинет русский: одна цепочка — один язык, иначе проверка текста читалась бы надвое.
  test.use({ locale: "ru-RU" });

  test("методист завёл всё с нуля, сотрудник заполнил с телефона, методист увидел это в ленте", async ({
    page,
    browser,
  }: {
    page: Page;
    browser: Browser;
  }) => {
    const mark = label();
    const countryName = `Страна ${mark}`;
    const storeName = `Пиццерия ${mark}`;
    const stationName = `Кухня ${mark}`;
    const checklistTitle = `Открытие смены ${mark}`;
    const criticalTitle = `Огнетушитель на месте ${mark}`;
    const comment = `Огнетушитель снят на проверку ${mark}`;

    await signIn(page);

    // 1. Справочник: страна → пиццерия → станция. Пояс `UTC`, чтобы часы пиццерии
    // совпадали с часами прогона: сутки ленты считаются по местному времени (D026).
    const countryId = await createCountry(page, countryName);
    const storeId = await createStore(page, countryId, storeName, "UTC");
    await createStation(page, countryId, storeId, stationName);

    // 2. Чек-лист на эту станцию. Станция выбирается на заведении — ею чек-лист
    // привязывается сразу, без промежуточного сохранения.
    await page.goto(`${CHECKLISTS_PATH}/new`);
    await page.getByTestId("new-checklist-title").fill(checklistTitle);
    await page.locator('select[name="stationId"]').selectOption({
      label: `${countryName} · ${storeName} · ${stationName}`,
    });
    await page.locator("#new-checklist-window").selectOption(ALL_DAY_WINDOW);
    await page.getByTestId("create-checklist").click();
    await expect(page.getByTestId("editor-screen")).toBeVisible();

    // 3. Две секции; во второй — критичный пункт.
    const first = page.getByTestId("editor-section").first();
    await first.getByTestId("section-title").fill(`Приёмка кухни ${mark}`);
    await first
      .getByTestId("item-title")
      .first()
      .fill(`Холодильник закрыт ${mark}`);

    await page.getByTestId("add-section").click();
    await expect(page.getByTestId("editor-section")).toHaveCount(2);
    const second = page.getByTestId("editor-section").nth(1);
    await second.getByTestId("section-title").fill(`Безопасность ${mark}`);
    await second.getByTestId("item-title").first().fill(criticalTitle);
    await second.getByTestId("item-severity-critical").click();
    await expect(second.getByTestId("item-severity-critical")).toHaveAttribute(
      "data-selected",
      "true",
    );

    // 4. Публикация создаёт версию — и именно её увидит станция.
    await page.getByTestId("save-draft").click();
    await expect(page.getByTestId("editor-meta")).toHaveText(
      "Черновик сохранён",
    );
    await page.getByTestId("publish").click();
    await expect(page.getByTestId("editor-published")).toContainText("1");

    // 5. Лист QR станции — то, что методист печатает и вешает на кухне.
    await page.goto(`${CATALOG_PATH}?country=${countryId}&store=${storeId}`);
    await page
      .getByTestId("station-row")
      .filter({ hasText: stationName })
      .getByTestId("catalog-station-qr")
      .click();
    await expect(page.getByTestId("qr-sheet")).toBeVisible();
    const scanPath = await stickerPath(page, stationName);

    // 6. Телефон сотрудника: своё окружение, а не та же вкладка кабинета — по ссылке
    // со наклейки вход в кабинет не нужен и не должен требоваться (D021).
    const phone = await browser.newContext({
      viewport: PHONE,
      hasTouch: true,
      isMobile: true,
      // Устройство английское, а экран обязан быть русским: язык задаёт пиццерия (D122).
      locale: "en-US",
    });
    const kitchen = await phone.newPage();
    await kitchen.goto(scanPath);

    // Дошло ли созданное кабинетом до телефона: тот самый чек-лист, те самые пункты.
    await expect(kitchen.getByTestId("fill-screen")).toBeVisible();
    await expect(kitchen.getByTestId("fill-title")).toContainText(
      checklistTitle,
    );
    await expect(kitchen.getByTestId("fill-item")).toHaveCount(2);
    await expect(kitchen.getByTestId("fill-screen")).toContainText(
      criticalTitle,
    );

    // 7. Заполнение: обычный пункт выполнен, критичный ПРОВАЛЕН с комментарием.
    // Второе касание переводит пункт в «не выполнено» — так устроен экран.
    const items = kitchen.getByTestId("fill-item");
    await items.first().tap();
    const critical = items.nth(1);
    await critical.tap();
    await critical.tap();

    // Комментарий к провалу спрашивается сам, и без него отправка не пускает (D014).
    await expect(kitchen.getByTestId("fill-comment")).toBeVisible();
    await expect(kitchen.getByTestId("fill-submit")).toBeDisabled();
    await kitchen.getByTestId("fill-comment").fill(comment);
    await expect(kitchen.getByTestId("fill-submit")).toBeEnabled();
    await kitchen.getByTestId("fill-submit").tap();
    await expect(kitchen.getByTestId("fill-sent")).toBeVisible();
    await phone.close();

    // 8. Обратный конец цепочки: отправленное телефоном видно методисту в ленте —
    // с тем же комментарием и той же отметкой о провале критичного пункта.
    await page.goto(FEED_PATH);
    const row = page
      .getByTestId("submission-row")
      .filter({ hasText: stationName });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(checklistTitle);

    await row.getByRole("link").click();
    await expect(page.getByTestId("submission-screen")).toBeVisible();
    await expect(page.getByTestId("answer-comment")).toContainText(comment);
    const failed = page
      .getByTestId("answer-row")
      .filter({ hasText: criticalTitle });
    await expect(failed).toHaveAttribute("data-failed", "true");
  });
});
