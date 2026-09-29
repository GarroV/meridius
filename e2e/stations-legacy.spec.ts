// Старые точки привязки сняты (T312, #165, D163): чек-лист, наклейка и планшет живут на
// карточке станции, а не в трёх разделах сразу.
//
// Сценарий держит то, что снятое не вернулось: в меню нет «QR-кодов» и «Устройств»,
// их адреса уводят в «Станции», а экран чек-листа не выбирает станцию и не выпускает
// код планшета — только подсказывает, куда за этим идти.
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { Pool } from "pg";

import { E2E_ADMIN_PASSWORD } from "./admin-credentials";
import { e2eDatabaseUrl } from "./database";
import { seedFillStand } from "./fill-fixtures";

/** Чек-лист станции фикстуры: экран чек-листа открывается по нему. */
async function checklistOf(stationId: string): Promise<string> {
  const pool = new Pool({ connectionString: e2eDatabaseUrl() });
  try {
    const { rows } = await pool.query<{ id: string }>(
      "select id from checklists where station_id = $1 limit 1",
      [stationId],
    );
    const id = rows[0]?.id;
    if (id === undefined) throw new Error("У станции фикстуры нет чек-листа");
    return id;
  } finally {
    await pool.end();
  }
}

async function signIn(page: Page): Promise<void> {
  await page.goto("/admin/login");
  await page.getByLabel("Пароль").fill(E2E_ADMIN_PASSWORD);
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("admin-home")).toBeVisible();
}

test.describe("старые точки привязки", () => {
  test.use({ locale: "ru-RU" });

  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("в меню нет «QR-кодов» и «Устройств», а их адреса ведут в «Станции»", async ({
    page,
  }) => {
    await expect(page.getByTestId("nav-stations")).toBeVisible();
    await expect(page.getByTestId("nav-qr")).toHaveCount(0);
    await expect(page.getByTestId("nav-devices")).toHaveCount(0);

    for (const path of ["/admin/qr", "/admin/devices"]) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/admin\/stations$/);
      await expect(page.getByTestId("stations-screen")).toBeVisible();
    }
  });

  test("экран чек-листа не привязывает, а ведёт на карточку его станции", async ({
    page,
  }) => {
    const stand = await seedFillStand("legacy");

    // Старая ссылка «Устройств» на станцию — на карточку этой станции.
    await page.goto(`/admin/devices?station=${stand.stationId}`);
    await expect(page).toHaveURL(
      new RegExp(`/admin/stations/${stand.stationId}$`),
    );
    await expect(page.getByTestId("attached-checklist")).toHaveCount(1);

    // Экран чек-листа этой станции: ни поля станции, ни кода планшета.
    const checklistId = await checklistOf(stand.stationId);
    await page.goto(`/admin/checklists/${checklistId}`);
    await expect(page.getByTestId("editor-screen")).toBeVisible();
    await expect(page.getByTestId("checklist-station")).toHaveCount(0);
    await expect(page.getByTestId("pair-tablet-card")).toHaveCount(0);
    await expect(page.getByTestId("pair-tablet")).toHaveCount(0);

    // Подсказка называет станцию и ведёт на её карточку.
    const notice = page.getByTestId("station-notice");
    await expect(notice).toContainText(stand.stationName);
    await notice.getByTestId("station-notice-link").click();
    await expect(page).toHaveURL(
      new RegExp(`/admin/stations/${stand.stationId}$`),
    );
    await expect(page.getByTestId("station-tablet-card")).toBeVisible();
  });
});
