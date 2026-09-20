// Чей язык у того, что уезжает В ПИЦЦЕРИЮ: печатный лист наклеек и экран планшета
// (T273, D122).
//
// Дефект, ради которого это написано. Наклейку печатает методист из кабинета, а висит
// она на кухне, и читает её сотрудник пиццерии. Словарь же брался из `Accept-Language`
// запроса, то есть из браузера методиста. На сверке это выглядело так: пиццерия со
// страной `ru` отдала имена станций по-русски (они приходят из справочника и перевода не
// знают), а подпись под кодом — `scan with a camera`. Лист на двух языках одновременно,
// и ни одна проверка этого не видела.
//
// Почему проверка сквозная и по ОТДАННОМУ документу. Ошибка языка не падает: страница
// рисуется целиком, просто не теми словами. Увидеть её можно только сложив вместе то,
// что знает база (язык страны), то, что знает запрос (заголовок браузера), и то, что в
// итоге напечатано, — а это сходится только на живой странице. Отданный HTML берётся
// потому, что на бумагу уходит именно он: печать не ждёт гидратации, и клиентская
// починка языка до листа в принтере не доезжает.
import {
  expect,
  test,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";

import { E2E_ADMIN_PASSWORD } from "./admin-credentials";
import { seedStore, type SeededStore } from "./station-fixtures";

const QR_PATH = "/admin/qr";

/** Языки браузера методиста для матрицы — намеренно чужие языку пиццерии. */
const RU_SHEET_HINT = "отсканируйте камерой";
const EN_SHEET_HINT = "scan with a camera";
const RU_SCREEN_BACK = "К листу печати";
const EN_SCREEN_BACK = "Back to the print sheet";
/** Надпись КАБИНЕТА, а не листа: по ней видно, что язык методиста никуда не делся. */
const RU_CABINET = "Лист для печати";
const EN_CABINET = "Print sheet";

interface Stand {
  readonly context: BrowserContext;
  readonly page: Page;
  readonly store: SeededStore;
  /** Язык браузера методиста — его же несут запросы за отданным HTML (см. `deliveredHtml`). */
  readonly deviceLanguage: string;
}

/**
 * Кабинет, открытый браузером на языке `deviceLanguage`, и пиццерия с языком
 * `countryLocale`. Два языка нарочно разные: совпадающие ничего бы не различали.
 */
async function openCabinet(
  browser: Browser,
  deviceLanguage: string,
  countryLocale: "ru" | "en",
): Promise<Stand> {
  const store = await seedStore({ countryLocale });
  const context = await browser.newContext({ locale: deviceLanguage });
  const page = await context.newPage();

  await page.goto("/admin/login");
  // Форма входа говорит языком браузера — это кабинет, и он принадлежит методисту.
  await page
    .getByLabel(deviceLanguage.startsWith("ru") ? "Пароль" : "Password")
    .fill(E2E_ADMIN_PASSWORD);
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("admin-home")).toBeVisible();

  return { context, page, store, deviceLanguage };
}

/**
 * Кусок отданного HTML ВНУТРИ листа печати — ровно то, что уйдёт в принтер.
 *
 * Граница нужна настоящая, а не «весь документ»: подпись под кодом и надписи кабинета
 * живут на одной странице, и проверка «в документе есть русские буквы» прошла бы и до
 * правки. Конец листа опознаётся по началу следующей карточки — таблицы станций.
 */
function sheetFragment(html: string): string {
  const start = html.indexOf("data-print-sheet");
  expect(start, "лист печати в отданном документе").toBeGreaterThan(-1);
  const end = html.indexOf('data-testid="qr-stations"', start);
  return html.slice(start, end === -1 ? undefined : end);
}

/** Что документ обещает о себе: `<html lang>` из отданного HTML, без единого скрипта. */
function documentLang(html: string): string | undefined {
  return /<html[^>]*\slang="([^"]*)"/.exec(html)?.[1];
}

