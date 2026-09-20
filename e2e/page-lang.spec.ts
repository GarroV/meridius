// Язык публичного экрана заполнения на живой странице (T179, T232, D122).
//
// Здесь сходятся две вещи, которые в коде лежат отдельно и расходятся только в
// собранном документе:
//
//  · ЧЕЙ это язык. По решению владельца D122 — пиццерии: «дефолт - тот язык что задали
//    для пиццерии. отбивки и сервисные сообщения также должны быть на этом языке».
//    Телефон больше не выбирает язык там, где пиццерия известна.
//  · СОВПАДАЕТ ли язык документа с языком того, что на экране написано. Решение про
//    язык принимают два разных места — корневая разметка (знает только заголовок
//    запроса) и экран заполнения (знает базу), — и синтезатор речи с браузерным
//    переводом верят атрибуту `<html lang>`, а не буквам на экране.
//
// Проверка именно сквозная: сложить и то и другое можно только на живой странице.
import { expect, test } from "@playwright/test";

import { seedFillStand, seedStationWithoutChecklist } from "./fill-fixtures";

test.describe("чей язык у публичного экрана", () => {
  test("телефон на английском, пиццерия на русском: экран русский, и документ тоже", async ({
    browser,
  }) => {
    // Это и есть D122 в действии. До него побеждал телефон, и сотрудник в русской
    // пиццерии читал английский экран только потому, что так настроен его телефон.
    const stand = await seedFillStand("язык-пиццерии", { countryLocale: "ru" });
    const context = await browser.newContext({ locale: "en-GB" });
    const page = await context.newPage();

    await page.goto(`/s/${stand.code}`);

    await expect(page.locator('body > [lang="ru"]')).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "ru");
    await context.close();
  });

  test("и в обратную сторону: русский телефон в английской пиццерии читает английский", async ({
    browser,
  }) => {
    const stand = await seedFillStand("язык-англ", { countryLocale: "en" });
    const context = await browser.newContext({ locale: "ru-RU" });
    const page = await context.newPage();

    await page.goto(`/s/${stand.code}`);

    await expect(page.locator('body > [lang="en"]')).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await context.close();
  });

  test("телефон на третьем языке ничего не меняет: решает пиццерия", async ({
    browser,
  }) => {
    const stand = await seedFillStand("язык-документа", {
      countryLocale: "ru",
    });
    const context = await browser.newContext({ locale: "de-DE" });
    const page = await context.newPage();

    await page.goto(`/s/${stand.code}`);

    await expect(page.locator('body > [lang="ru"]')).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "ru");
    await context.close();
  });

  test("отбивка «заполнять нечего» — тоже язык пиццерии, а не телефона", async ({
    browser,
  }) => {
    // Наклейка действующая, станция настоящая, просто сейчас ей заполнять нечего.
    // Владелец назвал отбивки прямо, поэтому и эта надпись принадлежит пиццерии.
    const station = await seedStationWithoutChecklist("отбивка", "ru");
    const context = await browser.newContext({ locale: "en-GB" });
    const page = await context.newPage();

    await page.goto(`/s/${station.code}`);

    await expect(page.getByTestId("fill-none")).toBeVisible();
    await expect(page.getByTestId("fill-none")).toContainText(
      "Сейчас заполнять нечего",
    );
    await expect(page.locator("html")).toHaveAttribute("lang", "ru");
    await context.close();
  });
});

test.describe("где пиццерии нет — язык продукта, а не второе умолчание", () => {
  test("неизвестный код с телефона на третьем языке: отказ на языке продукта", async ({
    browser,
  }) => {
    // Вторая половина #129. Раньше здесь был русский, а чек-лист и вход на том же
    // телефоне приходили по-английски: у экрана заполнения было своё умолчание рядом
    // с умолчанием продукта. Человек получал отказ на языке, которого не знает, ровно
    // тогда, когда ему надо понять, что делать дальше.
    const context = await browser.newContext({ locale: "de-DE" });
    const page = await context.newPage();

    await page.goto("/s/zzzzzzzzzz");

    await expect(page.getByTestId("fill-invalid")).toBeVisible();
    await expect(page.getByTestId("fill-invalid")).toContainText(
      "This code does not work",
    );
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await context.close();
  });

  test("тот же телефон на странице входа получает тот же язык", async ({
    browser,
  }) => {
    // Смысл проверки — не язык входа сам по себе, а то, что он ОДИН с отказом выше:
    // расхождение этих двух ответов и есть #129.
    const context = await browser.newContext({ locale: "de-DE" });
    const page = await context.newPage();

    await page.goto("/admin/login");

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
