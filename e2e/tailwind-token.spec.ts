import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { themeTokens } from "../src/blocks/core/design-reference";

// Риск из техплана: Tailwind 4.3.3 с Turbopack (бандлер Next 16 по умолчанию) официально
// не подтверждён. Проверяем не факт сборки, а фактический цвет на живой странице.
//
// Ожидаемое берётся из ядра дизайн-системы, а не переписывается сюда числом (D143):
// канон улучшается, и проверка, повторяющая его значения буквами, краснела бы на
// исправном продукте при каждом обновлении — 24.09.2026 ровно так и вышло. Смысл
// проверки от этого не слабеет: она спрашивает, доехал ли токен до экрана через мост
// `@theme inline`, и покраснеет, если утилита возьмёт свой цвет вместо канона.
const CORE_CSS = readFileSync(
  path.resolve(
    import.meta.dirname,
    "../docs/furca/design/reference/dodo-ds.css",
  ),
  "utf8",
);

const HEX_COLOR = /#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})\b/i;

/** Хекс канона (`#RRGGBB`) в запись, которую отдаёт браузер (`rgb(r, g, b)`). */
function rgbOf(hex: string): string {
  let rgb: string | undefined;
  hex.replace(HEX_COLOR, (_whole, r: string, g: string, b: string) => {
    rgb = `rgb(${String(parseInt(r, 16))}, ${String(parseInt(g, 16))}, ${String(parseInt(b, 16))})`;
    return "";
  });
  if (rgb === undefined) {
    throw new Error(`«${hex}» не похож на шестизначный хекс канона`);
  }
  return rgb;
}

/** Значение светлого токена канона в записи браузера. Нет токена — сверять нечем. */
function tokenRgb(name: string): string {
  const value = themeTokens(CORE_CSS, "light").get(name);
  if (value === undefined) {
    throw new Error(`ядро дизайн-системы не называет ${name}`);
  }
  return rgbOf(value);
}

test.describe("Tailwind 4 поверх токенов дизайн-системы", () => {
  test("утилита из @theme inline даёт цвет токена --accent", async ({
    page,
  }) => {
    await page.goto("/");

    const color = await page
      .getByTestId("title")
      .evaluate((element) => globalThis.getComputedStyle(element).color);

    expect(color).toBe(tokenRgb("--accent"));
  });

  test("фон страницы берётся из токена --canvas", async ({ page }) => {
    await page.goto("/");

    const background = await page
      .locator("body")
      .evaluate(
        (element) => globalThis.getComputedStyle(element).backgroundColor,
      );

    expect(background).toBe(tokenRgb("--canvas"));
  });
});
