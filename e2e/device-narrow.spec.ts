// Экраны планшета на 375 px (T330, #145): привязанная вкладка `/station`, раздел
// «Устройства» и панель станции с выпущенным кодом не едут вбок, а привязанная вкладка
// не пишет в консоль ошибок.
//
// Почему отдельный файл, а не шаг сквозного сценария. Сквозной (`device.spec.ts`) идёт
// на ширине планшета, и сужать его значило бы проверять цепочку привязки не там, где она
// живёт. Здесь та же цепочка пройдена один раз, но каждый экран измерен на самом узком
// телефоне, на котором продукт обязан работать.
//
// Замер — ширина документа против ширины окна, и в сообщении назван виновник: элемент,
// чей правый край дальше всех за экраном. Одно число без виновника стоило в этом проекте
// отдельного прогона на поиск элемента.
import { expect, test } from "@playwright/test";
import type { ConsoleMessage, Page } from "@playwright/test";

import { E2E_ADMIN_PASSWORD } from "./admin-credentials";
import { seedFillStand } from "./fill-fixtures";

const PHONE = { width: 375, height: 812 } as const;
const DEVICES_PATH = "/admin/devices";

/** Куда класть снимки для сверки. Не задан — снимков нет, проверка от них не зависит. */
const SHOTS_DIR = process.env["DEVICE_SHOTS_DIR"];

async function signIn(page: Page): Promise<void> {
  await page.goto("/admin/login");
  await page.locator('input[name="password"]').fill(E2E_ADMIN_PASSWORD);
  await page.locator('input[name="login"]').fill("admin");
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("admin-home")).toBeVisible();
}

interface Overflow {
  readonly document: number;
  readonly viewport: number;
  /** Контейнеры с горизонтальной прокруткой, которым действительно есть что прокручивать. */
  readonly scrollers: readonly string[];
  /** Видимые элементы вне своей прокрутки, чей край за экраном (первые три). */
  readonly outside: readonly string[];
}

/**
 * Ширина документа — только половина ответа: рабочая зона кабинета держит свою
 * горизонтальную прокрутку (`overflow-x: auto`), и вылезший элемент тогда не растягивает
 * документ, а уезжает вбок внутри неё. Для человека на телефоне это та же прокрутка вбок,
 * поэтому считаются и такие контейнеры: всякий, у кого содержимое шире видимой части.
 * Третья мера — края видимых элементов: закреплённый (`position: fixed`) или обрезанный
 * элемент документ не растягивает вовсе, а на экране он срезан краем.
 */
async function overflowOf(page: Page): Promise<Overflow> {
  return page.evaluate(() => {
    const viewport = window.innerWidth;

    // Функция уезжает в браузер вместе с `evaluate`: внешняя область ей не видна.
    // eslint-disable-next-line unicorn/consistent-function-scoping -- выполняется в браузере
    function label(element: Element): string {
      const id =
        element instanceof HTMLElement ? element.dataset["testid"] : undefined;
      return `<${element.tagName.toLowerCase()}${
        id === undefined ? "" : ` data-testid="${id}"`
      } class="${(element.getAttribute("class") ?? "").slice(0, 90)}">`;
    }

    /** Полпикселя на округление дробной вёрстки: меньше глазом не видно. */
    const SUBPIXEL = 0.5;
    const MAX_NAMED = 3;

    // eslint-disable-next-line unicorn/consistent-function-scoping -- выполняется в браузере
    function insideScroller(element: HTMLElement): boolean {
      for (let node = element.parentElement; node; node = node.parentElement) {
        const { overflowX } = getComputedStyle(node);
        if (overflowX === "auto" || overflowX === "scroll") return true;
      }
      return false;
    }

    const scrollers: string[] = [];
    const outside: string[] = [];
    for (const element of document.querySelectorAll<HTMLElement>("body *")) {
      const { overflowX } = getComputedStyle(element);
      const scrolls = overflowX === "auto" || overflowX === "scroll";
      if (scrolls && element.scrollWidth > element.clientWidth + 1) {
        scrollers.push(
          `${label(element)} ${String(element.scrollWidth)} из ${String(element.clientWidth)} px`,
        );
      }
      // Вылезший за край элемент вне прокрутки не растягивает документ, если его
      // обрезают или он закреплён (`position: fixed`), — но на экране он обрезан.
      const box = element.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      if (box.left >= -SUBPIXEL && box.right <= viewport + SUBPIXEL) continue;
      // Целиком за экраном — спрятано намеренно (ссылка «к содержимому» до фокуса,
      // закрытая панель); срезан краем только тот, кто виден частично.
      if (box.right <= 0 || box.left >= viewport) continue;
      if (insideScroller(element)) continue;
      if (outside.length < MAX_NAMED) {
        outside.push(
          `${label(element)} ${String(Math.round(box.left))}…${String(Math.round(box.right))}`,
        );
      }
    }
    return {
      document: document.documentElement.scrollWidth,
      viewport,
      scrollers,
      outside,
    };
  });
}

