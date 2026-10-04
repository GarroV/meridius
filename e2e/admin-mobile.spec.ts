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
// Ширина панели ядра на широком экране (`.sidenav`, эталон Swarm, D164).
const NAV_COLUMN = 216;

/**
 * Все пять разделов кабинета плюс главная. Правка каркаса задевает каждый из них,
 * поэтому проверяются все, а не один показательный.
 */
const SCREENS = [
  { name: "главная", path: "/admin" },
  { name: "чек-листы", path: "/admin/checklists" },
  { name: "библиотека блоков", path: "/admin/library" },
  { name: "статистика", path: "/admin/feed" },
  { name: "справочник", path: "/admin/catalog" },
  { name: "станции", path: "/admin/stations" },
] as const;

async function signIn(page: Page): Promise<void> {
  await page.goto("/admin/login");
  await page.getByLabel("Пароль").fill(E2E_ADMIN_PASSWORD);
  await page.locator('input[name="login"]').fill("admin");
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
    // Колонка содержимого — та, что видна: у разделов мастер-детали (D162) без
    // выбранного элемента телефон показывает колонку списка, а рабочую зону прячет.
    const columns = [
      ...document.querySelectorAll<HTMLElement>(
        "[data-testid='admin-main'], [data-testid='master-rail']",
      ),
    ].map((element) => element.getBoundingClientRect().width);
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
      } class="${(element.getAttribute("class") ?? "").slice(0, 90)}"> правый край ${String(
        Math.round(box.right),
      )}`;
    }

    return {
      main: Math.max(0, ...columns),
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
  // T352: ниже складки — как у DECIMUS и Swarm: сверху полоса марки во всю ширину,
  // снизу панель разделов, левой панели нет; содержимое между ними и под панель
  // разделов не уходит.
  test("сверху полоса марки, снизу панель разделов, содержимое между ними", async ({
    page,
  }) => {
    await signIn(page);
    for (const screen of SCREENS) {
      await page.goto(screen.path);
      await expect(
        page.locator("nav.sidenav"),
        `${screen.name}: левая панель видна на телефоне`,
      ).toBeHidden();
      const bar = await page
        .getByTestId("admin-mbar")
        .evaluate(
          (element) => element.getBoundingClientRect().toJSON() as DOMRect,
        );
      expect(
        Math.round(bar.width),
        `${screen.name}: ширина полосы марки ${String(Math.round(bar.width))} px — не во всю ширину`,
      ).toBe(PHONE.width);
      expect(
        bar.height,
        `${screen.name}: высота полосы марки ${String(Math.round(bar.height))} px`,
      ).toBeLessThan(60);

      const content = page
        .locator("[data-testid='admin-main'], [data-testid='master-rail']")
        .filter({ visible: true })
        .first();
      const top = await content.evaluate(
        (element) => element.getBoundingClientRect().top,
      );
      expect(
        top,
        `${screen.name}: содержимое начинается выше нижнего края полосы марки`,
      ).toBeGreaterThanOrEqual(bar.top + bar.height - 1);

      // Прокрученное до конца содержимое заканчивается над панелью разделов, а не под ней.
      await page.evaluate(() => {
        window.scrollTo(0, document.documentElement.scrollHeight);
      });
      const tabs = await page
        .getByTestId("admin-tabbar")
        .evaluate(
          (element) => element.getBoundingClientRect().toJSON() as DOMRect,
        );
      expect(
        Math.round(tabs.bottom),
        `${screen.name}: панель разделов не прибита к низу экрана`,
      ).toBe(PHONE.height);
      const bottom = await content.evaluate(
        (element) => element.getBoundingClientRect().bottom,
      );
      expect(
        bottom,
        `${screen.name}: конец содержимого уходит под панель разделов`,
      ).toBeLessThanOrEqual(tabs.top + 1);
    }
  });

  // D183: внизу четыре таба, как в Swarm, — Главная, Станции, Статистика, «Ещё»;
  // остальные разделы, тема и язык — в листе «Ещё». Путь новичка «где шаблоны?» —
  // два тапа. Тач-цели не меньше 44 px (`--tap-min`).
  test("четыре таба, остальное в «Ещё»: шаблоны за два тапа", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/admin");

    const tabs = page.getByTestId("admin-tabbar");
    for (const id of ["tab-home", "tab-stations", "tab-feed", "tab-more"]) {
      const tab = page.getByTestId(id);
      await expect(tab, `таб ${id}`).toBeVisible();
      const box = await tab.evaluate(
        (element) => element.getBoundingClientRect().toJSON() as DOMRect,
      );
      expect(box.height, `${id}: высота тач-цели`).toBeGreaterThanOrEqual(44);
    }
    await expect(tabs.locator(":scope > a, :scope > button")).toHaveCount(4);
    // Панель больше не прокручивается вбок: все четыре таба помещаются.
    expect(
      await tabs.evaluate(
        (element) => element.scrollWidth - element.clientWidth,
      ),
      "панель табов шире экрана",
    ).toBeLessThanOrEqual(0);

    await page.getByTestId("tab-more").click();
    const sheet = page.getByTestId("more-sheet");
    await expect(sheet).toBeVisible();
    await expect(sheet).toHaveAccessibleName("Остальные разделы");
    for (const key of [
      "checklists",
      "templates",
      "library",
      "catalog",
      "partners",
    ]) {
      const item = page.getByTestId(`more-${key}`);
      await expect(item, `пункт «Ещё» ${key}`).toBeVisible();
      const height = await item.evaluate(
        (element) => element.getBoundingClientRect().height,
      );
      expect(height, `${key}: высота тач-цели`).toBeGreaterThanOrEqual(44);
    }
    await expect(page.getByTestId("more-theme-toggle")).toBeVisible();
    await expect(page.getByTestId("more-locale-toggle")).toBeVisible();

    await page.getByTestId("more-templates").click();
    await expect(page).toHaveURL(/\/admin\/templates$/);
    await expect(sheet).toBeHidden();
    // Раздел из листа подсвечивает «Ещё» — человек видит, где он.
    await expect(page.getByTestId("tab-more")).toHaveAttribute(
      "data-active",
      "",
    );

    // Esc закрывает лист, как любое окно.
    await page.getByTestId("tab-more").click();
    await expect(sheet).toBeVisible();
    await expect(page.getByTestId("more-templates")).toHaveAttribute(
      "aria-current",
      "page",
    );
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
  });

  test("поиск — пиктограммой в полосе марки", async ({ page }) => {
    await signIn(page);
    await page.goto("/admin/stations");

    const toggle = page.getByTestId("mbar-search");
    await expect(toggle).toHaveAccessibleName("Поиск чек-листа");
    const field = page.getByTestId("mbar-search-field");
    await expect(field).toBeHidden();

    await toggle.click();
    await expect(field).toBeFocused();
    await field.fill("смена");
    await field.press("Enter");
    await expect(page).toHaveURL(/\/admin\/checklists\?q=/);
    await expect(page.getByTestId("checklists-screen")).toBeVisible();
  });
});

test.describe("каркас кабинета на настольной ширине", () => {
  test.use({ viewport: DESKTOP, locale: "ru-RU" });

  test("меню остаётся боковой колонкой 216 px", async ({ page }) => {
    await signIn(page);
    await page.goto("/admin");

    const nav = await page
      .locator("nav.sidenav")
      .evaluate((element) => element.getBoundingClientRect().width);

    expect(Math.round(nav)).toBe(NAV_COLUMN);
  });

  // D183: вспомогательные разделы — пиктограммами внизу рейки, с подписью при
  // наведении и доступным именем; рабочие — строками. «Где шаблоны?» — один клик.
  test("вспомогательные разделы — пиктограммами внизу рейки", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/admin");

    const list = page.locator("nav.sidenav .sidenav__list");
    for (const key of ["home", "checklists", "stations", "feed"]) {
      await expect(list.getByTestId(`nav-${key}`)).toBeVisible();
    }
    const tools = page.getByTestId("nav-tools");
    for (const [key, name] of [
      ["templates", "Шаблоны"],
      ["library", "Библиотека блоков"],
      ["catalog", "Страны и пиццерии"],
      ["partners", "Партнёры"],
    ] as const) {
      const tool = tools.getByTestId(`nav-${key}`);
      await expect(tool).toHaveAccessibleName(name);
      await expect(tool).toHaveAttribute("title", name);
    }
    await expect(list.getByTestId("nav-templates")).toHaveCount(0);

    await tools.getByRole("link", { name: "Шаблоны" }).click();
    await expect(page.getByTestId("templates-screen")).toBeVisible();
  });
});