/**
 * Отданный HTML страницы при таком языке браузера — без единой строки JavaScript.
 *
 * Заголовок ставится ЯВНО, и это не перестраховка. `browser.newContext({ locale })`
 * настраивает язык страницам, но запросы `context.request` его не несут: без заголовка
 * продукт честно отвечал языком умолчания, а проверка «кабинет английский» при этом
 * оставалась зелёной — по причине, не имеющей отношения к тому, что она стережёт.
 * Поймано здесь же, на первом прогоне: английская пиццерия с русским браузером отдала
 * английский кабинет, хотя разойтись они были обязаны.
 */
async function deliveredHtml(
  request: APIRequestContext,
  path: string,
  deviceLanguage: string,
): Promise<string> {
  const response = await request.get(path, {
    headers: { "accept-language": deviceLanguage },
  });
  expect(response.status()).toBe(200);
  return await response.text();
}

test.describe("лист печати говорит языком пиццерии (T273)", () => {
  test("русская пиццерия, английский браузер методиста: лист русский целиком", async ({
    browser,
  }) => {
    const { context, page, store, deviceLanguage } = await openCabinet(
      browser,
      "en-GB",
      "ru",
    );

    const html = await deliveredHtml(
      context.request,
      `${QR_PATH}?store=${store.storeId}`,
      deviceLanguage,
    );
    const sheet = sheetFragment(html);

    // ГЛАВНОЕ: подпись под кодом — по-русски, как имена станций рядом с ней. Именно эта
    // строка и разъезжалась с ними на сверке.
    expect(sheet).toContain(RU_SHEET_HINT);
    expect(sheet).not.toContain(EN_SHEET_HINT);
    // Лист объявляет свой язык в отданном HTML: документ вокруг английский, значит
    // умолчать о языке листа нельзя — диктор прочитал бы русские слова по-английски.
    expect(/data-print-sheet[^>]*\slang="ru"/.test(html)).toBe(true);

    // И столь же важное: КАБИНЕТ остался языком методиста. Не «всё перевелось в русский»,
    // а «на бумагу уходит язык пиццерии, экран вокруг — язык того, кто им пользуется».
    expect(html).toContain(EN_CABINET);
    expect(documentLang(html)).toBe("en");

    // То же самое глазами человека: он видит обе надписи на одной странице.
    await page.goto(`${QR_PATH}?store=${store.storeId}`);
    await expect(page.getByTestId("qr-sheet")).toContainText(RU_SHEET_HINT);
    await expect(page.getByTestId("qr-print")).toContainText("Print");

    await context.close();
  });

  test("и в обратную сторону: английская пиццерия, русский браузер", async ({
    browser,
  }) => {
    // Обратная сторона не симметричное украшение: без неё проверку прошёл бы код,
    // который просто всегда печатает по-русски.
    const { context, store, deviceLanguage } = await openCabinet(
      browser,
      "ru-RU",
      "en",
    );

    const html = await deliveredHtml(
      context.request,
      `${QR_PATH}?store=${store.storeId}`,
      deviceLanguage,
    );
    const sheet = sheetFragment(html);

    expect(sheet).toContain(EN_SHEET_HINT);
    expect(sheet).not.toContain(RU_SHEET_HINT);
    expect(/data-print-sheet[^>]*\slang="en"/.test(html)).toBe(true);

    expect(html).toContain(RU_CABINET);
    expect(documentLang(html)).toBe("ru");

    await context.close();
  });
});