async function expectNoOverflow(page: Page, screen: string): Promise<void> {
  const { document, viewport, scrollers, outside } = await overflowOf(page);
  const reason = `${screen}: документ ${String(document)} px при окне ${String(viewport)} px; прокрутка вбок: ${scrollers.join("; ") || "нет"}; за краем экрана: ${outside.join("; ") || "нет"}`;
  expect(document, reason).toBeLessThanOrEqual(viewport);
  expect(scrollers, reason).toEqual([]);
  expect(outside, reason).toEqual([]);
}

async function shot(page: Page, name: string): Promise<void> {
  if (SHOTS_DIR === undefined || SHOTS_DIR === "") return;
  await page.screenshot({ path: `${SHOTS_DIR}/${name}.png`, fullPage: true });
}

/** Ошибки страницы: и `console.error`, и необработанные исключения. */
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message: ConsoleMessage) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });
  return errors;
}

test.describe("экраны планшета на 375 px", () => {
  test("раздел «Устройства», панель станции с кодом и привязанная вкладка не едут вбок; вкладка без ошибок в консоли", async ({
    browser,
  }) => {
    test.slow();

    // Arrange: станция с чек-листом, кабинет на телефоне.
    const stand = await seedFillStand("device-narrow");
    const cabinet = await browser.newContext({
      viewport: PHONE,
      locale: "ru-RU",
    });
    const admin = await cabinet.newPage();
    await signIn(admin);

    // Раздел целиком: дерево станций и инструкция.
    await admin.goto(DEVICES_PATH);
    await expect(admin.getByTestId("pair-guide").first()).toBeVisible();
    await expectNoOverflow(admin, DEVICES_PATH);
    await shot(admin, "devices-375");

    // Панель станции с выпущенным кодом — самое широкое её состояние.
    await admin.goto(`${DEVICES_PATH}?station=${stand.stationId}`);
    const drawer = admin.getByTestId("station-drawer");
    await expect(drawer).toBeVisible();
    await drawer.getByTestId("pair-tablet").click();
    const code = drawer.getByTestId("pair-tablet-code");
    await expect(code).toBeVisible();
    const pin = (await code.innerText()).trim();
    await expectNoOverflow(admin, `${DEVICES_PATH}?station=`);
    await shot(admin, "devices-drawer-375");

    // Act: планшет на телефонной ширине вводит код и попадает на свою вкладку.
    const tabletContext = await browser.newContext({ viewport: PHONE });
    const tablet = await tabletContext.newPage();
    const errors = collectErrors(tablet);
    await tablet.goto("/pair");
    await tablet.getByTestId("pair-code").fill(pin);
    await tablet.getByTestId("pair-submit").click();
    await expect(tablet).toHaveURL(/\/station$/);
    await expect(tablet.getByTestId("fill-screen")).toBeVisible();

    // Assert: вкладка не едет вбок и ничего не пишет в консоль — ни при входе, ни при
    // повторной отрисовке того же адреса (первая отрисовка идёт после перехода).
    await expectNoOverflow(tablet, "/station");
    await tablet.reload();
    await expect(tablet.getByTestId("fill-screen")).toBeVisible();
    await expectNoOverflow(tablet, "/station после перезагрузки");
    await shot(tablet, "station-375");
    expect(errors, `ошибки консоли на /station: ${errors.join(" | ")}`).toEqual(
      [],
    );

    await tabletContext.close();
    await cabinet.close();
  });
});
