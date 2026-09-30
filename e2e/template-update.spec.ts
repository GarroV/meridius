// «Шаблон обновился» на копии (T336, D154, D155): одна цепочка человека целиком —
// завёл шаблон → раскатил на две станции → обновил шаблон → копия показывает
// расхождение → одна копия берёт часть отличий через черновик, другая оставляет как есть.
//
// Правила отличий и переноса закрыты тестами (`editor/template-diff.test.ts`,
// `editor/template-updates.test.ts`). Здесь то, чего они не видят: что приглашение
// доезжает до экрана копии, панель отличий открывается поверх редактора, отметки
// уходят формой, а редактор после переноса показывает взятое, а не прежнее состояние.
import { expect, test, type Page } from "@playwright/test";

import { E2E_ADMIN_PASSWORD } from "./admin-credentials";
import { seedStationWithoutChecklist } from "./fill-fixtures";

const OLD_ITEM = "Проверить холодильник";
const NEW_ITEM = "Проверить холодильник и морозилку";
const ADDED_ITEM = "Вынести тесто";

async function login(page: Page) {
  await page.goto("/admin/login");
  await page.getByLabel("Пароль").fill(E2E_ADMIN_PASSWORD);
  await page.locator('input[name="login"]').fill("admin");
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("admin-home")).toBeVisible();
}

async function createPublishedTemplate(page: Page, title: string) {
  await page.goto("/admin/templates");
  await page.getByTestId("new-template").click();
  await page.getByTestId("new-checklist-title").fill(title);
  await page.getByTestId("create-checklist").click();
  await expect(page.getByTestId("editor-screen")).toBeVisible();
  await page.getByTestId("item-title").first().fill(OLD_ITEM);
  await page.getByTestId("publish").click();
  await expect(page.getByTestId("editor-published")).toContainText("1");
  return new URL(page.url()).pathname.split("/").at(-1) ?? "";
}

async function openCopy(page: Page, title: string, stationName: string) {
  await page.goto(`/admin/checklists?q=${encodeURIComponent(title)}`);
  await page
    .getByTestId("checklist-row")
    .filter({ hasText: stationName })
    .click();
  await expect(page.getByTestId("editor-screen")).toBeVisible();
  await expect(page.getByTestId("checklist-title")).toHaveValue(title);
}

test.describe("шаблон обновился", () => {
  test.use({ locale: "ru-RU" });

  test("копии раскатки видят обновление и решают каждая сама", async ({
    page,
  }) => {
    await login(page);
    const title = `Шаблон обновления ${String(Date.now())}`;
    const templateId = await createPublishedTemplate(page, title);
    const first = await seedStationWithoutChecklist("обновления-1", "ru");
    const second = await seedStationWithoutChecklist("обновления-2", "ru");

    // Раскатка на две станции.
    await page.goto(`/admin/stations?template=${templateId}`);
    for (const station of [first, second]) {
      await page
        .getByTestId("station-row")
        .filter({ hasText: station.stationName })
        .getByTestId("station-pick")
        .check();
    }
    await page.getByTestId("rollout-submit").click();
    await expect(page).toHaveURL(/copied=2/);

    // Копия раскатки открывается с пунктами шаблона, и обновления пока нет.
    await openCopy(page, title, first.stationName);
    await expect(page.getByTestId("item-title").first()).toHaveValue(OLD_ITEM);
    await expect(page.getByTestId("template-origin")).toContainText("версия 1");
    await expect(page.getByTestId("template-update")).toHaveCount(0);

    // Методист УК правит шаблон: один пункт меняет, второй добавляет.
    await page.goto(`/admin/checklists/${templateId}`);
    const itemTitle = page.getByTestId("item-title").first();
    await itemTitle.fill(NEW_ITEM);
    await itemTitle.press("Enter");
    await page.getByTestId("item-title").nth(1).fill(ADDED_ITEM);
    await page.getByTestId("publish").click();
    await expect(page.getByTestId("editor-published")).toContainText("2");

    // Первая копия: приглашение, отличия, берём только изменённый пункт.
    await openCopy(page, title, first.stationName);
    const invite = page.getByTestId("template-update");
    await expect(invite).toContainText("обновился: версия 2");
    await invite.getByTestId("template-update-view").click();

    const panel = page.getByTestId("template-update-screen");
    await expect(panel).toBeVisible();
    await expect(panel.getByTestId("template-changes-changed")).toContainText(
      NEW_ITEM,
    );
    await expect(panel.getByTestId("template-changes-added")).toContainText(
      ADDED_ITEM,
    );
    await panel
      .getByTestId("template-changes-added")
      .getByRole("checkbox")
      .uncheck();
    await panel.getByTestId("template-update-take").click();

    await expect(page.getByTestId("template-update-screen")).toHaveCount(0);
    await expect(page.getByTestId("template-origin")).toContainText("версия 2");
    await expect(page.getByTestId("item-title")).toHaveCount(1);
    await expect(page.getByTestId("item-title").first()).toHaveValue(NEW_ITEM);

    // Вторая копия оставляет как есть: строка гаснет, содержимое прежнее.
    await openCopy(page, title, second.stationName);
    await page.getByTestId("template-update-dismiss").click();
    await expect(page.getByTestId("template-update")).toHaveCount(0);
    await expect(page.getByTestId("template-origin")).toContainText("версия 1");
    await expect(page.getByTestId("item-title").first()).toHaveValue(OLD_ITEM);
  });
});