/**
 * ЧТО ИМЕННО ЗДЕСЬ СТЕРЕЖЁТСЯ ПРО `lang`, и почему не «документ равен содержимому».
 *
 * У публичного экрана заполнения требование именно такое (`e2e/page-lang.spec.ts`,
 * T270): там весь документ — поверхность пиццерии, его открывают по наклейке с кухонного
 * телефона, и `<html lang>` обязан назвать её язык.
 *
 * Обе поверхности QR устроены иначе: это адреса КАБИНЕТА, и документ вокруг принадлежит
 * методисту — меню, кнопка «Печать», таблица станций. Язык пиццерии здесь островом:
 * печатный лист внутри карточки и содержимое экрана планшета. Ровно для этого `lang` и
 * существует на вложенном элементе — он перекрывает язык предка для своего куска, и
 * диктор, войдя в остров, переключается сам.
 *
 * Поэтому проверка требует НЕ совпадения корня с содержимым, а того, что каждый кусок
 * объявлен верно: корень — язык методиста, остров — язык пиццерии. Требовать здесь
 * совпадения значило бы заставить корневую разметку узнавать пиццерию по параметрам
 * адреса кабинета — машинерия ради атрибута, который на планшете-витрине никто не
 * читает, и вдобавок мимо своего блока.
 *
 * Дефектом была бы третья комбинация, и её эта проверка ловит: текст на языке пиццерии
 * БЕЗ объявления рядом — тогда документ молча выдаёт его за язык методиста.
 */
test.describe("экран планшета — тоже поверхность пиццерии (T273)", () => {
  test("русская пиццерия, английский браузер: экран русский и объявлен русским", async ({
    browser,
  }) => {
    // Планшет открывают из кабинета один раз и оставляют висеть у станции: дальше его
    // читает сотрудник. Наклейка и планшет одной станции обязаны говорить одинаково —
    // иначе на одном рабочем месте оказываются два языка.
    const { context, page, store, deviceLanguage } = await openCabinet(
      browser,
      "en-GB",
      "ru",
    );

    await page.goto(`${QR_PATH}?store=${store.storeId}`);
    const screenHref = await page
      .getByTestId("qr-open-screen")
      .getAttribute("href");
    expect(screenHref).not.toBeNull();

    const html = await deliveredHtml(
      context.request,
      screenHref ?? "",
      deviceLanguage,
    );

    expect(html).toContain(RU_SCREEN_BACK);
    expect(html).not.toContain(EN_SCREEN_BACK);
    // Остров объявлен — в ОТДАННОМ HTML, без единой строки JavaScript. Отданный берётся
    // нарочно: починка языка на клиенте красила бы эту проверку зелёным уже после
    // гидратации, а встроенный браузер планшета до неё может и не дойти.
    expect(/data-testid="station-screen"[^>]*\slang="ru"/.test(html)).toBe(
      true,
    );
    // А корень остаётся языком методиста: это адрес кабинета, и подменять его языком
    // пиццерии никто не просил (см. разбор над describe).
    expect(documentLang(html)).toBe("en");

    await page.goto(screenHref ?? "");
    await expect(page.getByTestId("station-screen")).toContainText(
      RU_SCREEN_BACK,
    );
    // И в живом браузере корень тот же, что приехал по проводу. Разойтись им негде
    // только потому, что язык документа больше никто не переписывает после гидратации
    // (T272): пока это делал запасной рубеж, отданный документ и живая вкладка отвечали
    // по-разному, и зелёной была та проверка, которая смотрела позже.
    await expect(page.locator("html")).toHaveAttribute("lang", "en");

    await context.close();
  });

  test("и в обратную сторону: английская пиццерия, русский браузер", async ({
    browser,
  }) => {
    const { context, page, store, deviceLanguage } = await openCabinet(
      browser,
      "ru-RU",
      "en",
    );

    await page.goto(`${QR_PATH}?store=${store.storeId}`);
    const screenHref = await page
      .getByTestId("qr-open-screen")
      .getAttribute("href");

    const html = await deliveredHtml(
      context.request,
      screenHref ?? "",
      deviceLanguage,
    );

    expect(html).toContain(EN_SCREEN_BACK);
    expect(html).not.toContain(RU_SCREEN_BACK);
    expect(/data-testid="station-screen"[^>]*\slang="en"/.test(html)).toBe(
      true,
    );
    expect(documentLang(html)).toBe("ru");

    await context.close();
  });
});
