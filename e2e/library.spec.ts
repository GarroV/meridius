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
import { Pool } from "pg";

import { E2E_ADMIN_PASSWORD } from "./admin-credentials";
import { e2eDatabaseUrl } from "./database";

const LIBRARY_PATH = "/admin/library";
const CHECKLISTS_PATH = "/admin/checklists";
// Задержка ответа сервера на заведение блока в проверке помощника: столько держится
// первый POST, чтобы переход к новому блоку заведомо не успел доехать раньше печати.
const SLOW_CREATE_RESPONSE_MS = 800;

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
 *
 * Постусловие здесь из двух половин, и ни одна не заменяет вторую (T130, тот же приём
 * и та же причина, что в T121 у редактора):
 *  • адрес сменился — значит переход к новому блоку начался, а не только нажалась кнопка;
 *  • на экране форма ИМЕННО этого блока (`data-block-id`) и она ожила (`data-live`).
 *
 * Почему прежних трёх проверок («форма правки видна», «в адресе есть `?block=`», «пунктов
 * нет») не хватало — и почему они при этом были зелёными. Экран библиотеки показывает
 * правку выбранного блока ВСЕГДА: пока переход к новому блоку едет, на экране стоит форма
 * прежнего блока с тем же `data-testid`, а в адресе — `?block=` прежнего блока. Все три
 * проверки в этот момент удовлетворяет прежний блок, если у того нет пунктов, — а это
 * обычное состояние только что заведённого и ещё не наполненного блока, не подстроенная
 * гонка. Спасала только эта случайность: у остальных блоков пункты есть.
 *
 * **Измерено зондом 13.09.2026** (ответ сервера на заведение задержан на 800 мс, как на
 * медленной кухонной сети): все три проверки прошли на +35/+36/+37 мс, до всякого
 * перехода; печать названия и «Сохранить» ушли в форму ПРЕЖНЕГО блока — у формы есть
 * скрытое поле `blockId`, поэтому сохранение адресуется тем блоком, чья форма на экране.
 * В базе после прогона: у прежнего блока название и пункт, напечатанные для нового, у
 * нового — «Новый блок» и ноль пунктов. Исключения не было ни одного; сценарий падал
 * позже и не там — на ненайденном `block-saved`, то есть с причиной, указывающей мимо.
 *
 * Дальше всё делается ВНУТРИ опознанной формы, а не по странице: второй такой формы на
 * экране быть не должно, но искать вслепую по `data-testid` — ровно та ошибка, которая
 * и привела к подмене блока.
 */
async function createBlock(
  page: Page,
  title: string,
  itemTitle: string,
): Promise<string> {
  await page.goto(LIBRARY_PATH);

  const before = page.url();
  await page.getByTestId("new-block").click();
  await page.waitForFunction((url) => globalThis.location.href !== url, before);

  const blockId = new URL(page.url()).searchParams.get("block") ?? "";
  expect(blockId).not.toBe("");

  const editor = page.locator(
    `[data-testid="block-editor"][data-block-id="${blockId}"][data-live="true"]`,
  );
  await expect(
    editor,
    "Правка нового блока так и не ожила: на экране либо форма прежнего блока, либо " +
      "ещё не оживший экран. Напечатанное название и пункт ушли бы в чужой блок " +
      "молча — у формы скрытое поле `blockId`.",
  ).toHaveCount(1);

  // Проверка продукта, а не готовности экрана: у только что заведённого блока пунктов
  // нет, и экран обязан сказать это явно (DoD 5). Раньше эта же строка случайно
  // работала постусловием — и именно поэтому дефект не проявлялся.
  await expect(editor.getByTestId("block-no-items")).toBeVisible();

  await editor.getByTestId("block-title").fill(title);
  await editor.getByTestId("add-block-item").click();
  await editor.getByTestId("item-title").first().fill(itemTitle);
  await editor.getByTestId("save-block").click();
  await expect(
    editor.getByTestId("block-saved"),
    "Блок не подтвердил сохранение. Подтверждение ищется внутри формы этого же блока: " +
      "подтверждение на экране другого блока означало бы, что правка уехала не туда.",
  ).toBeVisible();

  // Адрес собирается из опознавателя, проверенного выше, а не из `page.url()`: к этому
  // моменту адрес мог уже уехать, и вызывающий получил бы ссылку на чужой блок.
  return `${LIBRARY_PATH}?block=${blockId}`;
}

