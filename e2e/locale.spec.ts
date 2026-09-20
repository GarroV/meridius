import { expect, test } from "@playwright/test";

// Риск из техплана: next-intl в Next 16 (где middleware.ts переименован в proxy.ts)
// описан только сообществом. Проверяем сценарий кухни: язык телефона, без входа и без cookie.
//
// Здесь проверяются СЛОВА на экране, а не то, что документ о себе обещает. Атрибут
// `<html lang>` отсюда убран (T271): он читался после гидратации, то есть не отличал
// верный ответ сервера от правки, приехавшей на клиенте. Язык ОТДАННОГО документа для
// этих же адресов проверяет `e2e/page-lang.spec.ts` — по сырому ответу сервера.
test.describe("язык страницы по заголовку браузера", () => {
  test.describe("русский телефон", () => {
    test.use({ locale: "ru-RU" });

    test("получает русский текст и ни одной cookie", async ({
      page,
      context,
    }) => {
      await page.goto("/");

      await expect(page.getByTestId("title")).toHaveText("Цифровые чек-листы");
      expect(await context.cookies()).toHaveLength(0);
    });
  });

  test.describe("английский телефон", () => {
    test.use({ locale: "en-US" });

    test("получает английский текст и ни одной cookie", async ({
      page,
      context,
    }) => {
      await page.goto("/");

      await expect(page.getByTestId("title")).toHaveText("Digital checklists");
      expect(await context.cookies()).toHaveLength(0);
    });
  });

  // Сценарий «телефон с неподдержанным языком» переехал в `page-lang.spec.ts`: он
  // утверждал только язык документа, и читал его из живой вкладки (T271).
});
