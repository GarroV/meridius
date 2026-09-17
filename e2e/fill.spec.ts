import { expect, test, type Page } from "@playwright/test";

import { stationScanUrl } from "../src/blocks/qr/scan-url";
import {
  lastSubmission,
  publishNextVersion,
  seedFillStand,
} from "./fill-fixtures";
import { E2E_PUBLIC_BASE_URL } from "./public-base-url";

/**
 * Сквозной путь продукта: человек отсканировал наклейку — заполнил — попало в базу.
 * Это критический путь, который по стандарту тестирования проекта не выходит без
 * сценария в настоящем браузере.
 */

const PHONE = { width: 375, height: 760 } as const;
const TAP_MIN = 44;

/** Путь из напечатанной наклейки. Маршрут обязан совпасть с тем, что печатает блок `qr`. */
function stickerPath(code: string): string {
  return new URL(stationScanUrl(E2E_PUBLIC_BASE_URL, code)).pathname;
}

async function answerBool(page: Page, itemId: string): Promise<void> {
  await page
    .locator(`[data-testid="fill-item"][data-item-id="${itemId}"]`)
    .tap();
}

/** Значение атрибута `lang` из сырого html: сценарий читает документ, а не вкладку. */
function langOf(pattern: RegExp, html: string): string | null {
  return pattern.exec(html)?.[1] ?? null;
}

interface Violation {
  readonly directive: string;
  readonly blocked: string;
}

async function watchViolations(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const collected: Violation[] = [];
    Object.defineProperty(globalThis, "__cspViolations", {
      value: collected,
      writable: false,
    });
    document.addEventListener("securitypolicyviolation", (event) => {
      collected.push({
        directive: event.violatedDirective,
        blocked: event.blockedURI,
      });
    });
  });
}

