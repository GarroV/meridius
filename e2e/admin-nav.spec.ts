// Связность кабинета: с каждого экрана можно уйти в каждый готовый раздел.
//
// Заведено находкой #11. Разделы достраивались по одному, а боковая навигация у каждого своя
// (четыре копии: editor, feed, qr, catalog) — и соседи не узнавали, что раздел уже готов.
// В итоге «Заполнения» и «QR-коды» показывались надписью «Раздел ещё не готов», хотя работали,
// а из справочника нельзя было уйти вообще никуда. Продукт существовал как набор адресов, а не
// как целое: пройти путь «завёл чек-лист → напечатал коды → посмотрел заполнения» мышью было
// нельзя. Копии сведены в один каркас (`core/ui/AdminShell.tsx`, T074 и T112), но проверка
// остаётся: она держит не разметку, а сам факт, что из любой точки кабинета виден весь
// кабинет, — и ловит расхождение раньше, чем его увидит человек.
import { test, expect, type Page } from "@playwright/test";

import { E2E_ADMIN_PASSWORD } from "./admin-credentials";

/**
 * Готовые разделы: адрес экрана, подпись, под которой раздел обязан быть виден с других
 * экранов, и метка самого экрана — по ней видно, что переход не просто сменил адрес,
 * а действительно открыл раздел.
 */
const READY = [
  {
    key: "checklists",
    path: "/admin/checklists",
    name: "Чек-листы",
    screen: "checklists-screen",
  },
  {
    key: "library",
    path: "/admin/library",
    name: "Библиотека блоков",
    screen: "library-screen",
  },
  { key: "qr", path: "/admin/qr", name: "QR-коды", screen: "qr-screen" },
  {
    key: "feed",
    path: "/admin/feed",
    name: "Заполнения",
    screen: "feed-screen",
  },
  {
    key: "catalog",
    path: "/admin/catalog",
    name: "Страны и пиццерии",
    screen: "catalog-screen",
  },
  {
    key: "devices",
    path: "/admin/devices",
    name: "Устройства",
    screen: "devices-screen",
  },
] as const;

/** Вход как им пользуются: форма, пароль, первый экран кабинета. */
async function signIn(page: Page): Promise<void> {
  await page.goto("/admin/login");
  await page.getByLabel("Пароль").fill(E2E_ADMIN_PASSWORD);
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("admin-home")).toBeVisible();
}

/** Все готовые разделы видны в меню и ведут туда, куда написано. */
async function expectMenuLeadsEverywhere(page: Page): Promise<void> {
  const nav = page.locator("nav").first();
  for (const to of READY) {
    // Собственный пункт тоже ссылка — так экран называет, где человек находится.
    await expect(
      nav.getByRole("link", { name: to.name, exact: true }),
    ).toHaveAttribute("href", to.path);
  }
}

test.describe("связность разделов кабинета", () => {
  test.use({ locale: "ru-RU" });

  for (const from of READY) {
    test(`с экрана «${from.name}» доступны все остальные готовые разделы`, async ({
      page,
    }) => {
      await signIn(page);

      await page.goto(from.path);

      await expectMenuLeadsEverywhere(page);
      const nav = page.locator("nav").first();

      // Неготовых разделов в кабинете не осталось: библиотека блоков была последним,
      // и она появилась вместе с блоком `library`. Появится новый неготовый раздел —
      // сюда вернётся и проверка, что он не притворяется ссылкой.

      // Экран называет, где человек находится, — не только цветом пункта.
      await expect(
        nav.locator(`[data-testid="nav-${from.key}"]`),
      ).toHaveAttribute("aria-current", "page");
    });
  }

  // T112. Первый экран после входа шёл БЕЗ каркаса: ни меню, ни верхней полосы — вошедший
  // попадал на страницу, которая выглядит как другое приложение, и уйти с неё мог только
  // по карточкам разделов. Ни один сценарий этого не ловил: список выше перебирает разделы,
  // а главная разделом не является, и в перебор не попадала.
  test("главная кабинета отдаёт меню, как и все остальные экраны", async ({
    page,
  }) => {
    await signIn(page);

    await expectMenuLeadsEverywhere(page);

    // Главная — не раздел, поэтому подсвечивать в меню нечего. Это единственный экран
    // кабинета без выбранного пункта, и каркас обязан его переживать.
    await expect(
      page.locator("nav").first().locator("[aria-current]"),
    ).toHaveCount(0);
  });

  for (const to of READY) {
    test(`с главной кабинета мышью по меню открывается раздел «${to.name}»`, async ({
      page,
    }) => {
      await signIn(page);

      await page
        .locator("nav")
        .first()
        .getByRole("link", { name: to.name, exact: true })
        .click();

      await expect(page).toHaveURL(new RegExp(`${to.path}$`));
      // Адрес сменился — мало: раздел обязан отрисоваться, а не отдать пустоту или отказ.
      await expect(page.getByTestId(to.screen)).toBeVisible();
    });
  }

  // T124. Из раздела в главную кабинета вернуться было нечем, кроме кнопки браузера:
  // меню перечисляет разделы, а главная разделом не является и пункта в нём не имеет.
  // Бренд наверху меню выглядел как заголовок продукта и не нажимался. Асимметрия: в любой
  // раздел из главной — мышью, обратно — только назад браузером или адресом наизусть.
  for (const from of READY) {
    test(`с экрана «${from.name}» бренд в меню возвращает на главную`, async ({
      page,
    }) => {
      await signIn(page);
      await page.goto(from.path);

      const brand = page.locator("nav").first().getByTestId("nav-home");
      await expect(brand).toHaveAttribute("href", "/admin");

      // Метка переживает клиентский переход и не переживает перезагрузку — так видно,
      // что бренд идёт через роутер Next, а не обычным `<a href>` (T088, D046).
      await page.evaluate(() => {
        (window as unknown as Record<string, unknown>)["brandProbe"] = "жив";
      });
      await brand.click();

      await expect(page).toHaveURL(/\/admin$/);
      await expect(page.getByTestId("admin-home")).toBeVisible();
      expect(
        await page.evaluate(
          () => (window as unknown as Record<string, unknown>)["brandProbe"],
        ),
      ).toBe("жив");
    });
  }

  // T088: переход обязан идти через роутер Next, а не обычным `<a href>`. Разница видна
  // только на площадке с базовым путём — обычной ссылке Next префикс не приставляет, и
  // она уводит на корень адреса, к чужому продукту. Проверяется не разметкой, а
  // поведением: клиентский переход не перезагружает окно, и метка в нём переживает переход.
  test("переход по меню идёт клиентским роутером, а не перезагрузкой страницы", async ({
    page,
  }) => {
    await signIn(page);

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
