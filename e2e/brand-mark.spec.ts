// Знак продукта доходит до браузера: вкладка, apple-touch, манифест и меню (D185).
//
// Отказ здесь молчаливый: битая ссылка на иконку не роняет ни страницу, ни сборку —
// браузер просто покажет пустую вкладку, а меню — значок «картинка не загрузилась».
// Поэтому проверяется не наличие ссылки в разметке, а то, что по ней отвечает файл
// нужного типа, и что картинка в меню действительно декодировалась (`naturalWidth`).
import {
  test,
  expect,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

import { E2E_ADMIN_PASSWORD } from "./admin-credentials";

/** Адрес из `<link rel="…">` отданного документа. */
function linkHref(html: string, rel: string): string {
  const tag = new RegExp(`<link[^>]*rel="${rel}"[^>]*>`).exec(html)?.[0] ?? "";
  const href = /href="([^"]+)"/.exec(tag)?.[1];
  expect(href, `в <head> нет <link rel="${rel}">`).toBeDefined();
  return (href ?? "").replaceAll("&amp;", "&");
}

async function expectServed(
  request: APIRequestContext,
  url: string,
  type: string,
): Promise<void> {
  const response = await request.get(url);
  expect(response.status(), url).toBe(200);
  expect(response.headers()["content-type"], url).toContain(type);
}

/** Картинка знака в видимом месте меню загрузилась, а не просто стоит тегом. */
async function expectMarkLoaded(page: Page, scope: string): Promise<void> {
  const mark = page.locator(`${scope} [data-testid="brand-mark"]`);
  await expect(mark).toBeVisible();
  await expect
    .poll(() => mark.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);
}

test.describe("знак продукта", () => {
  // Подписи формы входа ищутся по-русски — язык контекста задаётся явно, как в admin-nav.
  test.use({ locale: "ru-RU" });

  test("вкладка, apple-touch и манифест отдаются файлами нужного типа", async ({
    request,
  }) => {
    const html = await (await request.get("/admin/login")).text();

    await expectServed(request, linkHref(html, "icon"), "image/svg+xml");
    await expectServed(
      request,
      linkHref(html, "apple-touch-icon"),
      "image/png",
    );

    const manifestUrl = linkHref(html, "manifest");
    await expectServed(request, manifestUrl, "application/manifest+json");
    const manifest = (await (await request.get(manifestUrl)).json()) as {
      icons: { src: string; purpose?: string }[];
    };
    expect(manifest.icons.map((icon) => icon.purpose ?? "any")).toEqual([
      "any",
      "any",
      "maskable",
    ]);
    for (const icon of manifest.icons) {
      await expectServed(request, icon.src, "image/png");
    }
  });

  test("знак стоит в меню кабинета и на телефоне — в полосе", async ({
    page,
  }) => {
    await page.goto("/admin/login");
    await page.locator('input[name="login"]').fill("admin");
    await page.getByLabel("Пароль").fill(E2E_ADMIN_PASSWORD);
    await page.getByTestId("login-submit").click();
    await expect(page.getByTestId("admin-home")).toBeVisible();

    await expectMarkLoaded(page, '[data-testid="nav-brand"]');

    await page.setViewportSize({ width: 375, height: 800 });
    await expectMarkLoaded(page, '[data-testid="mbar-brand"]');
  });
});
