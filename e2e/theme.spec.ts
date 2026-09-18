// Сквозные сценарии тёмной темы (D106, T236).
//
// Механизм собран в `src/blocks/core/theme.ts`, `ThemeProvider.tsx`, `ThemeToggle.tsx` и
// держится собственным юнит-тестом (`theme.test.ts`). Здесь проверяется не он сам, а то,
// что он реально работает в живом браузере на всех поверхностях продукта: у юнит-теста
// нет ни каскада CSS, ни вычисленного стиля, а сторож по T236 обязан падать именно на
// экране, который в тёмной теме взял светлый токен, — такой дефект на глаз не ловится и
// юнит-тестом не виден вовсе.
//
// Вход — один раз на поток прогона, а не в каждом сценарии (T253): большая часть
// сценариев файла идёт в кабинет, и вход в каждом был ценой всего файла. Сессия —
// подписанная кука без хранилища на сервере (`auth/session.ts`), поэтому одна и та же
// годится всем сценариям потока, а контекст браузера у каждого сценария по-прежнему свой.
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  test as base,
  expect,
  type BrowserContext,
  type Page,
} from "@playwright/test";

import { themeTokens } from "../src/blocks/core/design-reference";
import { THEME_ATTRIBUTE, THEME_COOKIE_NAME } from "../src/blocks/core/theme";
import { stationScanUrl } from "../src/blocks/qr/scan-url";
import en from "../src/messages/en.json" with { type: "json" };
import { E2E_ADMIN_PASSWORD } from "./admin-credentials";
import { seedFillStand } from "./fill-fixtures";
import { E2E_PUBLIC_BASE_URL } from "./public-base-url";

type SessionState = Awaited<ReturnType<BrowserContext["storageState"]>>;

/**
 * Вход как им пользуются. Поле ищется по типу, а не по подписи: браузер прогона по
 * умолчанию английский, и поиск по «Пароль» ждал поля, которого на английской форме нет,
 * — ровно так прошлый черновик этого файла и краснел, по 30 секунд на каждый вход (T253).
 */
async function signIn(page: Page): Promise<void> {
  await page.goto("/admin/login");
  await page.locator("input[type=password]").fill(E2E_ADMIN_PASSWORD);
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("admin-home")).toBeVisible();
}

/**
 * `signedIn` — сценарию нужен кабинет; `adminSession` — сессия, добытая одним входом на
 * поток. Сценарий без `signedIn` получает браузер без сессии: экран входа и кухонный
 * телефон видят продукт так же, как гость.
 */
const test = base.extend<{ signedIn: boolean }, { adminSession: SessionState }>(
  {
    signedIn: [false, { option: true }],
    adminSession: [
      async ({ browser }, use, workerInfo) => {
        // Контекст, созданный руками, настроек проекта не наследует — адрес передаётся явно.
        const context = await browser.newContext({
          baseURL: workerInfo.project.use.baseURL,
        });
        await signIn(await context.newPage());
        const session = await context.storageState();
        await context.close();
        await use(session);
      },
      { scope: "worker" },
    ],
    storageState: async ({ signedIn, adminSession, storageState }, use) => {
      await use(signedIn ? adminSession : storageState);
    },
  },
);

/** Эталон токенов — единственный источник цветов; значения в сценарии не переписываются. */
const TOKENS_CSS = readFileSync(
  path.resolve(
    import.meta.dirname,
    "../docs/furca/design/reference/tokens.css",
  ),
  "utf8",
);

const HEX_COLOR = /#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})\b/i;

/**
 * Хекс эталона (`#RRGGBB`, эталон хранит только шестизначные) в запись, которую
 * отдаёт браузер (`rgb(r, g, b)`). Группа читается колбэком замены, а не индексом
 * совпадения — тот же приём, что у `design-reference.ts`: индексом группа была бы
 * `string | undefined`, и ветка на этот случай была бы дырой, в которую не попадает
 * ни один вход.
 */
function rgbOf(hex: string): string {
  let rgb: string | undefined;
  hex.replace(HEX_COLOR, (_whole, r: string, g: string, b: string) => {
    rgb = `rgb(${String(parseInt(r, 16))}, ${String(parseInt(g, 16))}, ${String(parseInt(b, 16))})`;
    return "";
  });
  if (rgb === undefined) {
    throw new Error(`«${hex}» не похож на шестизначный хекс эталона`);
  }
  return rgb;
}

