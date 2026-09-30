// Печать наклеек пачкой из раздела «Станции»: галочки в колонке → лист на отмеченные.
//
// Проверяется путь, который не видит ни один разбор: галочка живёт в колонке (разметка
// сегмента), форма — в рабочей зоне справа, связаны они атрибутом `form`, а на лист
// выбор уезжает обычным GET. Сломайся любое из звеньев — кнопка отработает, а лист
// выйдет пустым или на чужие станции, и заметит это только человек у принтера.
//
// Две пиццерии из РАЗНЫХ стран — нарочно: пачка собирает станции по сети, и каждая
// пиццерия получает свой лист на своём языке (D122), а не на языке методиста.
import { expect, test } from "@playwright/test";

import { E2E_ADMIN_PASSWORD } from "./admin-credentials";
import { seedStore } from "./station-fixtures";

test.describe("раздел «Станции»: наклейки пачкой", () => {
  test.use({ locale: "ru-RU" });

  test("отмеченные станции двух стран печатаются одним листом, каждая на своём языке", async ({
    page,
  }) => {
    const russian = await seedStore({ countryLocale: "ru" });
    const english = await seedStore({ countryLocale: "en" });
    const [ruStation] = russian.stationNames;
    const [enStation] = english.stationNames;
    if (ruStation === undefined || enStation === undefined) {
      throw new Error("Фикстура не завела станций");
    }

    await page.goto("/admin/login");
    await page.getByLabel("Пароль").fill(E2E_ADMIN_PASSWORD);
    await page.locator('input[name="login"]').fill("admin");
    await page.getByTestId("login-submit").click();
    await expect(page.getByTestId("admin-home")).toBeVisible();

    await page.goto("/admin/stations");
    const rowOf = (name: string) =>
      page.getByTestId("station-row").filter({ hasText: name });
    await rowOf(ruStation).getByTestId("station-pick").check();
    await rowOf(enStation).getByTestId("station-pick").check();
    await page.getByTestId("stickers-submit").click();

    await expect(page.getByTestId("stickers-screen")).toBeVisible();
    // Адрес чистый: в нём только выбор, без шаблона и служебного поля формы.
    const params = new URL(page.url()).searchParams;
    expect([...params.keys()].every((key) => key === "stationIds")).toBe(true);
    expect(params.getAll("stationIds")).toHaveLength(2);

    // Лист — тот же, что в разделе QR, по одному на пиццерию; язык объявлен у листа.
    await expect(page.getByTestId("qr-sticker")).toHaveCount(2);
    const ruSheet = page.getByTestId("qr-sheet").filter({ hasText: ruStation });
    const enSheet = page.getByTestId("qr-sheet").filter({ hasText: enStation });
    await expect(ruSheet).toHaveAttribute("lang", "ru");
    await expect(ruSheet).toContainText(russian.storeName);
    await expect(ruSheet).not.toContainText(enStation);
    await expect(enSheet).toHaveAttribute("lang", "en");
    await expect(enSheet).toContainText(english.storeName);
    await expect(ruSheet.getByTestId("qr-sticker").locator("svg")).toHaveCount(
      1,
    );
    await expect(page.getByTestId("qr-print")).toBeVisible();
  });

  test("без отмеченных станций лист говорит, что делать, и печатать не предлагает", async ({
    page,
  }) => {
    await page.goto("/admin/login");
    await page.getByLabel("Пароль").fill(E2E_ADMIN_PASSWORD);
    await page.locator('input[name="login"]').fill("admin");
    await page.getByTestId("login-submit").click();
    await expect(page.getByTestId("admin-home")).toBeVisible();

    await page.goto("/admin/stations");
    await page.getByTestId("stickers-submit").click();

    await expect(page.getByTestId("stickers-empty")).toBeVisible();
    await expect(page.getByTestId("qr-print")).toHaveCount(0);
  });
});
