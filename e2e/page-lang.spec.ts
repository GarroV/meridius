// Язык документа обязан совпадать с языком того, что на экране написано (T179).
//
// Что нашла сверка со спекой: телефон на de-DE, станция страны с `locale=ru` — экран
// заполнения по-русски (так и задумано: язык устройства → язык страны → русский), а
// `document.documentElement.lang` равен `en`. Корневая разметка общая с админкой и знает
// только язык запроса, а он на неподдержанном языке телефона откатывается к языку
// продукта. Программы чтения с экрана и браузерный перевод верят атрибуту, а не тексту:
// русская страница, объявленная английской, читается синтезатором как английская.
//
// Почему проверка именно сквозная. Сложить язык страницы можно только на живой странице:
// решение про язык принимают два разных места (корневая разметка и экран заполнения),
// и расходятся они не в коде, а в собранном документе.
import { expect, test } from "@playwright/test";

import { seedFillStand } from "./fill-fixtures";

test.describe("язык документа против языка содержимого", () => {
  test("телефон на неподдержанном языке: страница заполнения объявлена тем же языком, каким написана", async ({
    browser,
  }) => {
    const stand = await seedFillStand("язык-документа", {
      countryLocale: "ru",
    });
    const context = await browser.newContext({ locale: "de-DE" });
    const page = await context.newPage();

    await page.goto(`/s/${stand.code}`);

    // Содержимое по-русски — это уже работало и остаётся. Корень содержимого, а не
    // любой элемент с lang: после правки язык объявляют оба — и <html>, и сам экран.
    await expect(page.locator('body > [lang="ru"]')).toBeVisible();
    // А вот это и есть находка: корень документа обязан сказать то же самое.
    await expect(page.locator("html")).toHaveAttribute("lang", "ru");
    await context.close();
  });

  test("неизвестный код с того же телефона: отказ по-русски и документ русский", async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: "de-DE" });
    const page = await context.newPage();

    await page.goto("/s/zzzzzzzzzz");

    await expect(page.getByTestId("fill-invalid")).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "ru");
    await context.close();
  });

  test("телефон на английском: язык документа остаётся английским", async ({
    browser,
  }) => {
    const stand = await seedFillStand("язык-англ", { countryLocale: "ru" });
    const context = await browser.newContext({ locale: "en-GB" });
    const page = await context.newPage();

    await page.goto(`/s/${stand.code}`);

    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await context.close();
  });

  test("экран кабинета своего языка не объявляет — документ говорит языком запроса", async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: "ru-RU" });
    const page = await context.newPage();

    await page.goto("/");

    await expect(page.locator("html")).toHaveAttribute("lang", "ru");
    await context.close();
  });
});