test.describe("экран заполнения по QR", () => {
  // Телефон на кухне, а не рабочий стол: экран проверяется на настоящих касаниях.
  test.use({
    viewport: PHONE,
    hasTouch: true,
    isMobile: true,
    locale: "en-GB",
  });

  test("наклейка ведёт на экран заполнения: маршрут совпадает с напечатанным адресом", async ({
    page,
  }) => {
    // Наклейка живёт годами: разъехавшийся маршрут означает переклейку по всей сети.
    const stand = await seedFillStand("маршрут");

    await page.goto(stickerPath(stand.code));

    await expect(page.getByTestId("fill-screen")).toBeVisible();
    await expect(page.getByText("Kitchen opening")).toBeVisible();
    await expect(page.getByText(stand.storeName)).toBeVisible();
  });

  test("сотрудник заполняет и отправляет, заполнение появляется в базе со снимком", async ({
    page,
  }) => {
    // Arrange
    const stand = await seedFillStand("сквозной");
    await page.goto(stickerPath(stand.code));

    // Act
    await answerBool(page, "i-oven");
    await page.getByTestId("fill-number").fill("172");
    await answerBool(page, "i-sauce");
    await page.getByTestId("fill-text").fill("смена спокойная");
    await expect(page.getByTestId("fill-submit")).toBeEnabled();
    await page.getByTestId("fill-submit").tap();

    // Assert: экран сказал «отправлено», и запись действительно легла в базу.
    await expect(page.getByTestId("fill-sent")).toBeVisible();

    const stored = await lastSubmission(stand.stationId);
    expect(stored?.versionId).toBe(stand.versionId);
    expect(stored?.answers.map((answer) => answer.itemId).sort()).toStrictEqual(
      ["i-fry", "i-note", "i-oven", "i-sauce"],
    );
    // Снимок пунктов — вторая опора истории (D002): он обязан лежать в самой записи.
    expect(stored?.snapshotItemIds).toStrictEqual([
      "i-oven",
      "i-fry",
      "i-sauce",
      "i-note",
    ]);
  });

  test("заполнение уходит на ту версию, что была отдана, даже если опубликовали новую", async ({
    page,
  }) => {
    // Arrange: сотрудник открыл экран и начал заполнять.
    const stand = await seedFillStand("гонка");
    await page.goto(stickerPath(stand.code));
    await answerBool(page, "i-oven");
    await page.getByTestId("fill-number").fill("172");

    // Пока он заполнял, методист опубликовал следующую версию.
    const next = await publishNextVersion(stand.stationId);
    expect(next).not.toBe(stand.versionId);

    // Act
    await answerBool(page, "i-sauce");
    await page.getByTestId("fill-text").fill("готово");
    await page.getByTestId("fill-submit").tap();
    await expect(page.getByTestId("fill-sent")).toBeVisible();

    // Assert
    const stored = await lastSubmission(stand.stationId);
    expect(stored?.versionId).toBe(stand.versionId);
    expect(stored?.snapshotItemIds).toContain("i-oven");
  });

  test("проваленный критичный пункт требует комментарий сразу под собой", async ({
    page,
  }) => {
    // Arrange
    const stand = await seedFillStand("критичный");
    await page.goto(stickerPath(stand.code));
    await answerBool(page, "i-oven");
    await page.getByTestId("fill-number").fill("172");
    await page.getByTestId("fill-text").fill("заметка");

    // Act: второе касание переводит пункт в «не выполнено».
    await answerBool(page, "i-sauce");
    await answerBool(page, "i-sauce");

    // Assert: поле комментария появилось под самим пунктом, отдельного экрана нет (D018).
    const item = page.locator(
      '[data-testid="fill-item"][data-item-id="i-sauce"]',
    );
    const comment = page.locator(
      '[data-testid="fill-comment"][data-item-id="i-sauce"]',
    );
    await expect(comment).toBeVisible();
    const itemBox = await item.boundingBox();
    const commentBox = await comment.boundingBox();
    expect(commentBox?.y ?? 0).toBeGreaterThan(itemBox?.y ?? 0);

    // Без комментария кнопка не пускает, хотя все пункты отвечены.
    await expect(page.getByTestId("fill-count")).toHaveText("4 of 4");
    await expect(page.getByTestId("fill-submit")).toBeDisabled();

    await comment.fill("нет наклеек на двух соусах");
    await expect(page.getByTestId("fill-submit")).toBeEnabled();
    await page.getByTestId("fill-submit").tap();
    await expect(page.getByTestId("fill-sent")).toBeVisible();

    const stored = await lastSubmission(stand.stationId);
    expect(
      stored?.answers.find((answer) => answer.itemId === "i-sauce")?.comment,
    ).toBe("нет наклеек на двух соусах");
  });

  test("экран живёт на 375 px: нет горизонтальной прокрутки, зоны нажатия от 44 px", async ({
    page,
  }) => {
    const stand = await seedFillStand("ширина");
    await page.goto(stickerPath(stand.code));

    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);

    // Зоны нажатия меряются не по списку знакомых опознавателей, а по всему, по чему
    // на этом экране вообще нажимают. Именно список и пропустил «сменить» 51x18 (T176):
    // проверка была зелёной, а палец на кухне мимо кнопки — промахивался. И ширина, и
    // высота: узкая кнопка промахивается не хуже низкой.
    const tappable = async (): Promise<
      { what: string; width: number; height: number }[]
    > =>
      page
        .locator(
          'button, a[href], input, select, textarea, summary, [role="button"]',
        )
        .evaluateAll((nodes) =>
          nodes
            .filter((node) => node.checkVisibility())
            .map((node) => {
              const box = node.getBoundingClientRect();
              return {
                what:
                  node.getAttribute("data-testid") ??
                  node.tagName.toLowerCase(),
                width: Math.round(box.width),
                height: Math.round(box.height),
              };
            }),
        );

    const closed = await tappable();
    expect(closed.length).toBeGreaterThan(0);
    expect(
      closed.filter((box) => box.width < TAP_MIN || box.height < TAP_MIN),
    ).toEqual([]);

    // Панель режима смены по умолчанию закрыта, а её поля — тоже зоны нажатия.
    await page.getByTestId("shift-change").tap();
    await expect(page.getByTestId("shift-panel")).toBeVisible();
    const opened = await tappable();
    expect(opened.length).toBeGreaterThan(closed.length);
    expect(
      opened.filter((box) => box.width < TAP_MIN || box.height < TAP_MIN),
    ).toEqual([]);
  });

  test("обрыв связи при отправке не теряет введённое", async ({ page }) => {
    // Arrange
    const stand = await seedFillStand("обрыв");
    await page.goto(stickerPath(stand.code));
    await answerBool(page, "i-oven");
    await page.getByTestId("fill-number").fill("172");
    await answerBool(page, "i-sauce");
    await page.getByTestId("fill-text").fill("не потерять это");

    // Act: связь рвётся ровно на отправке.
    await page.route("**/s/**", async (route) => {
      if (route.request().method() === "POST") await route.abort("failed");
      else await route.continue();
    });
    await page.getByTestId("fill-submit").tap();

    // Assert: экран прежний, ответы на месте, кнопка предлагает повторить.
    await expect(page.getByTestId("fill-notice")).toBeVisible();
    await expect(page.getByTestId("fill-screen")).toBeVisible();
    await expect(page.getByTestId("fill-count")).toHaveText("4 of 4");
    await expect(page.getByTestId("fill-text")).toHaveValue("не потерять это");

    // Связь вернулась — повтор доходит, ничего вводить заново не пришлось.
    await page.unroute("**/s/**");
    await page.getByTestId("fill-submit").tap();
    await expect(page.getByTestId("fill-sent")).toBeVisible();
    expect(await lastSubmission(stand.stationId)).not.toBeNull();
  });
});

