import { expect, test } from "@playwright/test";

import { stationScanUrl } from "../src/blocks/qr/scan-url";
import { lastSubmission, seedFillStand } from "./fill-fixtures";
import { E2E_PUBLIC_BASE_URL } from "./public-base-url";

/**
 * Журнал замеса теста на телефоне (T141, D074): строки заводит сотрудник, колонки
 * задал методист. Сценарий проверяет то, что нельзя проверить модульно, — что журнал
 * на 375 точках не уезжает вбок и что вписанное доезжает до базы строками, а не текстом.
 */

const PHONE = { width: 375, height: 760 } as const;
const TAP_MIN = 44;

const TABLE_SECTIONS = [
  {
    id: "s-dough",
    title: { ru: "Замес теста", en: "Dough mixing" },
    source: "own",
    items: [
      {
        id: "i-log",
        title: { ru: "Журнал замесов", en: "Mixing log" },
        type: "table",
        severity: "normal",
        columns: [
          {
            id: "c-temp",
            title: { ru: "Температура теста", en: "Dough temperature" },
            norm: { ru: "24…26 °C", en: "24…26 °C" },
          },
          {
            id: "c-weight",
            title: { ru: "Вес, г", en: "Weight, g" },
            norm: { ru: "200 г", en: "200 g" },
          },
        ],
      },
    ],
  },
];

function stickerPath(code: string): string {
  return new URL(stationScanUrl(E2E_PUBLIC_BASE_URL, code)).pathname;
}

test.describe("журнал замеса на экране заполнения", () => {
  test.use({
    viewport: PHONE,
    hasTouch: true,
    isMobile: true,
    locale: "en-GB",
  });

  test("строки журнала доезжают до базы строками, а не текстом", async ({
    page,
  }) => {
    // Arrange
    const stand = await seedFillStand("журнал", { sections: TABLE_SECTIONS });
    await page.goto(stickerPath(stand.code));

    // Act: два замеса подряд — так журнал и заполняют по ходу смены.
    await page.getByTestId("fill-table-add").tap();
    await page
      .locator('[data-testid="fill-table-cell"][data-column-id="c-temp"]')
      .first()
      .fill("24,5");
    await page
      .locator('[data-testid="fill-table-cell"][data-column-id="c-weight"]')
      .first()
      .fill("200");

    await page.getByTestId("fill-table-add").tap();
    await page
      .locator('[data-testid="fill-table-cell"][data-column-id="c-temp"]')
      .nth(1)
      .fill("25");

    await expect(page.getByTestId("fill-submit")).toBeEnabled();
    await page.getByTestId("fill-submit").tap();
    await expect(page.getByTestId("fill-sent")).toBeVisible();

    // Assert
    const stored = await lastSubmission(stand.stationId);
    expect(
      stored?.answers.find((answer) => answer.itemId === "i-log")?.value,
    ).toStrictEqual([
      { "c-temp": "24,5", "c-weight": "200" },
      { "c-temp": "25" },
    ]);
  });

  test("пустая строка журнала отправку не открывает", async ({ page }) => {
    // Нажать «строка» и ничего не вписать — это несделанный пункт, а не ответ.
    const stand = await seedFillStand("пустая", { sections: TABLE_SECTIONS });
    await page.goto(stickerPath(stand.code));

    await page.getByTestId("fill-table-add").tap();

    await expect(page.getByTestId("fill-submit")).toBeDisabled();
  });

  test("журнал живёт на 375 px: нет горизонтальной прокрутки, поля от 44 px", async ({
    page,
  }) => {
    // Самое неприятное место продукта: бумажная таблица на телефоне. Строка развёрнута
    // карточкой сверху вниз именно поэтому — уехавшая вбок колонка не заполняется.
    const stand = await seedFillStand("ширина", { sections: TABLE_SECTIONS });
    await page.goto(stickerPath(stand.code));
    await page.getByTestId("fill-table-add").tap();

    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);

    const heights = await page
      .locator(
        '[data-testid="fill-table-cell"], [data-testid="fill-table-add"], [data-testid="fill-table-remove"]',
      )
      .evaluateAll((nodes) =>
        nodes.map((node) => Math.round(node.getBoundingClientRect().height)),
      );
    expect(heights.length).toBeGreaterThan(0);
    for (const height of heights)
      expect(height).toBeGreaterThanOrEqual(TAP_MIN);
  });

  test("норма стоит у своего поля, а не одной строкой над таблицей", async ({
    page,
  }) => {
    const stand = await seedFillStand("норма", { sections: TABLE_SECTIONS });
    await page.goto(stickerPath(stand.code));
    await page.getByTestId("fill-table-add").tap();

    await expect(page.getByText("24…26 °C")).toBeVisible();
    await expect(page.getByText("200 g")).toBeVisible();
  });
});