/** Значение токена темы в записи браузера. Токена нет в эталоне — сверять нечем. */
function tokenRgb(theme: "light" | "dark", name: string): string {
  const value = themeTokens(TOKENS_CSS, theme).get(name);
  if (value === undefined) {
    throw new Error(`эталон не назвал ${name} для темы «${theme}»`);
  }
  return rgbOf(value);
}

const canvasRgb = (theme: "light" | "dark"): string =>
  tokenRgb(theme, "--canvas");
const surfaceRgb = (theme: "light" | "dark"): string =>
  tokenRgb(theme, "--surface");

interface CabinetScreen {
  readonly name: string;
  readonly path: string;
  readonly testId: string;
}

const HOME_SCREEN: CabinetScreen = {
  name: "главная кабинета",
  path: "/admin",
  testId: "admin-home",
};

/** Все разделы кабинета — тот же набор, что держит связность в `admin-nav.spec.ts`. */
const CABINET_SCREENS: readonly CabinetScreen[] = [
  HOME_SCREEN,
  { name: "чек-листы", path: "/admin/checklists", testId: "checklists-screen" },
  {
    name: "библиотека блоков",
    path: "/admin/library",
    testId: "library-screen",
  },
  { name: "заполнения", path: "/admin/feed", testId: "feed-screen" },
  {
    name: "страны и пиццерии",
    path: "/admin/catalog",
    testId: "catalog-screen",
  },
  { name: "QR-коды", path: "/admin/qr", testId: "qr-screen" },
];

async function openScreen(page: Page, screen: CabinetScreen): Promise<void> {
  await page.goto(screen.path);
  await expect(page.getByTestId(screen.testId)).toBeVisible();
}

interface DocumentTheme {
  readonly attribute: string | null;
  readonly canvas: string;
  readonly colorScheme: string;
}

/**
 * Тема документа, какой её ПОСЧИТАЛ браузер, — не разметка, а вычисленный стиль.
 * Атрибут читается через переданный аргумент, а не замыканием на `THEME_ATTRIBUTE`:
 * `page.evaluate` пересобирает функцию в браузере, и внешняя переменная там просто
 * не существует.
 */
async function documentTheme(page: Page): Promise<DocumentTheme> {
  return await page.evaluate(
    (attribute) => ({
      attribute: document.documentElement.getAttribute(attribute),
      canvas: getComputedStyle(document.body).backgroundColor,
      colorScheme: getComputedStyle(document.documentElement).getPropertyValue(
        "color-scheme",
      ),
    }),
    THEME_ATTRIBUTE,
  );
}

/** Экран обязан совпасть с системной настройкой ровно так, как её ставит автоматика. */
async function expectAutomaticTheme(
  page: Page,
  scheme: "light" | "dark",
): Promise<void> {
  const state = await documentTheme(page);
  // Атрибут ставит явный выбор или автоматика по тёмной настройке; светлая системная
  // настройка — это ОТСУТСТВИЕ атрибута, а не `data-theme="light"` (theme.ts).
  expect(state.attribute).toBe(scheme === "dark" ? "dark" : null);
  expect(state.canvas).toBe(canvasRgb(scheme));
  expect(state.colorScheme).toBe(scheme);
}

async function themeCookieSet(page: Page): Promise<boolean> {
  return (await page.context().cookies()).some(
    (cookie) => cookie.name === THEME_COOKIE_NAME,
  );
}

async function setThemeCookie(
  context: BrowserContext,
  value: string,
): Promise<void> {
  await context.addCookies([
    { name: THEME_COOKIE_NAME, value, domain: "localhost", path: "/" },
  ]);
}

const SCHEMES = ["dark", "light"] as const;