test.describe("публичный маршрут: отказы и защита", () => {
  test.use({
    viewport: PHONE,
    hasTouch: true,
    isMobile: true,
    locale: "en-GB",
  });

  test("перебор кодов не отдаёт ничего, кроме отказа", async ({ page }) => {
    // Опора критерия готовности 8: живая станция рядом, но подобранные коды
    // не должны выдать ни её названия, ни чек-листа, ни даже другого кода ответа.
    const stand = await seedFillStand("перебор");
    const statuses: number[] = [];

    for (let index = 0; index < 5; index += 1) {
      const response = await page.goto(
        `/s/guess${String(index).padStart(5, "0")}`,
      );
      statuses.push(response?.status() ?? 0);
      await expect(page.getByTestId("fill-invalid")).toBeVisible();

      const body = await page.content();
      expect(body).not.toContain(stand.storeName);
      expect(body).not.toContain(stand.stationName);
      expect(body).not.toContain(stand.code);
      expect(body).not.toContain("Kitchen opening");
    }

    // Код ответа тоже одинаковый: разный сам по себе рассказал бы, какой код существует.
    const live = await page.goto(`/s/${stand.code}`);
    expect(new Set(statuses)).toStrictEqual(new Set([live?.status() ?? 0]));
  });

  test("для станции нет подходящего чек-листа — это отдельное состояние, без данных", async ({
    page,
  }) => {
    // Окно чек-листа заведомо мимо: станция настоящая, а заполнять сейчас нечего.
    const stand = await seedFillStand("вне окна", {
      windowStart: "03:00:00",
      windowEnd: "03:01:00",
    });

    await page.goto(`/s/${stand.code}`);

    await expect(page.getByTestId("fill-none")).toBeVisible();
    const body = await page.content();
    expect(body).not.toContain("Kitchen opening");
    expect(body).not.toContain(stand.storeName);
  });

  test("строгая политика скриптов: одноразовый ключ вместо unsafe-inline", async ({
    page,
  }) => {
    const stand = await seedFillStand("политика");
    await watchViolations(page);

    const response = await page.goto(`/s/${stand.code}`);
    const policy = response?.headers()["content-security-policy"] ?? "";

    // Публичный маршрут — единственный адрес, открытый интернету: инлайновый скрипт
    // на нём не должен исполняться только потому, что он инлайновый.
    expect(policy).toMatch(/script-src 'nonce-[^']+' 'strict-dynamic'/);
    expect(policy).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(response?.headers()["x-frame-options"]).toBe("DENY");

    // Ключ обязан быть свой на каждый ответ: постоянный ключ не защищает ни от чего.
    const again = await page.goto(`/s/${stand.code}`);
    expect(again?.headers()["content-security-policy"]).not.toBe(policy);

    // И политика не должна ломать собственный экран.
    await page.evaluate(() => document.fonts.ready);
    await expect(page.getByTestId("fill-screen")).toBeVisible();
    expect(
      await page.evaluate(
        () =>
          (globalThis as unknown as { __cspViolations: Violation[] })
            .__cspViolations,
      ),
    ).toEqual([]);
  });
});

