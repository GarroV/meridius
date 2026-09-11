// Сквозной сценарий библиотеки переиспользуемых блоков: заведение блока, явная пометка
// «нигде не используется», появление ссылки на чек-лист после вставки, изменение сводки
// после публикации и переход секции из связанной в обычную при отвязке.
//
// Экран (`LibraryScreen`) сам ничего не решает — вся эта логика посчитана в
// `build-model.ts` и `usages.ts` на живых данных БД. Поэтому проверяем через настоящий
// браузер и настоящую базу, а не мокаем модель: иначе тест доказывал бы только то,
// что разметка верна для придуманных данных, а не то, что подсчёт использования работает.
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { E2E_ADMIN_PASSWORD } from "./admin-credentials";

const LIBRARY_PATH = "/admin/library";
const CHECKLISTS_PATH = "/admin/checklists";

function label(): string {
  return Math.random().toString(36).slice(2, 8);
}

async function signIn(page: Page): Promise<void> {
  await page.goto("/admin/login");
  await page.getByLabel("Пароль").fill(E2E_ADMIN_PASSWORD);
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("admin-home")).toBeVisible();
}

/**
 * Заводит блок через «+ Новый блок» и сразу вписывает название и один пункт.
 * Кнопка сама даёт блоку служебное имя по умолчанию — методист правит его тем же полем,
 * которым потом правит всегда, отдельной формы заведения нет (см. `BlockEditor.tsx`).
 */
async function createBlock(
  page: Page,
  title: string,
  itemTitle: string,
): Promise<string> {
  await page.goto(LIBRARY_PATH);
  await page.getByTestId("new-block").click();

  await expect(page.getByTestId("block-editor")).toBeVisible();
  await expect(page).toHaveURL(/[?&]block=/);
  await expect(page.getByTestId("block-no-items")).toBeVisible();

  await page.getByTestId("block-title").fill(title);
  await page.getByTestId("add-block-item").click();
  await page.getByTestId("item-title").first().fill(itemTitle);
  await page.getByTestId("save-block").click();
  await expect(page.getByTestId("block-saved")).toBeVisible();

  return page.url();
}

/** Заводит чек-лист через экран заведения и возвращает адрес его редактора. */
async function createChecklist(page: Page, title: string): Promise<string> {
  await page.goto(`${CHECKLISTS_PATH}/new`);
  await page.getByTestId("new-checklist-form").getByRole("textbox").fill(title);
  await page.getByTestId("create-checklist").click();
  await expect(page.getByTestId("editor-screen")).toBeVisible();
  return page.url();
}

/**
 * Вставляет блок библиотеки в открытый чек-лист по его названию — так же, как это
 * делает методист: сначала «вставить блок» показывает панель, потом нажатие на свой
 * блок в ней. Панелей с этим testid на экране в этот момент две (та же лежит и в
 * правой колонке всегда) — берём первую, ту что появилась под секциями.
 */
async function insertBlockByTitle(
  page: Page,
  blockTitle: string,
): Promise<void> {
  await page.getByTestId("insert-block").click();
  const panel = page.getByTestId("library-panel").first();
  await panel
    .getByTestId("library-block")
    .filter({ hasText: blockTitle })
    .getByTestId("library-insert")
    .click();
}

