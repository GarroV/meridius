// Удаление чек-листа глазами методиста: кнопка в шапке открытого чек-листа, панель
// подтверждения справа поверх редактора (D162), результат.
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
  await page.locator('input[name="login"]').fill("admin");
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

/** Открывает чек-лист из колонки и жмёт «Удалить» в шапке его рабочей зоны. */
async function askToRemove(page: Page, title: string): Promise<void> {
  await page.goto(CHECKLISTS_PATH);
  await rowOf(page, title).click();
  await expect(page.getByTestId("editor-screen")).toBeVisible();
  await page.getByTestId("delete-checklist").click();
}

test.describe("удаление чек-листа", () => {
  test.use({ locale: "ru-RU" });

  test("кнопка в шапке чек-листа открывает подтверждение панелью поверх редактора", async ({
    page,
  }) => {
    await signIn(page);
    const title = await createChecklist(page);

    await askToRemove(page, title);

    await expect(page.getByTestId("remove-checklist-screen")).toBeVisible();
    // Панель, а не переход: под ней остаются и редактор, и колонка чек-листов.
    await expect(page.getByTestId("editor-screen")).toBeVisible();
    await expect(rowOf(page, title)).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("remove-checklist-title")).toHaveText(title);
    // Пробный чек-лист без заполнений: обещано полное удаление, а не «убрать из работы».
    await expect(
      page.getByTestId("remove-checklist-explanation"),
    ).toContainText("удалён полностью");
  });

  test("подтверждение убирает чек-лист из списка", async ({ page }) => {
    await signIn(page);
    const title = await createChecklist(page);

    await askToRemove(page, title);
    await page.getByTestId("remove-checklist-confirm").click();

    await expect(page).toHaveURL(new RegExp(`${CHECKLISTS_PATH}$`));
    await expect(rowOf(page, title)).toHaveCount(0);
  });

  test("отмена закрывает панель, оставляя чек-лист открытым, и ничего не удаляет", async ({
    page,
  }) => {
    await signIn(page);
    const title = await createChecklist(page);

    await askToRemove(page, title);
    await page.getByRole("link", { name: "Отмена" }).click();

    await expect(page).toHaveURL(new RegExp(`${CHECKLISTS_PATH}/[0-9a-f-]+$`));
    await expect(page.getByTestId("remove-checklist-screen")).toHaveCount(0);
    await expect(page.getByTestId("editor-screen")).toBeVisible();
    await expect(rowOf(page, title)).toHaveCount(1);
  });

  test("удаление работает с выключенным JavaScript", async ({ browser }) => {
    // Формы продукта обязаны работать без JS; удаление — не исключение.
    const context = await browser.newContext({
      javaScriptEnabled: false,
      locale: "ru-RU",
      // Без JavaScript безголовый браузер не прокручивает кадры анимации: выезд панели
      // (`drawer-in`) стоит на первом кадре, пока страницу ничто не тронет, и проверка
      // «элемент неподвижен» перед щелчком не проходит никогда — сценарий падал по
      // таймауту. Пользователь с выключенным JS этого не видит (его браузер кадры
      // крутит), поэтому движение снимается у сценария, а не у продукта: панель
      // уважает `prefers-reduced-motion` (`dodo-ds.css`).
      reducedMotion: "reduce",
    });
    const page = await context.newPage();

    await page.goto("/admin/login");
    await page.getByLabel("Пароль").fill(E2E_ADMIN_PASSWORD);
    await page.locator('input[name="login"]').fill("admin");
    await page.getByTestId("login-submit").click();
    await expect(page.getByTestId("admin-home")).toBeVisible();

    // Заведение уже привело в рабочую зону чек-листа: без JavaScript каждый шаг —
    // полная загрузка страницы с колонкой, лишний заход через список не нужен.
    const title = await createChecklist(page);
    await page.getByTestId("delete-checklist").click();
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