test.describe("автоматика по системной настройке — на всех поверхностях продукта", () => {
  for (const scheme of SCHEMES) {
    test.describe(`системная настройка «${scheme}»`, () => {
      test.use({ colorScheme: scheme });

      // Экран входа лежит вне охраны кабинета: гость видит его без сессии.
      test("вход в кабинет: тема и фон страницы совпадают с системной настройкой", async ({
        page,
      }) => {
        await page.goto("/admin/login");
        await expect(page.getByTestId("login-screen")).toBeVisible();
        await expectAutomaticTheme(page, scheme);
      });

      test.describe("экраны кабинета", () => {
        test.use({ signedIn: true });

        for (const screen of CABINET_SCREENS) {
          test(`${screen.name}: тема и фон страницы совпадают с системной настройкой`, async ({
            page,
          }) => {
            await openScreen(page, screen);
            await expectAutomaticTheme(page, scheme);
          });
        }
      });
    });
  }
});

/** Путь из напечатанной наклейки — тот же приём, что `stickerPath` в `fill.spec.ts`. */
function stationScanPath(code: string): string {
  return new URL(stationScanUrl(E2E_PUBLIC_BASE_URL, code)).pathname;
}

const EMPLOYEE_PHONE = { width: 390, height: 844 } as const;

test.describe("автоматика на публичном экране заполнения (сотрудник, 390px)", () => {
  test.use({ viewport: EMPLOYEE_PHONE });

  for (const scheme of SCHEMES) {
    test.describe(`системная настройка «${scheme}»`, () => {
      test.use({ colorScheme: scheme });

      test("тема и фон совпадают с системной настройкой кухонного телефона", async ({
        page,
      }) => {
        const stand = await seedFillStand("тема");
        await page.goto(stationScanPath(stand.code));
        await expect(page.getByTestId("fill-screen")).toBeVisible();

        await expectAutomaticTheme(page, scheme);
      });
    });
  }
});

test.describe("поверхность экрана — не только фон страницы", () => {
  test.use({ colorScheme: "dark", signedIn: true });

  test("боковое меню в тёмной теме берёт тёмный --surface, а не светлый", async ({
    page,
  }) => {
    await openScreen(page, HOME_SCREEN);

    const background = await page
      .locator("nav")
      .first()
      .evaluate((node) => getComputedStyle(node).backgroundColor);

    expect(background).toBe(surfaceRgb("dark"));
    // Сверка с «правильным» тёмным значением не поймает разъезд эталона — оба берутся
    // из одного файла и разъедутся вместе. Независимый инвариант — фон НЕ светлый:
    // это и есть тот самый дефект («экран взял светлый токен»), ради которого сторож
    // заведён (T236).
    expect(background).not.toBe(surfaceRgb("light"));
  });
});

test.describe("явный выбор перебивает автоматику", () => {
  test.use({ signedIn: true });

  test.describe("кука light сильнее тёмной системной настройки", () => {
    test.use({ colorScheme: "dark" });

    test("экран светлый, и переключатель показывает выбор", async ({
      page,
      context,
    }) => {
      await setThemeCookie(context, "light");
      await page.goto("/admin/feed");
      await expect(page.getByTestId("feed-screen")).toBeVisible();

      const state = await documentTheme(page);
      expect(state.attribute).toBe("light");
      expect(state.canvas).toBe(canvasRgb("light"));
      await expect(page.getByTestId("theme-light")).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    });
  });

  test.describe("кука dark сильнее светлой системной настройки", () => {
    test.use({ colorScheme: "light" });

    test("экран тёмный, и переключатель показывает выбор", async ({
      page,
      context,
    }) => {
      await setThemeCookie(context, "dark");
      await page.goto("/admin/feed");
      await expect(page.getByTestId("feed-screen")).toBeVisible();

      const state = await documentTheme(page);
      expect(state.attribute).toBe("dark");
      expect(state.canvas).toBe(canvasRgb("dark"));
      await expect(page.getByTestId("theme-dark")).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    });
  });

  test.describe("мусор в куке равносилен её отсутствию", () => {
    test.use({ colorScheme: "light" });

    test("экран светлый, атрибута нет вовсе", async ({ page, context }) => {
      // Регистр не совпадает ни с одним выбором продукта («dark» ≠ «DARK») — ровно
      // та же граница, что проверяет `theme.test.ts` у `asThemeChoice`.
      await setThemeCookie(context, "DARK");
      await page.goto("/admin/feed");
      await expect(page.getByTestId("feed-screen")).toBeVisible();

      const state = await documentTheme(page);
      expect(state.attribute).toBeNull();
      expect(state.canvas).toBe(canvasRgb("light"));
    });
  });
});

