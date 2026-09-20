// Сквозной сценарий блока QR: лист печати, содержимое самого кода, поведение при
// печати и экран планшета, который переживает перевыпуск кода без рук.
//
// Код проверяется не по разметке, а чтением картинки обратно — тем же способом,
// каким его читает камера.
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { decodeQrSvg } from "../src/blocks/qr/testing/decode-svg";
import { E2E_ADMIN_PASSWORD } from "./admin-credentials";
import { E2E_PUBLIC_BASE_URL } from "./public-base-url";
import { seedStore, STATION_NAMES } from "./station-fixtures";

const QR_PATH = "/admin/qr";

async function signIn(page: Page): Promise<void> {
  await page.goto("/admin/login");
  await page.getByLabel("Пароль").fill(E2E_ADMIN_PASSWORD);
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("admin-home")).toBeVisible();
}

/** Код первой станции в таблице — по нему видно, что перевыпуск уже доехал. */
function firstStationCode(page: Page) {
  return page
    .getByTestId("qr-stations")
    .locator("tbody tr td:nth-child(2)")
    .first();
}

/** Название первой станции в таблице — им подписан вопрос о перевыпуске. */
function firstStationName(page: Page) {
  return page
    .getByTestId("qr-stations")
    .locator("tbody tr td:nth-child(1)")
    .first();
}

/**
 * Перевыпускает код первой станции и ДОЖИДАЕТСЯ, что он сменился на экране.
 *
 * Шагов два, и это не ритуал: с T266 первое нажатие только задаёт вопрос, а код
 * меняет подтверждение в окне.
 *
 * Ждать появления самого листа бесполезно: он на странице и до нажатия, поэтому
 * проверка проскакивала вперёд перехода и читала прежний код. Поймано руками на
 * живом экране — в базе код менялся уже после того, как сценарий его прочитал.
 */
async function reissueFirstStation(page: Page): Promise<void> {
  const code = firstStationCode(page);
  const before = await code.innerText();

  await page.getByTestId("reissue-code").first().click();
  await page.getByTestId("reissue-confirm").click();
  await expect(code).not.toHaveText(before);
}

/**
 * Код первой станции, каким его показывает лист ПОСЛЕ перезагрузки страницы.
 *
 * Перезагрузка здесь не ритуал: без неё читалась бы разметка, оставшаяся от прошлого
 * показа, и «код не изменился» подтвердилось бы кэшем, а не базой.
 */
async function codeFromDatabase(page: Page, sheetUrl: string): Promise<string> {
  await page.goto(sheetUrl);
  return (await firstStationCode(page).innerText()).trim();
}

/** Разметка картинки первой наклейки — по ней и читается код. */
async function firstStickerSvg(page: Page): Promise<string> {
  return page
    .getByTestId("qr-sticker")
    .first()
    .locator("svg")
    .evaluate((node) => node.outerHTML);
}

