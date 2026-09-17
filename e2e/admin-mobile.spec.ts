// Кабинет на телефоне: каркас обязан отдавать содержимому весь экран (T193, дефект #73).
//
// Что было. `.app` держал `grid-template-columns: 208px 1fr` и НИ ОДНОГО `@media` во
// всём эталоне. На 375 px боковое меню оставалось колонкой фиксированной ширины, и
// содержимому доставалось ~165 px из 375: заголовок в три строки, крошки в пять,
// значения в списках обрезаны. Нечитаемым экран делал именно каркас, поэтому правки
// ширины внутри блоков чинили симптом.
//
// Чего от продукта требуют. Решение владельца D092, дословно: «Должна быть хоть
// какая-то возможность, чтобы человек мог поправить. Про полноценную работу речи не
// идёт». То есть НЕ переработка экранов под телефон: таблицы и сетки остаются со своей
// прокруткой, сложные разборы остаются настольными. Обязательны схлопывающееся меню и
// читаемые заголовки, списки и кнопки. Граница — `--page-fold: 768px` из эталона.
//
// Поэтому проверки ниже ровно про каркас, а не про содержимое разделов: колонка
// содержимого получает весь экран, страница целиком не едет вбок, меню остаётся рабочим
// (все разделы достижимы), а на настольной ширине каркас прежний.
import { test, expect, type Page } from "@playwright/test";

import { E2E_ADMIN_PASSWORD } from "./admin-credentials";

/** Экран телефона из спеки: 375 px — самый узкий, на котором продукт обязан работать. */
const PHONE = { width: 375, height: 812 } as const;
/** Настольная ширина: выше `--page-fold`, каркас обязан остаться прежним. */
const DESKTOP = { width: 1280, height: 900 } as const;

/** Ширина бокового меню в эталоне. Ниже складки её не должно быть вовсе. */
const NAV_COLUMN = 208;

/**
 * Все пять разделов кабинета плюс главная. Правка каркаса задевает каждый из них,
 * поэтому проверяются все, а не один показательный.
 */
const SCREENS = [
  { name: "главная", path: "/admin" },
  { name: "чек-листы", path: "/admin/checklists" },
  { name: "библиотека блоков", path: "/admin/library" },
  { name: "заполнения", path: "/admin/feed" },
  { name: "справочник", path: "/admin/catalog" },
  { name: "QR-коды", path: "/admin/qr" },
] as const;

async function signIn(page: Page): Promise<void> {
  await page.goto("/admin/login");
  await page.getByLabel("Пароль").fill(E2E_ADMIN_PASSWORD);
  await page.getByTestId("login-submit").click();
  await page.waitForURL(/\/admin(?!\/login)/);
}

/**
 * Ширина колонки содержимого, ширина документа и — если документ шире экрана — тот
 * элемент, который его растягивает. Виновник в сообщении не для красоты: прошлый раз
 * красный гейт сообщал одно число, и на поиск элемента ушёл отдельный прогон.
 */
async function frameWidths(page: Page): Promise<{
  main: number;
  document: number;
  viewport: number;
  widest: string;
}> {
  return page.evaluate(() => {
    const main = document.querySelector<HTMLElement>(
      "[data-testid='admin-main']",
    );
    const viewport = window.innerWidth;

    let widest = "—";
    let widestRight = viewport;
    for (const element of document.querySelectorAll<HTMLElement>("body *")) {
      const box = element.getBoundingClientRect();
      if (box.right <= widestRight) continue;
      widestRight = box.right;
      const id = element.dataset["testid"];
      widest = `<${element.tagName.toLowerCase()}${
        id === undefined ? "" : ` data-testid="${id}"`
      } class="${element.className.toString().slice(0, 90)}"> правый край ${String(
        Math.round(box.right),
      )}`;
    }

    return {
      main: main?.getBoundingClientRect().width ?? 0,
      document: document.documentElement.scrollWidth,
      viewport,
      widest,
    };
  });
}

