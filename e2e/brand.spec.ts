// Имя продукта доходит до экрана: MERIDIUS (T105, решения D057 и D058).
//
// Каталог строк проверяет `src/blocks/core/brand.test.ts` — он ловит правку ключа.
// Здесь проверяется вторая половина того же: что ключ действительно отрисован там, где
// человек его видит, и в обоих языках. Разница не теоретическая — до ребрендинга во
// вкладке браузера стояло служебное имя репозитория, и заметить это по каталогу строк
// было нельзя: заголовок вкладки в каталоге не лежит вовсе.
import { test, expect, type Page } from "@playwright/test";

import { E2E_ADMIN_PASSWORD } from "./admin-credentials";

const BRAND = "MERIDIUS";

/** Шапка меню и карточка входа: два места, где имя продукта показано человеку. */
function brandLine(page: Page) {
  return page.locator("nav").first().getByText(BRAND, { exact: false });
}

test.describe("имя продукта на экране", () => {
  for (const locale of ["ru-RU", "en-US"] as const) {
    test(`карточка входа и кабинет говорят ${BRAND} (${locale})`, async ({
      browser,
      request,
    }) => {
      // Заголовок вкладки читается из ОТДАННОГО документа, а не из живой вкладки:
      // `<title>` смотрят поисковик, мессенджер, закладка и история браузера — все
      // они видят то, что пришло по проводу. Проверка живого DOM здесь была зелёной
      // на любом заголовке, который React доставил бы после гидратации (T271).
      const delivered = await request.get("/admin/login", {
        headers: { "accept-language": locale },
      });
      expect(delivered.status()).toBe(200);
      expect(/<title>([^<]*)<\/title>/.exec(await delivered.text())?.[1]).toBe(
        BRAND,
      );

      // Язык задаётся явно: имя не переводится, и именно это здесь и проверяется —
      // на обоих языках в шапке стоит одно и то же слово.
      const context = await browser.newContext({ locale });
      const page = await context.newPage();

      await page.goto("/admin/login");
      await expect(
        page.getByText(BRAND, { exact: false }).first(),
      ).toBeVisible();
      await page
        .getByLabel(locale === "ru-RU" ? "Пароль" : "Password")
        .fill(E2E_ADMIN_PASSWORD);
      await page.getByTestId("login-submit").click();
      await expect(page.getByTestId("admin-home")).toBeVisible();

      await expect(brandLine(page)).toBeVisible();

      await context.close();
    });
  }
});
