// Экран редактора обязан помещаться в окно — и на телефоне, и когда строка пункта
// нагружена всем сразу (T211 дефект #87, T222 дефект #99).
//
// Почему это проверка, а не разовый замер. Оба дефекта — про ВЫЧИСЛЕННУЮ ширину:
// разметка одна и та же, а ломается раскладка, и в разметке этого не видно вовсе.
// Оба заводились не правкой редактора, а тем, что рядом подрос сосед: T211 вскрылся
// после починки каркаса (T193), T222 — после того, как в строку пункта добавили чип
// регулярности (T137). То есть класс дефекта — «строка тихо переросла экран», и
// вернуть его может любая следующая добавка в строку пункта. Стоит проверка секунд,
// а ловит ровно то, из-за чего экран нельзя открыть с телефона.
//
// `admin-mobile.spec.ts` сюда не годится: он про каркас кабинета и его шесть разделов,
// а экран редактора — не раздел, он лежит глубже и рисует свою колонку сам.
import { expect, test, type Page } from "@playwright/test";

import { E2E_ADMIN_PASSWORD } from "./admin-credentials";

/** Телефон из решения D092 — самая узкая ширина, на которой продукт обязан работать. */
const PHONE = { width: 375, height: 812 } as const;
/** Широкое окно из дефекта #99: место есть, а название пункта всё равно исчезало. */
const WIDE = { width: 1440, height: 900 } as const;

/**
 * Сколько места обязано остаться полю названия пункта.
 *
 * 180 px — это примерно три слова кириллицей на `--fs-lead`: методист видит, что
 * он набрал, а не последние два символа. Число взято не из вёрстки, а из смысла:
 * поле, в которое не влезает короткая фраза, работу не делает. До починки в тяжёлой
 * строке оставалось 8 px.
 */
const TITLE_MIN = 180;

async function signIn(page: Page): Promise<void> {
  await page.goto("/admin/login");
  // Не по подписи: язык интерфейса у прогона меняется, `name="password"` — нет.
  await page.locator('input[name="password"]').fill(E2E_ADMIN_PASSWORD);
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("admin-home")).toBeVisible();
}

async function createChecklist(page: Page, title: string): Promise<void> {
  await page.goto("/admin/checklists/new");
  await page.getByTestId("new-checklist-title").fill(title);
  await page.getByTestId("create-checklist").click();
  await expect(page.getByTestId("editor-screen")).toBeVisible();
}

function label(): string {
  return Math.random().toString(36).slice(2, 8);
}

/** Ширина документа и окна: расхождение — это и есть горизонтальная прокрутка. */
async function pageWidth(
  page: Page,
): Promise<{ scrollWidth: number; clientWidth: number }> {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
}

/** Кто именно растянул документ. Без виновника красный гейт стоит отдельного прогона. */
async function widestElement(page: Page): Promise<string> {
  return page.evaluate(() => {
    const room = document.documentElement.clientWidth;
    let worst = "";
    let worstRight = room;
    for (const element of document.body.querySelectorAll("*")) {
      const box = element.getBoundingClientRect();
      if (box.right <= worstRight) continue;
      worstRight = box.right;
      const testId = element.getAttribute("data-testid");
      worst =
        `<${element.tagName.toLowerCase()}` +
        (testId === null ? "" : ` data-testid="${testId}"`) +
        `> правый край ${String(Math.round(box.right))}`;
    }
    return worst === "" ? "никто: документ шире по своей разметке" : worst;
  });
}

test.describe("ширина экрана редактора", () => {
  test("экран редактора помещается в окно телефона", async ({ page }) => {
    await signIn(page);
    await createChecklist(page, `Телефон ${label()}`);

    await page.setViewportSize(PHONE);
    await page.getByTestId("item-title").first().click();
    await page.keyboard.type("Проверить температуру холодильника у входа");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Протереть столы в зале и на кухне");
    await expect(page.getByTestId("item-title")).toHaveCount(2);

    const width = await pageWidth(page);
    expect(
      width.scrollWidth,
      `Экран редактора шире окна телефона (${String(width.scrollWidth)} при ` +
        `${String(width.clientWidth)}): страница уезжает вбок вместе с заголовком и ` +
        `кнопкой «Опубликовать». Растянул: ${await widestElement(page)}`,
    ).toBe(width.clientWidth);
  });

  test("тяжёлая строка на 1440 px не съедает название пункта", async ({
    page,
  }) => {
    await page.setViewportSize(WIDE);
    await signIn(page);
    await createChecklist(page, `Тяжёлая строка ${label()}`);

    // Строка, нагруженная всем сразу: род ответа «число» с двумя границами,
    // расписание отрезком и уровень «критичный». Дословно то сочетание, на котором
    // поле названия схлопывалось (#99).
    await page.getByTestId("item-title").first().click();
    await page.keyboard.type("Температура камеры быстрой заморозки");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Чистота стола выдачи и зоны упаковки");
    await expect(page.getByTestId("item-title")).toHaveCount(2);

    await page.getByTestId("item-type").first().selectOption("number");
    await page.getByTestId("item-min").first().fill("-18");
    await page.getByTestId("item-max").first().fill("-12");
    await page.getByTestId("item-severity-critical").first().click();

    await page
      .locator('[data-testid="item-schedule-chip"][data-live="true"]')
      .first()
      .click();
    await expect(page.getByTestId("schedule-dialog")).toBeVisible();
    await page.getByTestId("schedule-add").click();
    await page.getByTestId("schedule-step-0").selectOption("120");
    await page.getByTestId("schedule-apply").click();
    await expect(page.getByTestId("schedule-dialog")).toHaveCount(0);

    const titles = page.getByTestId("item-title");
    for (const [index, name] of ["тяжёлая", "соседняя"].entries()) {
      const box = await titles.nth(index).boundingBox();
      expect(box, `Поле названия (${name} строка) не нашлось`).not.toBeNull();
      expect(
        Math.round(box?.width ?? 0),
        `Поле названия пункта (${name} строка) сжато до ` +
          `${String(Math.round(box?.width ?? 0))} px на окне 1440: методист не видит, ` +
          `что набирает. Управление строки обязано переноситься, а не съедать название.`,
      ).toBeGreaterThanOrEqual(TITLE_MIN);
    }
  });
});
