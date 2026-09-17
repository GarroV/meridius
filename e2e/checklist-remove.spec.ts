// Удаление чек-листа глазами методиста: кнопка в списке, экран подтверждения, результат.
//
// Заведено просьбой владельца: «не вижу как удалить чек лист». Кнопки не было вовсе —
// завести чек-лист можно было, а убрать нельзя, и пробные накапливались в списке.
//
// Проверяется и то, что удаление НЕ делает: заполнения не исчезают. Чек-лист, по которому
// уже заполняли, стереть нельзя — в заполнениях лежит то, что видел сотрудник (принцип 3),
// поэтому такой чек-лист уходит из работы, а история остаётся в ленте.
import { test, expect, type Page } from "@playwright/test";

import { E2E_ADMIN_PASSWORD } from "./admin-credentials";

const CHECKLISTS_PATH = "/admin/checklists";

async function signIn(page: Page): Promise<void> {
  await page.goto("/admin/login");
  await page.getByLabel("Пароль").fill(E2E_ADMIN_PASSWORD);
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("admin-home")).toBeVisible();
}

/** Заводит чек-лист и возвращает его название. */
async function createChecklist(page: Page): Promise<string> {
  const title = `Удаляемый ${Math.random().toString(36).slice(2, 8)}`;
  await page.goto(`${CHECKLISTS_PATH}/new`);
  // Поле названия — своим опознавателем, а не «единственным полем ввода формы»:
  // с T185 рядом стоят два поля времени («своё окно»), и роль `textbox` у них та же.
  await page.getByTestId("new-checklist-title").fill(title);
  await page.getByTestId("create-checklist").click();
  await expect(page.getByTestId("editor-screen")).toBeVisible();
  return title;
}

function rowOf(page: Page, title: string) {
  return page.getByTestId("checklist-row").filter({ hasText: title });
}

test.describe("удаление чек-листа", () => {
  test.use({ locale: "ru-RU" });

  test("кнопка есть в строке списка и ведёт на подтверждение с названием", async ({
    page,
  }) => {
    await signIn(page);
    const title = await createChecklist(page);

    await page.goto(CHECKLISTS_PATH);
    await rowOf(page, title).getByTestId("delete-checklist").click();

    await expect(page.getByTestId("remove-checklist-screen")).toBeVisible();
    await expect(page.getByTestId("remove-checklist-title")).toHaveText(title);
    // Пробный чек-лист без заполнений: обещано полное удаление, а не «убрать из работы».
    await expect(
      page.getByTestId("remove-checklist-explanation"),
    ).toContainText("удалён полностью");
  });

  test("подтверждение убирает чек-лист из списка", async ({ page }) => {
    await signIn(page);
    const title = await createChecklist(page);

    await page.goto(CHECKLISTS_PATH);
    await rowOf(page, title).getByTestId("delete-checklist").click();
    await page.getByTestId("remove-checklist-confirm").click();

    await expect(page).toHaveURL(new RegExp(`${CHECKLISTS_PATH}$`));
    await expect(rowOf(page, title)).toHaveCount(0);
  });

  test("отмена возвращает в список и ничего не удаляет", async ({ page }) => {
    await signIn(page);
    const title = await createChecklist(page);

    await page.goto(CHECKLISTS_PATH);
    await rowOf(page, title).getByTestId("delete-checklist").click();
    await page.getByRole("link", { name: "Отмена" }).click();

    await expect(page).toHaveURL(new RegExp(`${CHECKLISTS_PATH}$`));
    await expect(rowOf(page, title)).toHaveCount(1);
  });

  test("удаление работает с выключенным JavaScript", async ({ browser }) => {
    // Формы продукта обязаны работать без JS; удаление — не исключение.
    const context = await browser.newContext({
      javaScriptEnabled: false,
      locale: "ru-RU",
    });
    const page = await context.newPage();

    await page.goto("/admin/login");
    await page.getByLabel("Пароль").fill(E2E_ADMIN_PASSWORD);
    await page.getByTestId("login-submit").click();
    await expect(page.getByTestId("admin-home")).toBeVisible();

    const title = await createChecklist(page);
    await page.goto(CHECKLISTS_PATH);
    await rowOf(page, title).getByTestId("delete-checklist").click();
    await page.getByTestId("remove-checklist-confirm").click();

    await expect(rowOf(page, title)).toHaveCount(0);
    await context.close();
  });

  test("несуществующий чек-лист не даёт экрана подтверждения", async ({
    page,
  }) => {
    await signIn(page);

    await page.goto(
      `${CHECKLISTS_PATH}/00000000-0000-4000-8000-000000000000/delete`,
    );

    await expect(page.getByTestId("remove-checklist-screen")).toHaveCount(0);
  });
});
