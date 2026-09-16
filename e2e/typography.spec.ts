import { expect, test } from "@playwright/test";

// Расхождение с эталоном, найденное блоком auth на экране входа, оказалось не про вход:
// шрифт эталона не был подключён вовсе, а база текста оставалась браузерной (16px).
// На одном экране это 4 px, на десяти — разъехавшийся продукт. Проверяется на обоих
// уже построенных экранах, чтобы правило держалось не только там, где его заметили.
const SCREENS = ["/", "/admin/login"] as const;

// Значения из docs/furca/design/reference/tokens.css: --fs-body / --lh-body.
const BASE_FONT_SIZE = "13px";
const BASE_LINE_HEIGHT = "18px";

const FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

test.describe("типографика по эталону", () => {
  for (const screen of SCREENS) {
    test(`база текста на ${screen} — размеры токенов, а не браузерные`, async ({
      page,
    }) => {
      await page.goto(screen);

      const base = await page.locator("body").evaluate((element) => {
        const style = globalThis.getComputedStyle(element);
        return {
          fontSize: style.fontSize,
          lineHeight: style.lineHeight,
          fontFamily: style.fontFamily,
        };
      });

      expect(base.fontSize).toBe(BASE_FONT_SIZE);
      expect(base.lineHeight).toBe(BASE_LINE_HEIGHT);
      // Первым в списке — само семейство эталона, а не запасное. Второе имя,
      // «Golos Text Fallback», выставляет next/font: это подогнанный по метрикам
      // системный шрифт на время загрузки, и его наличие отличает подключённый
      // шрифт от простого упоминания имени в токене.
      expect(base.fontFamily).toMatch(/^"Golos Text", "Golos Text Fallback"/);
    });

    test(`Golos Text на ${screen} действительно загружен, а не только объявлен`, async ({
      page,
    }) => {
      await page.goto(screen);

      // Объявить семейство мало: пока файл не доехал, браузер рисует запасным, и строка
      // расходится с эталоном — ровно это блок auth и намерил на экране входа.
      const faces = await page.evaluate(async () => {
        await document.fonts.ready;
        return [...document.fonts].map((face) => ({
          family: face.family,
          status: face.status,
        }));
      });

      const golos = faces.filter((face) => face.family.includes("Golos"));
      expect(golos.length).toBeGreaterThan(0);
      expect(golos.some((face) => face.status === "loaded")).toBe(true);
    });
  }

  test("моноширинное семейство эталона подключено и доступно экранам", async ({
    page,
  }) => {
    // Числа, время и коды станций эталон набирает IBM Plex Mono. Экранов с ними ещё нет,
    // поэтому проверяется то, что им достанется: значение токена --font-num.
    await page.goto("/");

    const family = await page
      .locator("body")
      .evaluate((element) =>
        globalThis.getComputedStyle(element).getPropertyValue("--font-num"),
      );

    expect(family).toMatch(/^"IBM Plex Mono", "IBM Plex Mono Fallback"/);
  });

  test("шрифты раздаёт само приложение, а не чужой домен", async ({ page }) => {
    // Эталон грузит их из Google Fonts. Продукту так нельзя: на кухне связь слабая,
    // и первый экран не должен ждать стороннего домена. Плюс ни одного запроса наружу.
    const fontRequests: string[] = [];
    page.on("request", (request) => {
      if (request.resourceType() === "font") fontRequests.push(request.url());
    });

    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);

    expect(fontRequests.length).toBeGreaterThan(0);
    for (const url of fontRequests) {
      expect(new URL(url).host).toBe("localhost:" + new URL(page.url()).port);
    }
    const outside = fontRequests.filter((url) =>
      FONT_HOSTS.some((host) => url.includes(host)),
    );
    expect(outside).toEqual([]);
  });
});
