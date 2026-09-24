// Язык кабинета выбирается человеком и переживает перезагрузку (#161).
//
// До этого язык решал только заголовок браузера, и сменить его было нечем: владелец
// видел кабинет по-английски и не мог ничего сделать. Проверка держит не кнопку, а
// обещание — выбор сильнее догадки браузера и не забывается на следующем экране.
//
// Почему сквозным сценарием, а не модульным тестом: язык решается на сервере при
// отрисовке, применяется кукой и проверяется тем, что страница ПРИШЛА на другом языке.
// Модульный тест на `resolveLocale` такую цепочку не проходит — он проверяет только
// порядок предпочтений, и зелёным останется, даже если кука не долетит до сервера.
import { test, expect, type Page } from "@playwright/test";

import { E2E_ADMIN_PASSWORD } from "./admin-credentials";

/** Подпись одного и того же раздела меню на каждом языке — по ней и видно язык экрана. */
const CHECKLISTS_RU = "Чек-листы";
const CHECKLISTS_EN = "Checklists";

async function signIn(page: Page): Promise<void> {
  await page.goto("/admin/login");
  await page.getByLabel("Пароль").fill(E2E_ADMIN_PASSWORD);
  await page.getByTestId("login-submit").click();
  await page.getByTestId("admin-home").waitFor();
}

test.describe("переключатель языка кабинета", () => {
  // Браузер прогона говорит по-русски намеренно: смысл проверки в том, что выбор
  // человека сильнее этой догадки. Без явного языка Chromium присылает английский,
  // и переключение «на английский» ничего бы не доказало.
  test.use({ locale: "ru-RU" });

  test("выбор языка переживает перезагрузку и переход на другой экран", async ({
    page,
  }) => {
    await signIn(page);
    const nav = page.getByTestId("nav-checklists");

    // Исходно язык берётся из браузера: прогон ходит с русским заголовком.
    await expect(nav).toHaveText(CHECKLISTS_RU);

    await page.getByTestId("locale-en").click();
    await expect(nav).toHaveText(CHECKLISTS_EN);

    // Перезагрузка — выбор обязан лежать в куке, а не в памяти страницы.
    await page.reload();
    await expect(nav).toHaveText(CHECKLISTS_EN);

    // Другой экран кабинета: язык решается на сервере один раз на весь кабинет,
    // а не отдельно каждым экраном.
    await page.goto("/admin/catalog");
    await expect(page.getByTestId("nav-checklists")).toHaveText(CHECKLISTS_EN);

    // Дорога в обе стороны: выбор, из которого нельзя вернуться, — ловушка.
    await page.getByTestId("locale-ru").click();
    await expect(page.getByTestId("nav-checklists")).toHaveText(CHECKLISTS_RU);
    await page.reload();
    await expect(page.getByTestId("nav-checklists")).toHaveText(CHECKLISTS_RU);
  });

  test("выбранный язык отмечен нажатым для читалки с экрана", async ({
    page,
  }) => {
    await signIn(page);

    await page.getByTestId("locale-en").click();
    await expect(page.getByTestId("locale-en")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByTestId("locale-ru")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
});
