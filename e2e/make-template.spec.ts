// «Сделать шаблоном» из шапки редактора (D174): тем путём, каким это делает методист.
// Смысл ядра — какая версия уходит в шаблон, отказы — проверен на базе
// (`src/blocks/editor/make-template.test.ts`); здесь — что кнопка есть, ведёт в
// редактор шаблона, шаблон виден в разделе, а у чек-листа кнопка пропадает.
import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";

import { E2E_ADMIN_PASSWORD } from "./admin-credentials";
import { e2eDatabaseUrl } from "./database";
import { seedFillStand } from "./fill-fixtures";

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
  await page.locator('input[name="login"]').fill("admin");
  await page.locator('input[name="password"]').fill(E2E_ADMIN_PASSWORD);
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("admin-home")).toBeVisible();
}

test("опубликованный чек-лист становится шаблоном, кнопка у него пропадает", async ({
  page,
}) => {
  const stand = await seedFillStand("сделать-шаблоном");
  const checklistId = await checklistOf(stand.stationId);
  await signIn(page);

  await page.goto(`/admin/checklists/${checklistId}`);
  await page.getByTestId("make-template").click();

  // Редактор шаблона: новый адрес, путь над заголовком — раздел «Шаблоны».
  await expect(page).not.toHaveURL(new RegExp(checklistId));
  await expect(page.getByTestId("editor-screen")).toBeVisible();
  const templateUrl = page.url();
  const templateId = templateUrl.split("/").pop() ?? "";

  await page.goto("/admin/templates");
  await expect(
    page.locator(`[data-testid="template-card"]:has(a[href*="${templateId}"])`),
  ).toHaveCount(1);

  // Чек-лист теперь копия шаблона: второй шаблон из него не сделать.
  await page.goto(`/admin/checklists/${checklistId}`);
  await expect(page.getByTestId("editor-screen")).toBeVisible();
  await expect(page.getByTestId("make-template")).toHaveCount(0);
});
