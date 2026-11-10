// Посадочная /welcome (D193): корень анониму не показывает ничего, а уводит сюда.
//
// Проверяется то, что видит человек: куда ведут двери («Sign in» — на вход, «Open demo»
// — только если адрес демо задан), какой язык, влезает ли страница в телефон и нет ли
// нарушений доступности. Кнопка демо при заданном `DEMO_URL` проверена модульно
// (`landing/demo-link.test.ts`) и смоуком с запущенным продуктом: сервер сквозных
// сценариев поднимается без `DEMO_URL`, а второй сервер ради одной кнопки не стоит.
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { E2E_ADMIN_PASSWORD } from "./admin-credentials";

const PHONE = { width: 375, height: 812 } as const;
const DESKTOP = { width: 1440, height: 900 } as const;
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

test.describe("посадочная для анонима", () => {
  test.use({ locale: "en-US" });

  test("корень уводит анонима на /welcome", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveURL(/\/welcome$/);
    await expect(page.getByTestId("welcome")).toBeVisible();
  });

  test("явный ?lang=ru на корне доезжает до посадочной и запоминается", async ({
    page,
    context,
  }) => {
    await page.goto("/?lang=ru");

    await expect(page).toHaveURL(/\/welcome$/);
    await expect(page.getByTestId("title")).toHaveText(
      "Чек-листы, которые кухня действительно заполняет",
    );
    await expect(page.locator("html")).toHaveAttribute("lang", "ru");
    const cookie = (await context.cookies()).find(
      (item) => item.name === "NEXT_LOCALE",
    );
    expect(cookie?.value).toBe("ru");
  });

  test("переключатель языка меняет язык страницы", async ({ page }) => {
    await page.goto("/welcome");
    await expect(page.getByTestId("title")).toHaveText(
      "Checklists the kitchen actually fills in",
    );

    await page.getByTestId("locale-ru").click();

    await expect(page.getByTestId("title")).toHaveText(
      "Чек-листы, которые кухня действительно заполняет",
    );
  });

  test("«Sign in» ведёт на форму входа", async ({ page }) => {
    await page.goto("/welcome");

    await page.getByTestId("welcome-login").click();

    await expect(page).toHaveURL(/\/admin\/login$/);
    await expect(page.getByTestId("login-screen")).toBeVisible();
  });

  test("без адреса демо кнопки «Open demo» нет", async ({ page }) => {
    await page.goto("/welcome");

    await expect(page.getByTestId("title")).toBeVisible();
    await expect(page.getByTestId("welcome-demo-hero")).toHaveCount(0);
    await expect(page.getByTestId("welcome-demo-bar")).toHaveCount(0);
    await expect(page.getByTestId("welcome-demo-final")).toHaveCount(0);
  });

  test("до съёмки снимков страница не показывает битых картинок", async ({
    page,
  }) => {
    await page.goto("/welcome");

    const broken = await page.evaluate(
      () =>
        [...document.images].filter(
          (image) => image.complete && image.naturalWidth === 0,
        ).length,
    );
    expect(broken).toBe(0);
  });

  for (const locale of ["en", "ru"] as const) {
    for (const viewport of [PHONE, DESKTOP]) {
      test(`${locale}, ${String(viewport.width)} px: без горизонтальной прокрутки`, async ({
        page,
      }) => {
        await page.setViewportSize(viewport);
        await page.goto(`/welcome?lang=${locale}`);
        await expect(page.getByTestId("title")).toBeVisible();

        const overflow = await page.evaluate(
          () =>
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
        );
        expect(overflow).toBeLessThanOrEqual(0);
      });
    }

    test(`${locale}: доступность по WCAG 2.1 AA`, async ({ page }) => {
      await page.setViewportSize(PHONE);
      await page.goto(`/welcome?lang=${locale}`);
      await expect(page.getByTestId("title")).toBeVisible();

      const results = await new AxeBuilder({ page })
        .withTags(AXE_TAGS)
        .analyze();

      expect(
        results.violations.map(
          (violation) =>
            `${violation.id}: ${violation.help} → ${violation.nodes
              .map((node) => node.target.join(" "))
              .join(", ")}`,
        ),
      ).toEqual([]);
      // Пустой прогон не должен выглядеть пройденной проверкой.
      expect(results.passes.length).toBeGreaterThan(0);
    });
  }
});

test.describe("корень для вошедшего", () => {
  test("вошедшего корень ведёт в кабинет, а не на посадочную", async ({
    page,
  }) => {
    await page.goto("/admin/login");
    await page.locator('input[name="login"]').fill("admin");
    await page.getByLabel(/пароль|password/i).fill(E2E_ADMIN_PASSWORD);
    await page.getByTestId("login-submit").click();
    await expect(page).toHaveURL(/\/admin$/);

    await page.goto("/");

    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByTestId("admin-home")).toBeVisible();
  });
});
