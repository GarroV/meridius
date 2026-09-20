// Сквозной сценарий удаления страны из справочника (T267).
//
// Почему в браузере, а не только модульно. Модульный тест держит правило действия
// («без подтверждения ничего не удаляется»), а здесь проверяется то, чего он не
// видит: что вопрос ДОХОДИТ ДО ЭКРАНА и что подтверждение доводит удаление до базы.
// Проверка одного вопроса была бы зелёной и на экране, где кнопка «Удалить»
// перестала работать вовсе, — поэтому оба шага в одном сценарии.
//
// Страна заводится сценарием, а не берётся из фикстуры: удалить можно только
// пустую, а фикстура станций всегда создаёт страну с пиццерией внутри.
import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { E2E_ADMIN_PASSWORD } from "./admin-credentials";

const CATALOG_PATH = "/admin/catalog";

async function signIn(page: Page): Promise<void> {
  await page.goto("/admin/login");
  await page.getByLabel("Пароль").fill(E2E_ADMIN_PASSWORD);
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("admin-home")).toBeVisible();
}

/** Строка страны в дереве. Имя уникальное, поэтому строка ровно одна. */
function countryItem(page: Page, name: string): Locator {
  return page.getByTestId("country-item").filter({ hasText: name });
}

/**
 * Заводит пустую страну и возвращает её название.
 *
 * Название уникальное: прогоны идут параллельно в одной базе, и две страны с одним
 * именем сделали бы проверку «страна исчезла» зависящей от соседнего сценария.
 */
async function createEmptyCountry(page: Page): Promise<string> {
  const name = `Страна ${String(Date.now())}${String(
    Math.floor(Math.random() * 1000),
  )}`;

  await page.goto(`${CATALOG_PATH}?create=country`);
  // Поиск сужен деревом: поле «Название» есть и в карточке правки справа, и
  // Playwright справедливо отказывается выбирать за нас (проверено падением).
  const form = page.getByTestId("catalog-tree");
  await form.getByLabel("Название").fill(name);
  await form.getByRole("button", { name: "Добавить" }).click();
  await expect(countryItem(page, name)).toBeVisible();

  return name;
}

test.describe("удаление страны", () => {
  // Эталон и тексты справочника русские, поэтому и браузер русский.
  test.use({ locale: "ru-RU" });

  test("один клик по «Удалить страну» спрашивает, и только второй удаляет", async ({
    page,
  }) => {
    await signIn(page);
    const name = await createEmptyCountry(page);

    await page.getByRole("button", { name: "Удалить страну" }).click();

    // Вопрос назван: без имени страны карточка спрашивала бы ни о чём.
    const card = page.getByTestId("confirm-card");
    await expect(card).toBeVisible();
    await expect(card).toContainText(name);

    // Страна на месте — перезагрузка не ритуал: без неё читалась бы разметка
    // прошлого показа, и «не удалилась» подтвердилось бы кэшем, а не базой.
    await page.goto(CATALOG_PATH);
    await expect(countryItem(page, name)).toBeVisible();

    // Второй шаг доводит удаление до базы.
    await countryItem(page, name).click();
    await page.getByRole("button", { name: "Удалить страну" }).click();
    await page.getByTestId("confirm-delete-country").click();
    // Ждём сам переход, а не «сразу перезагружаем»: `goto` посреди отправки формы
    // обрывает серверное действие, и проверка краснеет на живом, работающем экране
    // (поймано здесь же первым прогоном). Удалившись, экран возвращает в справочник
    // без выбранной страны — её больше нет.
    await expect(page).toHaveURL(new RegExp(`${CATALOG_PATH}$`));

    await page.goto(CATALOG_PATH);
    await expect(countryItem(page, name)).toHaveCount(0);
  });
});