test.describe("QR-коды станций", () => {
  // Эталон и тексты сценария русские, поэтому и браузер русский.
  test.use({ locale: "ru-RU" });

  test("на листе наклейка каждой станции, и в коде — публичный адрес площадки", async ({
    page,
  }) => {
    const store = await seedStore();
    await signIn(page);
    await page.goto(`${QR_PATH}?store=${store.storeId}`);

    await expect(page.getByTestId("qr-screen")).toBeVisible();
    await expect(page.getByTestId("qr-sticker")).toHaveCount(
      STATION_NAMES.length,
    );

    // На каждой наклейке — станция и пиццерия: критерий готовности блока.
    for (const name of store.stationNames) {
      await expect(
        page.getByTestId("qr-sticker").filter({ hasText: name }),
      ).toHaveCount(1);
    }
    await expect(
      page.getByTestId("qr-sticker").filter({ hasText: store.storeName }),
    ).toHaveCount(STATION_NAMES.length);

    // Главное: внутри кода — адрес из окружения площадки, а не адрес, на котором
    // открыта админка (сервер прогона слушает localhost).
    const scanned = decodeQrSvg(await firstStickerSvg(page));
    expect(scanned.startsWith(`${E2E_PUBLIC_BASE_URL}/s/`)).toBe(true);
    expect(scanned).not.toContain("localhost");
  });

  test("при печати на листе нет ни меню, ни кнопок, ни фона приложения", async ({
    page,
  }) => {
    const store = await seedStore();
    await signIn(page);
    await page.goto(`${QR_PATH}?store=${store.storeId}`);
    await expect(page.getByTestId("qr-sheet")).toBeVisible();

    await page.emulateMedia({ media: "print" });

    await expect(page.getByTestId("qr-sheet")).toBeVisible();
    await expect(page.getByTestId("qr-sticker").first()).toBeVisible();
    await expect(page.locator("nav")).toBeHidden();
    await expect(page.getByTestId("qr-print")).toBeHidden();
    await expect(page.getByTestId("reissue-code").first()).toBeHidden();
    await expect(page.getByTestId("qr-stations")).toBeHidden();
  });

  test("перевыпуск кода меняет наклейку станции", async ({ page }) => {
    const store = await seedStore();
    await signIn(page);
    await page.goto(`${QR_PATH}?store=${store.storeId}`);

    const before = decodeQrSvg(await firstStickerSvg(page));
    await reissueFirstStation(page);

    const after = decodeQrSvg(await firstStickerSvg(page));
    expect(after).not.toBe(before);
    expect(after.startsWith(`${E2E_PUBLIC_BASE_URL}/s/`)).toBe(true);
  });

  // Оба пути обязаны быть здесь (T266). Проверка одного подтверждения была бы
  // зелёной и на экране без вопроса вовсе — нажали, код сменился; а проверка одной
  // «Отмены» — на экране, где кнопка не делает ничего.
  test("один клик по «Перевыпустить» кода не меняет — лист спрашивает", async ({
    page,
  }) => {
    const store = await seedStore();
    await signIn(page);
    const sheetUrl = `${QR_PATH}?store=${store.storeId}`;
    await page.goto(sheetUrl);

    const before = (await firstStationCode(page).innerText()).trim();
    // Имя берётся из самой строки, а не из фикстуры: станции на листе отсортированы
    // по имени, и «первая в фикстуре» — не обязательно первая в таблице.
    const name = (await firstStationName(page).innerText()).trim();

    await page.getByTestId("reissue-code").first().click();

    const dialog = page.getByTestId("reissue-dialog");
    await expect(dialog).toBeVisible();
    // Название станции в заголовке — не украшение: на листе станций несколько, и
    // человек видит, у какой именно он собирается сменить код.
    await expect(dialog).toContainText(name);
    await expect(dialog).toContainText("Старая наклейка перестанет работать");
    // Имя окна для экранного диктора — тот же заголовок. Видимый текст его не
    // заменяет: без имени диктор объявит «диалог» и умолчит, о чём спрашивают.
    await expect(dialog).toHaveAccessibleName(new RegExp(name));

    // Код в базе прежний — именно это и есть суть задачи.
    expect(await codeFromDatabase(page, sheetUrl)).toBe(before);
  });

  test("Esc и «Отмена» закрывают окно, оставляя код прежним", async ({
    page,
  }) => {
    const store = await seedStore();
    await signIn(page);
    const sheetUrl = `${QR_PATH}?store=${store.storeId}`;
    await page.goto(sheetUrl);

    const before = (await firstStationCode(page).innerText()).trim();

    await page.getByTestId("reissue-code").first().click();
    await expect(page.getByTestId("reissue-dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("reissue-dialog")).toBeHidden();
    expect(await codeFromDatabase(page, sheetUrl)).toBe(before);

    await page.getByTestId("reissue-code").first().click();
    await page.getByTestId("reissue-cancel").click();
    await expect(page.getByTestId("reissue-dialog")).toBeHidden();
    // Лист остался на экране: «Отмена» возвращает туда, откуда спросили, а не
    // выбрасывает методиста к выбору пиццерии.
    await expect(page.getByTestId("qr-sheet")).toBeVisible();
    expect(await codeFromDatabase(page, sheetUrl)).toBe(before);
  });

  test("экран планшета показывает новый код без ручного обновления страницы", async ({
    page,
    context,
  }) => {
    const store = await seedStore();
    await signIn(page);
    await page.goto(`${QR_PATH}?store=${store.storeId}`);
    await page.getByTestId("qr-open-screen").click();

    await expect(page.getByTestId("station-screen")).toBeVisible();
    const shown = page.getByTestId("station-qr");
    const before = await shown.innerHTML();

    // Перевыпуск делают в другом окне админки — планшета в этот момент никто не
    // касается. Именно так это и происходит в жизни.
    const admin = await context.newPage();
    await admin.goto(`${QR_PATH}?store=${store.storeId}`);
    // Окно закрывается только после того, как перевыпуск доехал: закрытая
    // вкладка посреди серверного действия оборвала бы его.
    await reissueFirstStation(admin);
    await admin.close();

    // Ни перезагрузки, ни нажатий на самом планшете: экран обязан обновиться сам.
    await expect
      .poll(async () => shown.innerHTML(), { timeout: 30_000 })
      .not.toBe(before);
  });

  test("чужая станция во весь экран не открывается", async ({ page }) => {
    const store = await seedStore();
    const other = await seedStore();
    await signIn(page);

    // Ссылка собрана руками: пиццерия одна, станция из другой.
    await page.goto(`${QR_PATH}?store=${store.storeId}`);
    const alienScreen = await page
      .getByTestId("qr-open-screen")
      .getAttribute("href");
    expect(alienScreen).not.toBeNull();

    await page.goto(
      `/admin/qr/screen?store=${other.storeId}&station=${
        new URL(alienScreen ?? "", "http://localhost").searchParams.get(
          "station",
        ) ?? ""
      }`,
    );

    await expect(page.getByTestId("station-screen")).toHaveCount(0);
  });
});
