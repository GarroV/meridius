// Адрес, которого в продукте нет: что видит человек.
//
// Сверка со спекой (T177, T187) нашла два разных отказа на одном классе:
//   • `/admin/<чего нет>` отдавал английскую заглушку Next «404 This page could not be
//     found.» — без каркаса, без меню и без перевода, хотя у `/admin/feed/<чужой id>`
//     свой экран есть, то есть приём в проекте освоен и просто не применён;
//   • голый `/s/` уводил кухонного работника на пароль админки (308 на `/s`, затем 307
//     на `/admin/login`): человек, обрезавший ссылку станции, упирался в форму входа,
//     к которой у него нет и не должно быть пароля.
//
// Здесь оба случая проверяются так, как их встречает человек, — настоящим браузером.
import { expect, test, type Page } from "@playwright/test";

import { E2E_ADMIN_PASSWORD } from "./admin-credentials";

/**
 * Вход. Поле ищется по типу, а не по подписи: в этом файле один и тот же вход нужен и
 * русскому окну, и английскому, а подпись у них разная — по ней помощник работал бы
 * ровно в одной локали и падал бы в другой по чужой причине.
 */
async function signIn(page: Page): Promise<void> {
  await page.goto("/admin/login");
  await page.locator("input[type=password]").fill(E2E_ADMIN_PASSWORD);
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("admin-home")).toBeVisible();
}

test.describe("неизвестный адрес кабинета", () => {
  // Язык окна задаётся явно: по умолчанию браузер прогона просит английский, а проверка
  // ниже как раз про то, что экран говорит на языке человека.
  test.use({ locale: "ru-RU" });

  test("отдаёт экран продукта с меню и на языке человека, а не заглушку Next", async ({
    page,
  }) => {
    await signIn(page);

    const response = await page.goto("/admin/net-takogo-razdela");

    // Код ответа честный: страницы действительно нет.
    expect(response?.status()).toBe(404);
    // Каркас кабинета на месте — значит есть и меню, и верхняя полоса.
    await expect(page.getByTestId("admin-not-found")).toBeVisible();
    await expect(page.getByTestId("nav-feed")).toBeVisible();
    // Заглушка Next по-английски больше не показывается.
    await expect(page.locator("body")).not.toContainText(
      "This page could not be found",
    );
    await expect(page.getByText("Такого раздела нет")).toBeVisible();
    // Шапка говорит своё слово, а не повторяет крошку (T251): «Кабинет» дважды подряд
    // читался как сбой вёрстки.
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Страница не найдена",
    );
    // Из тупика есть выход — ссылка обратно в кабинет.
    await page.getByTestId("admin-not-found-home").click();
    await expect(page.getByTestId("admin-home")).toBeVisible();
  });

  test("на английском телефоне говорит по-английски", async ({ browser }) => {
    const context = await browser.newContext({ locale: "en-GB" });
    const page = await context.newPage();
    await signIn(page);

    await page.goto("/admin/no-such-section");

    await expect(page.getByText("No such section")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Page not found",
    );
    await context.close();
  });
});

test.describe("неизвестный публичный адрес", () => {
  test("отдаёт понятный отказ, а не заглушку Next", async ({ page }) => {
    const response = await page.goto("/takogo-adresa-net");

    expect(response?.status()).toBe(404);
    await expect(page.getByTestId("not-found")).toBeVisible();
    await expect(page.locator("body")).not.toContainText(
      "This page could not be found",
    );
  });
});

test.describe("обрезанная ссылка станции", () => {
  test("голый /s/ не уводит на пароль админки", async ({ page }) => {
    const response = await page.goto("/s/");

    // Главное: человек с кухни не оказывается на форме входа.
    expect(page.url()).not.toContain("/admin/login");
    expect(response?.status()).toBe(404);
    await expect(page.getByTestId("not-found")).toBeVisible();
  });

  test("голый /s без косой черты — то же самое", async ({ page }) => {
    await page.goto("/s");

    expect(page.url()).not.toContain("/admin/login");
    await expect(page.getByTestId("not-found")).toBeVisible();
  });
});