test.describe("каркас кабинета на 375 px", () => {
  test.use({ viewport: PHONE, locale: "ru-RU" });

  for (const screen of SCREENS) {
    test(`${screen.name}: содержимое получает весь экран, а не остаток от меню`, async ({
      page,
    }) => {
      await signIn(page);
      await page.goto(screen.path);

      const { main, viewport } = await frameWidths(page);

      // Главное утверждение задачи. До правки здесь было ~167 px из 375 — и ровно из
      // этого получались заголовок в три строки и обрезанные значения.
      expect(
        main,
        `колонка содержимого ${String(Math.round(main))} px при экране ${String(viewport)} px`,
      ).toBeGreaterThan(viewport - NAV_COLUMN / 2);
    });

    test(`${screen.name}: страница целиком не едет вбок`, async ({ page }) => {
      await signIn(page);
      await page.goto(screen.path);

      const {
        document: documentWidth,
        viewport,
        widest,
      } = await frameWidths(page);

      // Именно документ, а не отдельная таблица: таблице своя горизонтальная прокрутка
      // разрешена решением D092, а вот вся страница уезжать вбок не имеет права —
      // тогда заголовок и кнопки уходят за край и человек их не находит.
      expect(
        documentWidth,
        `ширина документа ${String(documentWidth)} px при экране ${String(viewport)} px; дальше всех вправо: ${widest}`,
      ).toBeLessThanOrEqual(viewport);

      // Число выше — признак, а вот это уже сам факт: можно ли утащить страницу вбок
      // пальцем. Проверка добавлена после разбора: ширину документа раздували поля
      // `sr-only` (их ставят ради программ чтения с экрана), и по одному числу было не
      // видно, уезжает ли что-то на самом деле. Уезжало — на 299 px вместе с заголовком.
      const dragged = await page.evaluate(() => {
        window.scrollTo(500, 0);
        const moved = window.scrollX;
        window.scrollTo(0, 0);
        return moved;
      });
      expect(dragged, `страницу утащило вбок на ${String(dragged)} px`).toBe(0);
    });
  }

  // Отдельный случай, и вот почему. Пустой раздел выглядел починенным: поля `sr-only`
  // появляются вместе с содержимым, и без данных страницу вбок не утаскивало. То есть
  // проверка «зашёл и померил» была зелёной ровно там, где дефект жил. Поэтому здесь
  // раздел приводится в рабочее состояние САМ, а не достаётся от соседнего прогона.
  test("библиотека с заведённым блоком: страницу всё равно не утаскивает вбок", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/admin/library");
    await page.getByTestId("new-block").click();
    await page.getByTestId("library-list").waitFor();

    const {
      document: documentWidth,
      viewport,
      widest,
    } = await frameWidths(page);
    expect(
      documentWidth,
      `ширина документа ${String(documentWidth)} px при экране ${String(viewport)} px; дальше всех вправо: ${widest}`,
    ).toBeLessThanOrEqual(viewport);

    const dragged = await page.evaluate(() => {
      window.scrollTo(500, 0);
      const moved = window.scrollX;
      window.scrollTo(0, 0);
      return moved;
    });
    expect(dragged, `страницу утащило вбок на ${String(dragged)} px`).toBe(0);
  });
  test("меню остаётся рабочим: все пять разделов достижимы", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/admin");

    for (const key of ["checklists", "library", "feed", "catalog", "qr"]) {
      const item = page.getByTestId(`nav-${key}`);
      await expect(item, `пункт меню ${key}`).toBeVisible();
    }
  });
});

test.describe("каркас кабинета на настольной ширине", () => {
  test.use({ viewport: DESKTOP, locale: "ru-RU" });

  test("меню остаётся боковой колонкой 208 px", async ({ page }) => {
    await signIn(page);
    await page.goto("/admin");

    const nav = await page
      .locator("nav")
      .first()
      .evaluate((element) => element.getBoundingClientRect().width);

    expect(Math.round(nav)).toBe(NAV_COLUMN);
  });
});
