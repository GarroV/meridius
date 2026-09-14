import { expect, test } from "@playwright/test";

import { stationScanUrl } from "../src/blocks/qr/scan-url";
import { e2eDatabaseUrl } from "./database";
import { seedFillStand } from "./fill-fixtures";
import { E2E_PUBLIC_BASE_URL } from "./public-base-url";

/**
 * Обходы на экране станции: сотрудник отсканировал наклейку, отметил обход и тут же
 * увидел это в списке за смену — не заходя в кабинет (D077).
 *
 * Сценарий в настоящем браузере, потому что проверяется ровно то, чего модульные тесты
 * не видят: что панель дошла до экрана, что отметка уходит серверным действием и что
 * страница перерисовывается ответом сервера, а не догадкой браузера.
 */

const PHONE = { width: 375, height: 760 } as const;
const TAP_MIN = 44;

/** Обход каждый час весь день: сценарий не должен зависеть от часа прогона. */
const ROUND_SECTIONS = [
  {
    id: "s-rounds",
    title: { ru: "Обходы", en: "Rounds" },
    source: "own",
    items: [
      {
        id: "i-line",
        title: { ru: "Линия начинения", en: "Toppings line" },
        type: "bool",
        severity: "critical",
        schedule: [{ from: "00:00", to: "23:59", everyMinutes: 60 }],
      },
      {
        id: "i-oven",
        title: { ru: "Включить печь", en: "Turn on the oven" },
        type: "bool",
        severity: "normal",
      },
    ],
  },
];

function stickerPath(code: string): string {
  return new URL(stationScanUrl(E2E_PUBLIC_BASE_URL, code)).pathname;
}

async function countChecks(stationId: string): Promise<number> {
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: e2eDatabaseUrl() });
  try {
    const { rows } = await pool.query<{ count: string }>(
      "select count(*)::text as count from checks where station_id = $1",
      [stationId],
    );
    return Number(rows[0]?.count ?? "0");
  } finally {
    await pool.end();
  }
}

test.describe("обходы на станции", () => {
  // Язык задан явно: экран отдаёт его по заголовку телефона, а браузер сценария по
  // умолчанию просит английский — тогда проверялись бы не те строки, что видит смена.
  test.use({
    viewport: PHONE,
    hasTouch: true,
    isMobile: true,
    locale: "ru-RU",
  });

  test("обход отмечается со станции и сразу виден в списке за смену", async ({
    page,
  }) => {
    const stand = await seedFillStand("обходы", { sections: ROUND_SECTIONS });

    await page.goto(stickerPath(stand.code));

    // Обход живёт отдельной панелью, а не строкой формы: его отмечают по расписанию.
    const row = page.getByTestId("round-i-line");
    await expect(row).toBeVisible();
    await expect(row).toHaveAttribute("data-state", "due");
    await expect(page.getByTestId("round-headline-i-line")).toContainText(
      "Проверить до",
    );

    // Периодический пункт в форму не попал, а обычный — попал.
    await expect(
      page.locator('[data-testid="fill-item"][data-item-id="i-line"]'),
    ).toHaveCount(0);
    await expect(
      page.locator('[data-testid="fill-item"][data-item-id="i-oven"]'),
    ).toHaveCount(1);

    // Кнопка отметки — под занятые руки на кухне.
    const mark = row.getByRole("button", { name: "Порядок", exact: true });
    const box = await mark.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(TAP_MIN);

    await mark.tap();

    // Состояние пересчитал сервер: строка стала «сделано», и отметка легла в базу.
    await expect(row).toHaveAttribute("data-state", "done");
    await expect(page.getByTestId("round-headline-i-line")).toContainText(
      "Сделано в",
    );
    expect(await countChecks(stand.stationId)).toBe(1);

    // Список обходов за смену разворачивается прямо здесь, без входа в кабинет (D077).
    await page.getByTestId("round-expand-i-line").tap();
    await expect(page.getByTestId("round-marks-i-line")).toContainText(
      "порядок",
    );
  });

  test("непорядок без объяснения не отмечается: обещание держит сервер", async ({
    page,
  }) => {
    const stand = await seedFillStand("непорядок", {
      sections: ROUND_SECTIONS,
    });

    await page.goto(stickerPath(stand.code));
    const row = page.getByTestId("round-i-line");

    // Первое касание раскрывает поле объяснения, второе отправляет.
    await row.getByRole("button", { name: "Непорядок" }).tap();
    await row.getByRole("button", { name: "Отправить" }).tap();

    await expect(page.getByTestId("round-notice-i-line")).toBeVisible();
    expect(await countChecks(stand.stationId)).toBe(0);

    // С объяснением отметка проходит и видна красной в списке.
    await page.getByPlaceholder("Коротко: что нашли").fill("подтаяло");
    await row.getByRole("button", { name: "Отправить" }).tap();

    await expect(row).toHaveAttribute("data-state", "done");
    expect(await countChecks(stand.stationId)).toBe(1);
    await page.getByTestId("round-expand-i-line").tap();
    await expect(page.getByTestId("round-marks-i-line")).toContainText(
      "подтаяло",
    );
  });

  test("на станции видны только её обходы: соседняя не подмешивается", async ({
    page,
  }) => {
    const mine = await seedFillStand("своя", { sections: ROUND_SECTIONS });
    const neighbour = await seedFillStand("соседняя", {
      sections: ROUND_SECTIONS,
    });

    // Соседняя станция отметила свой обход.
    await page.goto(stickerPath(neighbour.code));
    await page
      .getByTestId("round-i-line")
      .getByRole("button", { name: "Порядок", exact: true })
      .tap();
    await expect(page.getByTestId("round-i-line")).toHaveAttribute(
      "data-state",
      "done",
    );

    // На своей станции обход по-прежнему не сделан, и чужих отметок не видно.
    await page.goto(stickerPath(mine.code));
    await expect(page.getByTestId("round-i-line")).toHaveAttribute(
      "data-state",
      "due",
    );
    await expect(page.getByTestId("round-expand-i-line")).toHaveCount(0);
    expect(await countChecks(mine.stationId)).toBe(0);
  });
});
