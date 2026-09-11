// Поле «Страна» в карточке пиццерии — сквозной сценарий (T117, issue #27).
//
// Перенос пиццерии между странами эта версия не делает, поле только для чтения. Но
// `<select disabled>` серым неактивным контролом читается как «сломано» или «нет прав» —
// тот же класс дефекта, что уже трижды находили в этом продукте (кнопки QR T107, пункты
// меню кабинета, «Открыть блок» редактора). Проверка держит именно это: значение видно
// текстом, а не спрятано за отключённым элементом формы, и при этом карточка не обзавелась
// настоящим (пусть и однопунктовым) выпадающим списком — реализовывать перенос пиццерии
// между странами не входит в эту задачу.
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { E2E_ADMIN_PASSWORD } from "./admin-credentials";
import { seedStore, type SeededStore } from "./station-fixtures";

const CATALOG_PATH = "/admin/catalog";

async function signIn(page: Page): Promise<void> {
  await page.goto("/admin/login");
  await page.getByLabel("Пароль").fill(E2E_ADMIN_PASSWORD);
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("admin-home")).toBeVisible();
}

// Доходит до карточки пиццерии кликами по дереву — тем же путём, что и методист, а не
// прямым переходом по адресу с готовыми параметрами.
async function openStore(page: Page, store: SeededStore): Promise<void> {
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
}

test.describe("карточка пиццерии: поле «Страна»", () => {
  // Эталон и тексты справочника русские, поэтому и браузер русский.
  test.use({ locale: "ru-RU" });

  test("страна показана значением, а не отключённым списком", async ({
    page,
  }) => {
    const store = await seedStore();
    await signIn(page);
    await openStore(page, store);

    const value = page.getByTestId("store-country-value");
    await expect(value).toBeVisible();
    // Значение настоящее, не заглушка и не пусто.
    await expect(value).toHaveText(store.countryName);

    // Не элемент формы вовсе: ни `<select>` (в том числе неотключённый — реализовывать
    // перенос между странами эта задача не должна), ни любой другой control.
    const tagName = await value.evaluate((element) => element.tagName);
    expect(tagName).not.toBe("SELECT");
    expect(tagName).not.toBe("INPUT");

    // В карточке пиццерии не осталось ни одного отключённого элемента формы — именно
    // такой вид читается пользователем как «сломано» или «нет прав».
    const disabledInCard = page.locator(
      '[data-testid="detail-card"] :disabled',
    );
    await expect(disabledInCard).toHaveCount(0);
  });
});
