// Связность кабинета: с каждого экрана можно уйти в каждый готовый раздел.
//
// Заведено находкой #11. Разделы достраивались по одному, а боковая навигация у каждого своя
// (четыре копии: editor, feed, qr, catalog) — и соседи не узнавали, что раздел уже готов.
// В итоге «Заполнения» и «QR-коды» показывались надписью «Раздел ещё не готов», хотя работали,
// а из справочника нельзя было уйти вообще никуда. Продукт существовал как набор адресов, а не
// как целое: пройти путь «завёл чек-лист → напечатал коды → посмотрел заполнения» мышью было
// нельзя. Пока копии навигации не сведены в одну, эта проверка — единственное, что удерживает
// их от расхождения.
import { test, expect } from "@playwright/test";

import { E2E_ADMIN_PASSWORD } from "./admin-credentials";

/** Готовые разделы: адрес экрана и подпись, под которой он обязан быть виден с других экранов. */
const READY = [
  { key: "checklists", path: "/admin/checklists", name: "Чек-листы" },
  { key: "qr", path: "/admin/qr", name: "QR-коды" },
  { key: "feed", path: "/admin/feed", name: "Заполнения" },
  { key: "catalog", path: "/admin/catalog", name: "Страны и пиццерии" },
] as const;

/** Библиотека блоков в продукте не заведена (T027–T031) — она обязана оставаться неактивной. */
const NOT_READY_LABEL = "Библиотека блоков";

test.describe("связность разделов кабинета", () => {
  test.use({ locale: "ru-RU" });

  for (const from of READY) {
    test(`с экрана «${from.name}» доступны все остальные готовые разделы`, async ({
      page,
    }) => {
      await page.goto("/admin/login");
      await page.getByLabel("Пароль").fill(E2E_ADMIN_PASSWORD);
      await page.getByTestId("login-submit").click();
      await expect(page.getByTestId("admin-home")).toBeVisible();

      await page.goto(from.path);

      const nav = page.locator("nav").first();
      for (const to of READY) {
        // Собственный пункт тоже ссылка — так экран называет, где человек находится.
        await expect(
          nav.getByRole("link", { name: to.name, exact: true }),
        ).toHaveAttribute("href", to.path);
      }

      // Неготовое обязано выглядеть неготовым, а не ссылкой в пустоту.
      await expect(
        nav.getByRole("link", { name: NOT_READY_LABEL, exact: true }),
      ).toHaveCount(0);

      // Экран называет, где человек находится, — не только цветом пункта.
      await expect(
        nav.locator(`[data-testid="nav-${from.key}"]`),
      ).toHaveAttribute("aria-current", "page");
    });
  }

  // T088: переход обязан идти через роутер Next, а не обычным `<a href>`. Разница видна
  // только на площадке с базовым путём — обычной ссылке Next префикс не приставляет, и
  // она уводит на корень адреса, к чужому продукту. Проверяется не разметкой, а
  // поведением: клиентский переход не перезагружает окно, и метка в нём переживает переход.
  test("переход по меню идёт клиентским роутером, а не перезагрузкой страницы", async ({
    page,
  }) => {
    await page.goto("/admin/login");
    await page.getByLabel("Пароль").fill(E2E_ADMIN_PASSWORD);
    await page.getByTestId("login-submit").click();
    await expect(page.getByTestId("admin-home")).toBeVisible();

    await page.goto("/admin/checklists");
    await page.evaluate(() => {
      (window as unknown as Record<string, unknown>)["navProbe"] = "жив";
    });

    await page
      .locator("nav")
      .first()
      .getByRole("link", { name: "Заполнения", exact: true })
      .click();
    await expect(page).toHaveURL(/\/admin\/feed$/);
    await expect(page.getByTestId("feed-screen")).toBeVisible();

    const survived = await page.evaluate(
      () => (window as unknown as Record<string, unknown>)["navProbe"],
    );
    expect(survived).toBe("жив");
  });
});