test.describe("язык экрана заполнения", () => {
  test.use({ viewport: PHONE, hasTouch: true, isMobile: true });

  test("телефон на английском — экран английский", async ({ browser }) => {
    const stand = await seedFillStand("англ", { countryLocale: "ru" });
    const context = await browser.newContext({ locale: "en-GB" });
    const page = await context.newPage();

    await page.goto(`/s/${stand.code}`);

    await expect(page.getByText("Kitchen opening")).toBeVisible();
    await context.close();
  });

  test("язык телефона не поддержан — берётся язык страны, а не язык продукта", async ({
    browser,
  }) => {
    // Казахский телефон в казахстанской пиццерии: продукт по-казахски не говорит,
    // и показать надо русский (язык страны), а не английский по умолчанию.
    const stand = await seedFillStand("казах", { countryLocale: "ru" });
    const context = await browser.newContext({ locale: "kk-KZ" });
    const page = await context.newPage();

    await page.goto(`/s/${stand.code}`);

    await expect(page.getByText("Открытие кухни")).toBeVisible();
    // Корень содержимого, а не любой элемент с lang: с T179 язык объявляют оба — и
    // <html> (его подтягивает core/ui/HtmlLangSync к языку экрана), и сам экран.
    // Прежний селектор стал неоднозначным и падал на strict mode, хотя проверял то же.
    await expect(page.locator('body > [lang="ru"]')).toBeVisible();
    await context.close();
  });
});

test.describe("время отправки принадлежит кухне, а не телефону", () => {
  // Пояса взяты заведомо далёкие друг от друга и от пояса машины прогона: между
  // Токио и Нью-Йорком 13-14 часов, поэтому час на экране расходится всегда, а не
  // только в удачную минуту прогона. Телефон вдобавок на en-US — там часы
  // двенадцатичасовые, и одного совпадения цифр было бы мало.
  const STORE_TZ = "Asia/Tokyo";
  const PHONE_TZ = "America/New_York";

  test("телефон в чужом поясе и с 12-часовыми часами — на экране время пиццерии", async ({
    browser,
  }) => {
    // Arrange
    const stand = await seedFillStand("пояс", {
      timezone: STORE_TZ,
      countryLocale: "en",
    });
    const context = await browser.newContext({
      viewport: PHONE,
      hasTouch: true,
      isMobile: true,
      locale: "en-US",
      timezoneId: PHONE_TZ,
    });
    const page = await context.newPage();
    await page.goto(`/s/${stand.code}`);

    // Act
    await answerBool(page, "i-oven");
    await page.getByTestId("fill-number").fill("172");
    await answerBool(page, "i-sauce");
    await page.getByTestId("fill-text").fill("evening shift");
    await page.getByTestId("fill-submit").tap();
    await expect(page.getByTestId("fill-sent")).toBeVisible();

    // Assert: время на экране — то, что записано в базе, в поясе пиццерии и
    // круглыми сутками. Ожидаемое считается от записи, а не от часов прогона.
    const stored = await lastSubmission(stand.stationId);
    expect(stored).not.toBeNull();
    const at = stored?.submittedAt ?? new Date();
    const kitchenTime = new Intl.DateTimeFormat("en", {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone: STORE_TZ,
    }).format(at);
    const phoneTime = new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: PHONE_TZ,
    }).format(at);
    // Сторож самой проверки: если бы часы совпали, она прошла бы и на старом коде.
    expect(phoneTime).not.toBe(kitchenTime);

    await expect(page.getByTestId("fill-sent")).toContainText(
      `Sent at ${kitchenTime}`,
    );
    await expect(page.getByTestId("fill-sent")).not.toContainText(phoneTime);

    await context.close();
  });
});

