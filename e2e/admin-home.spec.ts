// Первый экран после входа: он обязан вести в продукт.
//
// Заведено находкой #11: и корень, и этот экран были заглушками, и вошедший упирался в тупик —
// разделы существовали, но попасть в них можно было только зная адрес наизусть. Остальные
// сценарии этого не ловили, потому что открывают экраны прямым `page.goto`, то есть входят
// туда, куда человек пройти не может. Здесь навигация проверяется так, как ей пользуются:
// от формы входа и дальше только по ссылкам.
import { test, expect, type Page } from "@playwright/test";

import { E2E_ADMIN_PASSWORD } from "./admin-credentials";

/** Разделы, готовые к работе: подпись ссылки и адрес, куда она обязана привести. */
const SECTIONS = [
  { name: "Чек-листы", path: "/admin/checklists" },
  { name: "Библиотека блоков", path: "/admin/library" },
  { name: "QR-коды", path: "/admin/qr" },
  { name: "Заполнения", path: "/admin/feed" },
  { name: "Страны и пиццерии", path: "/admin/catalog" },
] as const;

/**
 * Ссылка раздела по началу её подписи. Подпись карточки — это название раздела и
 * пояснение под ним, поэтому поиск по вхождению стал неоднозначным, как только
 * пояснение одного раздела упомянуло название другого («вставлять его в чек-листы»
 * у библиотеки против раздела «Чек-листы»). Якорь на начало подписи ловит ровно тот
 * раздел, который назван, и не зависит от слов в пояснении.
 */
function sectionLink(page: Page, name: string) {
  return page
    .getByTestId("admin-home")
    .getByRole("link", { name: new RegExp(`^${name}`) });
}

async function signIn(page: Page): Promise<void> {
  await page.goto("/admin/login");
  await page.getByLabel("Пароль").fill(E2E_ADMIN_PASSWORD);
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("admin-home")).toBeVisible();
}

test.describe("первый экран после входа", () => {
  // Подписи проверяются по-русски, значит и язык страницы задаётся явно: локаль берётся
  // из настройки браузера, а по умолчанию у прогона она английская.
  test.use({ locale: "ru-RU" });

  test("ведёт в каждый готовый раздел", async ({ page }) => {
    await signIn(page);

    const links = page.getByTestId("admin-home").getByRole("link");
    await expect(links).toHaveCount(SECTIONS.length);

    for (const section of SECTIONS) {
      await expect(sectionLink(page, section.name)).toHaveAttribute(
        "href",
        section.path,
      );
    }
  });

  test("переход по ссылке действительно открывает раздел, а не уводит на корень", async ({
    page,
  }) => {
    await signIn(page);

    for (const section of SECTIONS) {
      await sectionLink(page, section.name).click();
      await expect(page).toHaveURL(new RegExp(`${section.path}$`));
      // Возврат тем же путём, каким пришёл человек: раздел обязан вести назад в кабинет.
      await page.goBack();
      await expect(page.getByTestId("admin-home")).toBeVisible();
    }
  });

  test("выйти из кабинета по-прежнему можно", async ({ page }) => {
    await signIn(page);

    await page.getByTestId("sign-out").click();
    await expect(page.getByTestId("login-submit")).toBeVisible();
  });
});
