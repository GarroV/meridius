import { expect, test } from "@playwright/test";

// Риск из техплана: Tailwind 4.3.3 с Turbopack (бандлер Next 16 по умолчанию) официально
// не подтверждён. Проверяем не факт сборки, а фактический цвет на живой странице.
test.describe("Tailwind 4 поверх токенов дизайн-системы", () => {
  test("утилита из @theme inline даёт цвет токена --accent", async ({
    page,
  }) => {
    await page.goto("/");

    const color = await page
      .getByTestId("title")
      .evaluate((element) => globalThis.getComputedStyle(element).color);

    // --accent: #1F4E9C из docs/furca/design/reference/tokens.css
    expect(color).toBe("rgb(31, 78, 156)");
  });

  test("фон страницы берётся из токена --canvas", async ({ page }) => {
    await page.goto("/");

    const background = await page
      .locator("body")
      .evaluate(
        (element) => globalThis.getComputedStyle(element).backgroundColor,
      );

    // --canvas: #EDEFF2
    expect(background).toBe("rgb(237, 239, 242)");
  });
});
