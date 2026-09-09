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
  { key: "library", path: "/admin/library", name: "Библиотека блоков" },
  { key: "qr", path: "/admin/qr", name: "QR-коды" },
  { key: "feed", path: "/admin/feed", name: "Заполнения" },
  { key: "catalog", path: "/admin/catalog", name: "Страны и пиццерии" },
] as const;

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

      // Неготовых разделов в кабинете не осталось: библиотека блоков была последним,
      // и она появилась вместе с блоком `library`. Появится новый неготовый раздел —
      // сюда вернётся и проверка, что он не притворяется ссылкой.
    });
  }
});
