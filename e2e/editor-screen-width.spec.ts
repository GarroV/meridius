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

    // Ширина — это ещё не пригодность: кнопка может поместиться в экран и всё равно
    // оказаться недостижимой. Публикация с телефона — первая половина того самого
    // сквозного пути («методист завёл чек-лист, сотрудник его заполнил»), поэтому
    // проверка доводится до версии, а не до замера.
    await page.getByTestId("publish").click();
    await expect(page.getByTestId("editor-published")).toContainText("1");
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

// Переключатель режима смены в предпросмотре стоит одной ровной линией (T283).
//
// Дефект: подпись «С ОГРАНИЧЕНИЯМИ» длиннее соседних «Обычная» и «Критичная», вкладка
// ломалась в две строки, а соседние оставались в одну — переключатель терял линию. Это
// та же порода, что два дефекта выше: разметка одна, ломается вычисленная раскладка, и
// в исходниках этого не видно. Возвращает его любая следующая подпись или третий язык,
// поэтому проверка мерит ЧИСЛО СТРОК текста, а не смотрит на класс: строка меряется
// прямоугольниками, которые браузер отдал под её текст.
const MODE_TABS = 3;

/** Сколько строк реально занял текст органа: по прямоугольникам его текстового узла. */
async function textLines(page: Page, testId: string): Promise<number[]> {
  return page.evaluate((id) => {
    const bar = document.querySelector(`[data-testid="${id}"]`);
    if (bar === null) return [];
    return [...bar.children].map((tab) => {
      const range = document.createRange();
      range.selectNodeContents(tab);
      return range.getClientRects().length;
    });
  }, testId);
}

test.describe("переключатель режима смены в предпросмотре", () => {
  for (const [locale, title] of [
    ["ru-RU", "русская локаль"],
    ["en-US", "английская локаль"],
  ] as const) {
    test.describe(title, () => {
      test.use({ locale });

      test("все вкладки стоят в одну строку и помещаются в дорожку", async ({
        page,
      }) => {
        await signIn(page);
        await createChecklist(page, `Режимы ${label()}`);
        await page.getByTestId("item-title").first().fill("Проверить печь");
        const preview = `${page.url()}/preview`;

        for (const size of [WIDE, PHONE]) {
          await page.setViewportSize(size);
          await page.goto(preview);
          const bar = page.getByTestId("preview-mode-bar");
          await expect(bar).toBeVisible();

          const where = `${title}, ширина ${String(size.width)} px`;
          const lines = await textLines(page, "preview-mode-bar");
          expect(lines.length, `вкладок не три: ${where}`).toBe(MODE_TABS);
          expect(lines, `вкладка переносится в две строки: ${where}`).toEqual(
            Array.from({ length: MODE_TABS }, () => 1),
          );

          // Переносить нечему — значит дорожка обязана вместить подписи целиком, а не
          // спрятать их в собственную прокрутку.
          const fit = await bar.evaluate((node) => ({
            scrollWidth: node.scrollWidth,
            clientWidth: node.clientWidth,
          }));
          expect(
            fit.scrollWidth,
            `подписи не влезли в дорожку переключателя: ${where}, ${JSON.stringify(fit)}`,
          ).toBeLessThanOrEqual(fit.clientWidth + 1);
        }
      });
    });
  }
});