test.describe("переключатель работает и выбор переживает переход", () => {
  test.use({ colorScheme: "light", signedIn: true });

  test("клик переключает без перезагрузки, выбор остаётся на другом экране, «авто» возвращает автоматику светлой системы", async ({
    page,
  }) => {
    // Arrange
    await openScreen(page, HOME_SCREEN);

    // Act: настоящий клик Playwright, а не вызов обработчика мимо разметки.
    await page.getByTestId("theme-dark").click();

    // Assert: смена мгновенная, без `page.reload()`.
    await expect(page.locator("html")).toHaveAttribute(THEME_ATTRIBUTE, "dark");
    expect(
      await page.evaluate(
        () => getComputedStyle(document.body).backgroundColor,
      ),
    ).toBe(canvasRgb("dark"));

    // Act: переход на другой экран кабинета.
    await page.goto("/admin/checklists");
    await expect(page.getByTestId("checklists-screen")).toBeVisible();

    // Assert: выбор пережил переход — его поставил уже сервер по куке.
    await expect(page.locator("html")).toHaveAttribute(THEME_ATTRIBUTE, "dark");
    await expect(page.getByTestId("theme-dark")).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    // Act: возврат к автоматике.
    await page.getByTestId("theme-system").click();

    // Assert: система светлая — «авто» снимает атрибут вовсе, куки не остаётся.
    expect(
      await page.evaluate(
        (attribute) => document.documentElement.hasAttribute(attribute),
        THEME_ATTRIBUTE,
      ),
    ).toBe(false);
    expect(await themeCookieSet(page)).toBe(false);
  });
});

test.describe("«авто» при тёмной системной настройке возвращает тёмную тему, но стирает куку", () => {
  test.use({ colorScheme: "dark", signedIn: true });

  test("после явного выбора «светлая» кнопка «авто» откатывает к тёмной автоматике", async ({
    page,
  }) => {
    await openScreen(page, HOME_SCREEN);

    await page.getByTestId("theme-light").click();
    await expect(page.locator("html")).toHaveAttribute(
      THEME_ATTRIBUTE,
      "light",
    );

    await page.getByTestId("theme-system").click();

    // Автоматика читает системную настройку, а не помнит прошлый выбор: атрибут
    // возвращается на «тёмный», хотя явного выбора уже нет.
    await expect(page.locator("html")).toHaveAttribute(THEME_ATTRIBUTE, "dark");
    expect(await themeCookieSet(page)).toBe(false);
  });
});

/**
 * Переключатель говорит словами словаря, а не ключами. Сверка идёт с самим словарём,
 * а не с литералами: слово поменяют — сценарий не начнёт врать.
 */
async function expectToggleInWords(page: Page): Promise<void> {
  const toggle = page.getByTestId("theme-toggle");
  await expect(toggle).toBeVisible();
  await expect(page.getByTestId("theme-system")).toHaveText(
    en.admin.theme.system,
  );
  await expect(page.getByTestId("theme-light")).toHaveText(
    en.admin.theme.light,
  );
  await expect(page.getByTestId("theme-dark")).toHaveText(en.admin.theme.dark);
  await expect(toggle).not.toContainText("admin.theme");
}

test.describe("переключатель темы есть на каждом экране кабинета и говорит словами", () => {
  // Язык окна задан явно: сверка идёт с английским словарём.
  test.use({ signedIn: true, locale: "en-US" });

  for (const screen of CABINET_SCREENS) {
    test(`экран «${screen.name}»`, async ({ page }) => {
      await openScreen(page, screen);
      await expectToggleInWords(page);
    });
  }

  // Редактор рисует каркас сам и оборачивает его вместе с меню в свой провайдер
  // словаря — ровно там переключатель печатал `admin.theme.*` (T254).
  test("экран редактора чек-листа", async ({ page }) => {
    const stand = await seedFillStand("тема-редактор");
    await page.goto("/admin/checklists");
    await page
      .getByTestId("checklist-row")
      .filter({ hasText: stand.stationName })
      .getByRole("link")
      .first()
      .click();
    await expect(page.getByTestId("editor-screen")).toBeVisible();

    await expectToggleInWords(page);
  });
});