/** Заводит чек-лист через экран заведения и возвращает адрес его редактора. */
async function createChecklist(page: Page, title: string): Promise<string> {
  await page.goto(`${CHECKLISTS_PATH}/new`);
  // Поле названия — своим опознавателем, а не «единственным полем ввода формы»:
  // с T185 рядом стоят два поля времени («своё окно»), и роль `textbox` у них та же.
  await page.getByTestId("new-checklist-title").fill(title);
  await page.getByTestId("create-checklist").click();
  await expect(page.getByTestId("editor-screen")).toBeVisible();
  return page.url();
}

/**
 * Вставляет блок библиотеки в открытый чек-лист по его названию — так же, как это
 * делает методист: сначала «вставить блок» показывает панель, потом нажатие на свой
 * блок в ней.
 *
 * Тот же класс слепоты, что в `createBlock` выше, и чинится так же (T130). Кнопка
 * «Вставить блок» клиентская, запасного пути у неё нет: до того как редактор ожил, она
 * принимает нажатие и НИЧЕГО не открывает. Снаружи потеря нажатия не видна вовсе —
 * панель библиотеки стоит в правой колонке всегда, и `.first()` молча брал бы её вместо
 * так и не открывшейся (в редакторе на этом же месте порча «кнопка ничего не открывает»
 * проходила молча, T121). Поэтому: сначала спрашиваем продукт, ожил ли он, а открытие
 * панели проверяем счётом — панелей становится две.
 */
async function insertBlockByTitle(
  page: Page,
  blockTitle: string,
): Promise<void> {
  await expect(
    page.locator('[data-testid="insert-block"][data-live="true"]'),
    "Редактор чек-листа так и не ожил: нажатие по «Вставить блок» ушло бы в пустоту.",
  ).toHaveCount(1);

  await page.getByTestId("insert-block").click();
  await expect(
    page.getByTestId("library-panel"),
    "Панель библиотеки под секциями не открылась: нажатие не сработало, а постоянная " +
      "панель в правой колонке выдала бы себя за открывшуюся.",
  ).toHaveCount(2);

  await page
    .getByTestId("library-panel")
    .first()
    .getByTestId("library-block")
    .filter({ hasText: blockTitle })
    .getByTestId("library-insert")
    .click();
}

/**
 * Блок с расписанием, заведённый прямо в базе.
 *
 * Через экран такого блока не собрать, и это не обход проверки, а сама механика: чип
 * блока показывает регулярность и не настраивает её — часы отрезка считаются от окна
 * чек-листа, а у блока окна нет и не заводится (D097). Данные с расписанием приезжают
 * импортом и прежними редакциями, и относительная подпись обязана их показать.
 */