test.describe("числовой пункт называет свои границы", () => {
  test.use({
    viewport: PHONE,
    hasTouch: true,
    isMobile: true,
    locale: "en-GB",
  });

  test("границы видны у поля ДО набора значения, а не только после провала", async ({
    page,
  }) => {
    // Arrange: пункт «температура фритюра» с границами 160…180.
    const stand = await seedFillStand("границы");
    await page.goto(stickerPath(stand.code));

    // Assert: поле ещё пустое, а допустимое уже названо. До T233 здесь было пусто,
    // и сотрудник узнавал о диапазоне только когда продукт потребовал комментарий.
    const label = page.locator(
      '[data-testid="fill-number-range"][data-item-id="i-fry"]',
    );
    await expect(label).toHaveText("160…180");

    // Act: значение вне границ — рядом с ними появляется вердикт, границы остаются.
    await page.getByTestId("fill-number").fill("200");
    await expect(label).toHaveText("160…180 · out of range");

    await page.getByTestId("fill-number").fill("172");
    await expect(label).toHaveText("160…180 · within range");
  });
});

test.describe("язык документа на отказе по коду", () => {
  /**
   * Запрос идёт СЫРЫМ `fetch`, а не браузером, и по двум причинам сразу.
   * Первая: браузер Playwright всегда шлёт `Accept-Language`, а расхождение живёт
   * именно на запросе БЕЗ него — так ходит встроенный браузер сканера QR, с которого
   * на этот экран и попадают. Вторая: `HtmlLangSync` чинит `<html lang>` после
   * гидратации, и в живой вкладке проверка была бы зелёной поверх кривого документа.
   * Синтезатор речи и браузерный перевод читают то, что пришло по проводу.
   */
  test("без Accept-Language документ объявляет тот же язык, на котором говорит", async ({
    baseURL,
  }) => {
    // Act
    const response = await fetch(`${baseURL ?? ""}/s/zzzzzzzzzz`);
    const html = await response.text();

    // Assert
    const documentLang = langOf(/<html[^>]*\slang="([a-z-]+)"/, html);
    const contentLang = langOf(/<div lang="([a-z-]+)"/, html);
    expect(contentLang).not.toBeNull();
    expect(documentLang).toBe(contentLang);
    // И это именно русский — последнее звено цепочки экрана заполнения, а не язык
    // продукта: иначе проверка прошла бы, если оба съехали бы в английский.
    expect(documentLang).toBe("ru");
    expect(html).toContain("Этот код не работает");
  });

  test("с Accept-Language язык остаётся языком телефона", async ({
    baseURL,
  }) => {
    const response = await fetch(`${baseURL ?? ""}/s/zzzzzzzzzz`, {
      headers: { "accept-language": "en-GB,en;q=0.9" },
    });
    const html = await response.text();

    expect(langOf(/<html[^>]*\slang="([a-z-]+)"/, html)).toBe("en");
    expect(langOf(/<div lang="([a-z-]+)"/, html)).toBe("en");
  });
});
