import { expect, test } from "@playwright/test";

// Расхождение с эталоном, найденное блоком auth на экране входа, оказалось не про вход:
// шрифт эталона не был подключён вовсе, а база текста оставалась браузерной (16px).
// На одном экране это 4 px, на десяти — разъехавшийся продукт. Проверяется на обоих
// уже построенных экранах, чтобы правило держалось не только там, где его заметили.
const SCREENS = ["/", "/admin/login"] as const;

// Значения из docs/furca/design/reference/dodo-ds.css: --fs-body / --lh-body.
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
      // Первым в списке — само семейство канона, а не запасное. Одного этого мало:
      // имя в токене стоит и тогда, когда файла нет вовсе, — поэтому следующая проверка
      // спрашивает браузер, доехало ли начертание.
      expect(base.fontFamily).toMatch(/^"Golos Text",/);
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

      const golos = faces.filter((face) => face.family.includes("Golos Text"));
      expect(golos.length).toBeGreaterThan(0);
      expect(golos.some((face) => face.status === "loaded")).toBe(true);
    });
  }

  test("моноширинное семейство эталона подключено и доступно экранам", async ({
    page,
  }) => {
    // Служебное — счётчики, роль, подсказки клавиш — канон набирает IBM Plex Mono
    // (эталон Swarm, D164). Проверяется значение токена --font-mono, а не начертание
    // какой-то строки экрана: на входе моноширинного текста может не быть вовсе.
    await page.goto("/");

    const family = await page
      .locator("body")
      .evaluate((element) =>
        globalThis.getComputedStyle(element).getPropertyValue("--font-mono"),
      );

    expect(family.trim()).toMatch(/^['"]IBM Plex Mono['"]/);
  });

  test("шрифты раздаёт само приложение, а не чужой домен", async ({ page }) => {
    // Канон грузит их из Google Fonts только в прототипе. Продукту так нельзя: на кухне
    // связь слабая,
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
