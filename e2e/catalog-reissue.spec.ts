// Сквозной сценарий перевыпуска кода станции из справочника (T260).
//
// Проверять это модульным тестом нечем: цена дефекта не в расчёте, а в том, сколько
// шагов лежит между нажатием и необратимым исходом. Раньше шаг был один — промах мимо
// кнопки менял код станции, и все напечатанные наклейки переставали работать в ту же
// секунду. Держит эту цену только настоящий браузер: клик, окно, второй клик.
//
// Оба пути обязаны быть здесь. Проверка одного подтверждения была бы зелёной и на
// экране без подтверждения вовсе (нажали — код сменился), а проверка одной «Отмены» —
// на экране, где кнопка вообще ничего не делает.
import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { E2E_ADMIN_PASSWORD } from "./admin-credentials";
import { seedStore, type SeededStore } from "./station-fixtures";

const CATALOG_PATH = "/admin/catalog";

async function signIn(page: Page): Promise<void> {
  await page.goto("/admin/login");
  await page.getByLabel("Пароль").fill(E2E_ADMIN_PASSWORD);
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("admin-home")).toBeVisible();
}

/**
 * Доходит до пиццерии по дереву и ждёт сам адрес, а не видимость строки. Возвращает
 * этот адрес: в нём и страна, и пиццерия. Одного `?store=` мало — без страны экран
 * берёт первую страну списка, не находит в ней эту пиццерию и молча показывает чужую.
 */
async function openStore(page: Page, store: SeededStore): Promise<string> {
  await page.goto(CATALOG_PATH);
  await page
    .getByTestId("country-item")
    .filter({ hasText: store.countryName })
    .click();
  await expect(page).toHaveURL(/[?&]country=/);

  await page
    .getByTestId("store-item")
    .filter({ hasText: store.storeName })
    .click();
  await expect(page).toHaveURL(new RegExp(`[?&]store=${store.storeId}\\b`));
  return page.url();
}

/** Строка нужной станции в таблице справочника. */
function stationRow(page: Page, name: string): Locator {
  return page.getByTestId("station-row").filter({ hasText: name });
}

/**
 * Имя станции берётся не первое попавшееся: со второй станцией видно, что окно
 * спрашивает именно про неё, а не про первую строку таблицы.
 */
function targetName(store: SeededStore): string {
  const name = store.stationNames[1];
  if (name === undefined) throw new Error("В фикстуре нет второй станции");
  return name;
}

/** Код станции, каким его показывает справочник ПОСЛЕ перезагрузки страницы. */
async function codeFromDatabase(
  page: Page,
  treeUrl: string,
  name: string,
): Promise<string> {
  // Перезагрузка здесь не ритуал: без неё читалась бы разметка, оставшаяся от
  // прошлого показа, и «код не изменился» подтвердилось бы кэшем, а не базой.
  await page.goto(treeUrl);
  return (
    await stationRow(page, name).getByTestId("station-code").innerText()
  ).trim();
}

test.describe("перевыпуск кода станции", () => {
  // Эталон и тексты справочника русские, поэтому и браузер русский.
  test.use({ locale: "ru-RU" });

  test("один клик по «Перевыпустить» кода не меняет — экран спрашивает", async ({
    page,
  }) => {
    const store = await seedStore();
    const name = targetName(store);
    await signIn(page);
    const treeUrl = await openStore(page, store);

    const before = await stationRow(page, name)
      .getByTestId("station-code")
      .innerText();

    await stationRow(page, name).getByTestId("reissue-button").click();

    const dialog = page.getByTestId("reissue-dialog");
    await expect(dialog).toBeVisible();
    // Название станции в заголовке — не украшение: методист видит, у какой именно
    // станции он собирается сменить код.
    await expect(dialog).toContainText(name);
    await expect(dialog).toContainText("Старая наклейка перестанет работать");

    // Код в базе прежний — именно это и есть суть задачи.
    expect(await codeFromDatabase(page, treeUrl, name)).toBe(before.trim());
  });

  test("фокус уходит в окно, а Esc возвращает назад, ничего не меняя", async ({
    page,
  }) => {
    const store = await seedStore();
    const name = targetName(store);
    await signIn(page);
    const treeUrl = await openStore(page, store);

    const before = await stationRow(page, name)
      .getByTestId("station-code")
      .innerText();
    await stationRow(page, name).getByTestId("reissue-button").click();
    await expect(page.getByTestId("reissue-dialog")).toBeVisible();

    // Фокус внутри окна, а не на странице под ним: иначе человек с клавиатуры и
    // экранный диктор продолжают ходить по дереву, не зная, что их спросили.
    const focusInside = await page.evaluate(
      () =>
        document.activeElement?.closest('[data-testid="reissue-dialog"]') !==
        null,
    );
    expect(focusInside).toBe(true);

    // Tab не уводит из окна на первом же шаге: следующая остановка — его кнопка.
    await page.keyboard.press("Tab");
    await expect(page.getByTestId("reissue-confirm")).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("reissue-dialog")).toBeHidden();
    expect(await codeFromDatabase(page, treeUrl, name)).toBe(before.trim());
  });

  test("«Отмена» закрывает окно и оставляет код прежним", async ({ page }) => {
    const store = await seedStore();
    const name = targetName(store);
    await signIn(page);
    const treeUrl = await openStore(page, store);

    const before = await stationRow(page, name)
      .getByTestId("station-code")
      .innerText();

    await stationRow(page, name).getByTestId("reissue-button").click();
    await page.getByTestId("reissue-cancel").click();

    await expect(page.getByTestId("reissue-dialog")).toBeHidden();
    await expect(page.getByTestId("catalog-tree")).toBeVisible();
    expect(await codeFromDatabase(page, treeUrl, name)).toBe(before.trim());
  });

  test("подтверждение меняет код и открывает печать новой наклейки", async ({
    page,
  }) => {
    const store = await seedStore();
    const name = targetName(store);
    await signIn(page);
    const treeUrl = await openStore(page, store);

    const before = (
      await stationRow(page, name).getByTestId("station-code").innerText()
    ).trim();

    await stationRow(page, name).getByTestId("reissue-button").click();
    await page.getByTestId("reissue-confirm").click();

    // Обещание кнопки — «перевыпустить И открыть печать»: без второго шага методист
    // уходит со старой наклейкой на станции и новым кодом в базе.
    await expect(page.getByTestId("qr-screen")).toBeVisible();
    const url = new URL(page.url());
    expect(url.searchParams.get("store")).toBe(store.storeId);
    expect(url.searchParams.get("station")).not.toBeNull();

    // На печати — код именно этой станции и именно новый.
    const printed = page
      .getByTestId("qr-stations")
      .locator("tbody tr")
      .filter({ hasText: name })
      .locator("td:nth-child(2)");
    await expect(printed).not.toHaveText(before);
    const after = (await printed.innerText()).trim();
    expect(after).not.toBe(before);

    // И то же самое в справочнике: сменился код станции, а не показ на одной странице.
    expect(await codeFromDatabase(page, treeUrl, name)).toBe(after);
  });
});