async function seedBlockWithSchedule(
  title: string,
  itemTitle: string,
  schedule: readonly { from: string; to: string; everyMinutes: number }[],
): Promise<string> {
  const pool = new Pool({ connectionString: e2eDatabaseUrl() });
  try {
    const { rows } = await pool.query<{ id: string }>(
      "insert into blocks (title, items) values ($1, $2) returning id",
      [
        JSON.stringify({ ru: title, en: title }),
        JSON.stringify([
          {
            id: crypto.randomUUID(),
            title: { ru: itemTitle, en: itemTitle },
            type: "bool",
            schedule,
          },
        ]),
      ],
    );
    const id = rows[0]?.id;
    expect(id, "Блок с расписанием не завёлся").toBeDefined();
    return id ?? "";
  } finally {
    await pool.end();
  }
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

    // Чип регулярности стоит в строке пункта блока так же, как в чек-листе (D096):
    // у только что заведённого пункта расписания нет, и чип обязан сказать это словом,
    // а не отсутствовать. Раньше на этом экране чипа не было вовсе (T198).
    const chip = page.getByTestId("item-schedule-chip");
    await expect(chip).toHaveCount(1);
    await expect(chip).toHaveAttribute("data-kind", "none");
    await expect(chip).toHaveText("Разово");
  });

  test("чип блока называет отрезок относительным, без часов суток", async ({
    page,
  }) => {
    const title = `Блок с расписанием ${label()}`;
    const blockId = await seedBlockWithSchedule(
      title,
      "Проверить температуру",
      // Два отрезка с одним шагом: без часов суток это ОДНО утверждение «каждые
      // 2 часа», и показать его дважды значило бы показать различие, которого нет.
      [
        { from: "07:00", to: "11:00", everyMinutes: 120 },
        { from: "14:00", to: "18:00", everyMinutes: 120 },
      ],
    );

    await signIn(page);
    await page.goto(`${LIBRARY_PATH}?block=${blockId}`);

    const editor = page.locator(
      `[data-testid="block-editor"][data-block-id="${blockId}"]`,
    );
    const chip = editor.getByTestId("item-schedule-chip");
    await expect(chip).toHaveCount(1);
    await expect(chip).toHaveAttribute("data-kind", "every");
    await expect(chip).toHaveText("каждые 2 часа");

    // Главное утверждение сценария: часы окна на экране блока не показываются ни в
    // каком виде. Они принадлежат чек-листу, который блок подключает, и блок, живущий
    // сразу в нескольких чек-листах, назвал бы здесь часы одного из них наугад.
    await expect(chip).not.toContainText("07:00");
    await expect(chip).not.toContainText("14:00");

    // Чип показывает, а не открывает: нажимать нечего, и снаружи это должно быть видно.
    await expect(chip).toHaveJSProperty("tagName", "SPAN");
    await expect(chip).toHaveAttribute("data-relative", "true");
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

  test("правка доезжает до нового блока, а не до того, чья форма стоит на экране во время перехода", async ({
    page,
  }) => {
    await signIn(page);

    // Библиотека должна быть непустой: экран без `?block=` открывает правку первого блока
    // (`build-model.ts`), и именно его форма стоит на экране, пока едет переход к новому.
    // На пустой библиотеке ставить нечего, и проверка была бы зелёной ни о чём.
    await createBlock(
      page,
      `Блок, стоящий на экране ${label()}`,
      "Проверить морозильник",
    );

    await page.goto(LIBRARY_PATH);
    const onScreenId = await page
      .getByTestId("block-editor")
      .getAttribute("data-block-id");

    // Медленный ответ ИМЕННО на заведение следующего блока: медленная кухонная сеть, а
    // не быстрый localhost. Без задержки гонка локально обычно разрешается в пользу
    // перехода, и подмена блока не воспроизводится вовсе — то есть проверка была бы
    // зелёной по случайности машины, а не по постусловию помощника. Задержка только на
    // первом POST: сохранение должно идти обычной скоростью.
    let createDelayed = false;
    await page.route("**/admin/library**", async (route) => {
      if (route.request().method() !== "POST" || createDelayed) {
        await route.continue();
        return;
      }
      createDelayed = true;
      await new Promise((resolve) => {
        setTimeout(resolve, SLOW_CREATE_RESPONSE_MS);
      });
      await route.continue();
    });

    const title = `Блок после медленного перехода ${label()}`;
    const itemTitle = "Проверить вытяжку";
    const blockUrl = await createBlock(page, title, itemTitle);
    await page.unroute("**/admin/library**");

    const newBlockId = new URL(blockUrl, "http://localhost").searchParams.get(
      "block",
    );
    // Гонка была настоящей: на экране в момент нажатия стояла форма ДРУГОГО блока.
    expect(
      onScreenId,
      "На экране не было формы другого блока — значит подмену этот прогон и не мог " +
        "воспроизвести, а зелёный результат ничего не доказывает.",
    ).not.toBe(newBlockId);

    // Главное: напечатанное осело в НОВОМ блоке. Помощник до правки в этот момент уже
    // отрапортовал бы успех, а название с пунктом ушли бы в блок, стоявший на экране
    // (у формы скрытое поле `blockId`) — измерено зондом 13.09.2026.
    await page.goto(blockUrl);
    await expect(page.getByTestId("block-title")).toHaveValue(title);
    await expect(page.getByTestId("item-title").first()).toHaveValue(itemTitle);
  });
});