test.describe("библиотека переиспользуемых блоков", () => {
  // Эталон и тексты сценария русские, поэтому и браузер русский.
  test.use({ locale: "ru-RU" });

  test("новый блок заводится и сразу открывается на правку", async ({
    page,
  }) => {
    const title = `Блок открытия ${label()}`;
    const itemTitle = "Проверить холодильник";

    await signIn(page);
    await createBlock(page, title, itemTitle);

    // Правка пережила перезагрузку — значит она в базе, а не только в состоянии формы.
    await page.reload();
    await expect(page.getByTestId("block-title")).toHaveValue(title);
    await expect(page.getByTestId("item-title").first()).toHaveValue(itemTitle);
  });

  test("блок, не вставленный никуда, помечен явно", async ({ page }) => {
    const title = `Одинокий блок ${label()}`;
    await signIn(page);
    await createBlock(page, title, "Проверить кассу");

    // Строка в списке слева должна прямо назвать блок неиспользуемым — иначе методист
    // не отличит его от вставленного и будет считать, что правка куда-то уже уехала.
    const row = page.getByTestId("library-block").filter({ hasText: title });
    await expect(row.getByTestId("block-unused")).toBeVisible();

    await expect(page.getByTestId("block-usages")).toBeVisible();
    await expect(page.getByTestId("usages-empty")).toBeVisible();
  });

  test("вставленный в черновик блок виден в «где используется» со ссылкой на чек-лист", async ({
    page,
  }) => {
    const blockTitle = `Блок для черновика ${label()}`;
    const checklistTitle = `Открытие кухни ${label()}`;

    await signIn(page);
    const blockUrl = await createBlock(page, blockTitle, "Проверить пол");

    await createChecklist(page, checklistTitle);
    await insertBlockByTitle(page, blockTitle);
    await page.getByTestId("save-draft").click();
    await expect(page.getByTestId("editor-meta")).toHaveText(
      "Черновик сохранён",
    );

    await page.goto(blockUrl);
    const usageLinks = page.getByTestId("usage-link");
    await expect(usageLinks).toHaveCount(1);
    await expect(usageLinks.first()).toContainText(checklistTitle);
    await expect(usageLinks.first()).toHaveAttribute("data-published", "false");

    const impact = page.getByTestId("usage-impact");
    await expect(impact).toHaveAttribute("data-drafts", "1");
    await expect(impact).toHaveAttribute("data-published", "0");
  });

  test("после публикации сводка называет и опубликованные версии", async ({
    page,
  }) => {
    const blockTitle = `Блок для публикации ${label()}`;
    const checklistTitle = `Закрытие кухни ${label()}`;

    await signIn(page);
    const blockUrl = await createBlock(page, blockTitle, "Выключить печь");

    await createChecklist(page, checklistTitle);
    await insertBlockByTitle(page, blockTitle);
    await page.getByTestId("publish").click();
    // Дожидаемся подтверждения публикации, а не просто клика — иначе на экране
    // библиотеки можно застать ещё не сохранённое состояние.
    await expect(page.getByTestId("editor-published")).toContainText("1");

    await page.goto(blockUrl);
    const usageLinks = page.getByTestId("usage-link");
    await expect(usageLinks).toHaveCount(1);
    await expect(usageLinks.first()).toHaveAttribute("data-published", "true");

    const impact = page.getByTestId("usage-impact");
    await expect(impact).toHaveAttribute("data-drafts", "1");
    await expect(impact).toHaveAttribute("data-published", "1");
  });

  test("отвязка превращает секцию в обычную, содержимое остаётся", async ({
    page,
  }) => {
    const blockTitle = `Блок для отвязки ${label()}`;
    const checklistTitle = `Разморозка ${label()}`;
    const itemTitle = "Проверить маркировку";

    await signIn(page);
    const blockUrl = await createBlock(page, blockTitle, itemTitle);

    const editorUrl = await createChecklist(page, checklistTitle);
    await insertBlockByTitle(page, blockTitle);
    await page.getByTestId("save-draft").click();
    await expect(page.getByTestId("editor-meta")).toHaveText(
      "Черновик сохранён",
    );

    // Секция вставленного блока — единственная с кнопкой «отвязать»: своя секция
    // такой кнопки не показывает (SectionCard.tsx).
    await expect(page.getByTestId("section-unlink")).toHaveCount(1);
    await page.getByTestId("section-unlink").click();
    // Отвязка сначала меняет состояние экрана — кнопки больше нет; только после этого
    // есть что сохранять.
    await expect(page.getByTestId("section-unlink")).toHaveCount(0);

    // Ждём именно ответ сервера, а не надпись «Черновик сохранён»: она стоит на экране
    // с ПЕРВОГО сохранения и второе не отличает. Проверка по ней проходила мгновенно,
    // уход со страницы обрывал незавершённое сохранение, и отвязка не доезжала до базы —
    // тест был красным по своей вине, а выглядел как ошибка продукта.
    const saved = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" && response.status() < 400,
    );
    await page.getByTestId("save-draft").click();
    await saved;

    await page.goto(editorUrl);
    await expect(page.getByTestId("editor-screen")).toBeVisible();

    // Пункт остался и стал обычным, правимым: отвязка меняет только опознаватели
    // пунктов и признак связи с блоком, а не содержимое (editing.ts: unlinkSection).
    // У вставленного блока пункты показываются нередактируемой строкой, поэтому само
    // наличие поля ввода с этим текстом и есть доказательство, что секция стала своей.
    const items = page.getByTestId("item-title");
    await expect(items).toHaveCount(1);
    await expect(items.first()).toHaveValue(itemTitle);
    // Кнопки «отвязать» больше нет нигде на экране — секция стала обычной.
    await expect(page.getByTestId("section-unlink")).toHaveCount(0);

    await page.goto(blockUrl);
    await expect(page.getByTestId("usages-empty")).toBeVisible();
    await expect(page.getByTestId("usage-link")).toHaveCount(0);
  });
});
