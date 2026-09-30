// Главная кабинета — пульт сети (D169): цифры, дырки и станции выбранной области.
//
// Прежде здесь проверялись карточки-ссылки на разделы (#11). Их сняли решением владельца:
// в разделы ведёт меню (`admin-nav.spec.ts`), а главная обязана отвечать, что в сети
// происходит. Навигация проверяется так, как ей пользуются: от формы входа и дальше
// только нажатиями.
import { test, expect, type Page } from "@playwright/test";

import { E2E_ADMIN_PASSWORD } from "./admin-credentials";
import { seedStore } from "./station-fixtures";

async function signIn(page: Page): Promise<void> {
  await page.goto("/admin/login");
  await page.getByLabel("Пароль").fill(E2E_ADMIN_PASSWORD);
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("admin-home")).toBeVisible();
}

test.describe("главная — пульт сети", () => {
  // Подписи проверяются по-русски, значит и язык страницы задаётся явно: локаль берётся
  // из настройки браузера, а по умолчанию у прогона она английская.
  test.use({ locale: "ru-RU" });

  test("показывает область, цифры и заполнения, а не ссылки на разделы", async ({
    page,
  }) => {
    await signIn(page);
    const home = page.getByTestId("admin-home");

    await expect(home.getByTestId("feed-filters")).toBeVisible();
    await expect(home.getByTestId("home-working")).toBeVisible();
    await expect(home.getByTestId("feed-metrics")).toBeVisible();
    await expect(home.getByTestId("home-recent")).toBeVisible();
    // Карточек разделов больше нет: ни одной ссылки прямо на раздел «Библиотека».
    await expect(home.locator('a[href="/admin/library"]')).toHaveCount(0);
  });

  test("пиццерия из сводки сужает главную до её станций", async ({ page }) => {
    const store = await seedStore();
    await signIn(page);

    const row = page
      .getByTestId("home-store")
      .filter({ hasText: store.storeName });
    await expect(row).toHaveCount(1);
    await row.getByRole("link", { name: store.storeName }).click();

    await expect(page).toHaveURL(/[?&]store=/);
    const stations = page.getByTestId("home-station");
    await expect(stations).toHaveCount(store.stationNames.length);
    // Станции только что заведены и без чек-листа — это и есть первая дырка.
    await expect(stations.first()).toContainText("нет чек-листа");
    await expect(page.getByTestId("home-todo-noChecklist")).toContainText(
      String(store.stationNames.length),
    );
    // Строка станции ведёт в её панель в «Устройствах», своей копии панели нет.
    await expect(stations.first().getByRole("link").first()).toHaveAttribute(
      "href",
      /^\/admin\/devices\?station=/,
    );
  });

  test("выйти из кабинета по-прежнему можно", async ({ page }) => {
    await signIn(page);

    await page.getByTestId("sign-out").click();
    await expect(page.getByTestId("login-submit")).toBeVisible();
  });
});
