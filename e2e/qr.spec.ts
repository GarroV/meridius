// Сквозной сценарий наклеек станций: лист печати, содержимое самого кода, поведение
// при печати, перевыпуск кода с карточки станции и экран планшета, который переживает
// перевыпуск без рук.
//
// С T312 отдельного экрана «QR-коды» нет: лист пиццерии открывается старым адресом
// (`/admin/qr?store=`, на него ведёт справочник) и уезжает на лист наклеек раздела
// «Станции», а перевыпуск и экран кода живут на карточке станции.
//
// Код проверяется не по разметке, а чтением картинки обратно — тем же способом,
// каким его читает камера.
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { decodeQrSvg } from "../src/blocks/qr/testing/decode-svg";
import { E2E_ADMIN_PASSWORD } from "./admin-credentials";
import { E2E_PUBLIC_BASE_URL } from "./public-base-url";
import { seedStore, STATION_NAMES } from "./station-fixtures";

async function signIn(page: Page): Promise<void> {
  await page.goto("/admin/login");
  await page.getByLabel("Пароль").fill(E2E_ADMIN_PASSWORD);
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("admin-home")).toBeVisible();
}

/** Лист пиццерии старым адресом — он обязан привести на лист наклеек её станций. */
async function openStoreSheet(page: Page, storeId: string): Promise<void> {
  await page.goto(`/admin/qr?store=${storeId}`);
  await expect(page).toHaveURL(/\/admin\/stations\/stickers\?stationIds=/);
  await expect(page.getByTestId("qr-sheet").first()).toBeVisible();
}

function stationCard(stationId: string): string {
  return `/admin/stations/${stationId}`;
}

/** Код станции на её карточке — по нему видно, что перевыпуск уже доехал. */
async function codeOnCard(page: Page, stationId: string): Promise<string> {
  // Перезагрузка здесь не ритуал: без неё читалась бы разметка, оставшаяся от
  // прошлого показа, и «код не изменился» подтвердилось бы кэшем, а не базой.
  await page.goto(stationCard(stationId));
  return (await page.getByTestId("station-code").innerText()).trim();
}

/** Разметка картинки первой наклейки — по ней и читается код. */
async function firstStickerSvg(page: Page): Promise<string> {
  return page
    .getByTestId("qr-sticker")
    .first()
    .locator("svg")
    .evaluate((node) => node.outerHTML);
}

/**
 * Перевыпускает код станции с её карточки. Шагов два, и это не ритуал: с T266 первое
 * нажатие только задаёт вопрос, а код меняет подтверждение в окне. Подтверждённый
 * перевыпуск уводит на печать новой наклейки этой станции.
 */
async function reissueOnCard(page: Page, stationId: string): Promise<void> {
  await page.goto(stationCard(stationId));
  await page.getByTestId("reissue-code").click();
  await page.getByTestId("reissue-confirm").click();
  await expect(page).toHaveURL(
    new RegExp(`/admin/stations/stickers\\?stationIds=${stationId}$`),
  );
  await expect(page.getByTestId("qr-sticker")).toHaveCount(1);
}

test.describe("наклейки станций", () => {
  // Эталон и тексты сценария русские, поэтому и браузер русский.
  test.use({ locale: "ru-RU" });

  test("на листе пиццерии наклейка каждой станции, и в коде — публичный адрес площадки", async ({
    page,
  }) => {
    const store = await seedStore();
    await signIn(page);
    await openStoreSheet(page, store.storeId);

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
    await openStoreSheet(page, store.storeId);

    await page.emulateMedia({ media: "print" });

    await expect(page.getByTestId("qr-sheet").first()).toBeVisible();
    await expect(page.getByTestId("qr-sticker").first()).toBeVisible();
    await expect(page.locator("nav")).toBeHidden();
    await expect(page.getByTestId("qr-print")).toBeHidden();
  });

  test("перевыпуск кода с карточки меняет наклейку станции", async ({
    page,
  }) => {
    const store = await seedStore();
    const stationId = store.stationIds[0] ?? "";
    await signIn(page);
    await page.goto(`/admin/stations/stickers?stationIds=${stationId}`);
    const before = decodeQrSvg(await firstStickerSvg(page));

    await reissueOnCard(page, stationId);

    const after = decodeQrSvg(await firstStickerSvg(page));
    expect(after).not.toBe(before);
    expect(after.startsWith(`${E2E_PUBLIC_BASE_URL}/s/`)).toBe(true);
  });

  // Оба пути обязаны быть здесь (T266). Проверка одного подтверждения была бы
  // зелёной и на экране без вопроса вовсе — нажали, код сменился; а проверка одной
  // «Отмены» — на экране, где кнопка не делает ничего.
  test("один клик по «Перевыпустить» кода не меняет — карточка спрашивает", async ({
    page,
  }) => {
    const store = await seedStore();
    const stationId = store.stationIds[0] ?? "";
    const name = store.stationNames[0] ?? "";
    await signIn(page);
    const before = await codeOnCard(page, stationId);

    await page.getByTestId("reissue-code").click();

    const dialog = page.getByTestId("reissue-dialog");
    await expect(dialog).toBeVisible();
    // Название станции в заголовке — не украшение: человек видит, у какой именно
    // станции он собирается сменить код.
    await expect(dialog).toContainText(name);
    await expect(dialog).toContainText("Старая наклейка перестанет работать");
    // Имя окна для экранного диктора — тот же заголовок. Видимый текст его не
    // заменяет: без имени диктор объявит «диалог» и умолчит, о чём спрашивают.
    await expect(dialog).toHaveAccessibleName(new RegExp(name));

    // Код в базе прежний — именно это и есть суть задачи.
    expect(await codeOnCard(page, stationId)).toBe(before);
  });

  test("Esc и «Отмена» закрывают окно, оставляя код прежним", async ({
    page,
  }) => {
    const store = await seedStore();
    const stationId = store.stationIds[0] ?? "";
    await signIn(page);
    const before = await codeOnCard(page, stationId);

    await page.getByTestId("reissue-code").click();
    await expect(page.getByTestId("reissue-dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("reissue-dialog")).toBeHidden();
    expect(await codeOnCard(page, stationId)).toBe(before);

    await page.getByTestId("reissue-code").click();
    await page.getByTestId("reissue-cancel").click();
    await expect(page.getByTestId("reissue-dialog")).toBeHidden();
    // Карточка осталась на экране: «Отмена» возвращает туда, откуда спросили.
    await expect(page.getByTestId("station-sticker-card")).toBeVisible();
    expect(await codeOnCard(page, stationId)).toBe(before);
  });

  test("экран планшета показывает новый код без ручного обновления страницы", async ({
    page,
    context,
  }) => {
    const store = await seedStore();
    const stationId = store.stationIds[0] ?? "";
    await signIn(page);
    await page.goto(stationCard(stationId));
    await page.getByTestId("qr-open-screen").click();

    const shown = page.getByTestId("station-qr");
    await expect(shown).toBeVisible();
    const before = await shown.innerHTML();

    // Перевыпуск делают в другом окне админки — планшета в этот момент никто не
    // касается. Именно так это и происходит в жизни.
    const admin = await context.newPage();
    // Окно закрывается только после того, как перевыпуск доехал: закрытая
    // вкладка посреди серверного действия оборвала бы его.
    await reissueOnCard(admin, stationId);
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
    await page.goto(
      `/admin/qr/screen?store=${other.storeId}&station=${store.stationIds[0] ?? ""}`,
    );

    await expect(page.getByTestId("station-qr")).toHaveCount(0);
  });
});
