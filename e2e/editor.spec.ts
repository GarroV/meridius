// Сквозной сценарий редактора: то, ради чего блок и строился. Чек-лист набирается
// с клавиатуры, список вставляется из буфера одним нажатием, черновик сохраняется,
// версия публикуется, предпросмотр показывает то же, что увидит сотрудник.
//
// Клавиатура проверяется настоящими событиями браузера (page.keyboard), а вставка —
// настоящим буфером обмена: вызов обработчика напрямую доказал бы только то, что
// обработчик существует.
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { E2E_ADMIN_PASSWORD } from "./admin-credentials";
import { seedStation } from "./database";

const CHECKLISTS_PATH = "/admin/checklists";
const LIBRARY_PATH = "/admin/library";

// Список ровно в том виде, в каком его копируют из Word: маркеры, нумерация,
// лишние пробелы и пустая строка посередине.
const PASTED_LIST = [
  "• Открыть смену",
  "• Проверить холодильник",
  "",
  "1. Помыть пол",
  "2) Протереть витрину",
  "   -  Проверить кассу  ",
  "5 кг теста достать из морозилки",
].join("\n");
const PASTED_ITEMS = 6;

function label(): string {
  return Math.random().toString(36).slice(2, 8);
}

async function signIn(page: Page): Promise<void> {
  await page.goto("/admin/login");
  await page.getByLabel("Пароль").fill(E2E_ADMIN_PASSWORD);
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("admin-home")).toBeVisible();
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
 * Заводит блок библиотеки и возвращает его опознаватель. Блок нужен редактору как
 * данные: его вставляют в чек-лист, и из чек-листа обязан быть путь обратно (T115).
 * Сам экран библиотеки проверяет `library.spec.ts` — здесь он только источник блока.
 *
 * Почему здесь стоят два ожидания, а не проверка «форма правки видна» (T121). Форма
 * видна ВСЕГДА: экран библиотеки показывает правку выбранного блока, и пока переход к
 * новому блоку едет, на экране стоит форма ПРЕЖНЕГО блока — с тем же `data-testid`.
 * Название, напечатанное в неё, исчезает молча: переход доезжает, компонент
 * перемонтируется, и в поле встаёт название пришедшего блока. Блок сохраняется
 * безымянным («Новый блок»), помощник при этом отрабатывает как ни в чём не бывало,
 * и падает потом `insertBlockByTitle` — в другом месте и по другому поводу.
 *
 * Замер зондом (11.09.2026). В момент «форма видна» `readyState=complete`, поле
 * гидратировано, а в поле стоит название ПРОШЛОГО блока; после `fill` — напечатанное;
 * через несколько секунд — снова «Новый блок», и в библиотеке лежит блок с этим именем.
 *
 * Разведённый опыт 2×2 (задержка раздачи скриптов × библиотека пуста/не пуста) назвал
 * условие точно, и оно оказалось не про нагрузку: название теряется в ТРЁХ случаях из
 * четырёх, и в том числе БЕЗ всякой задержки — достаточно, чтобы в библиотеке уже лежал
 * другой блок. Тогда экран библиотеки показывает его правку, и пока переход едет,
 * печатать есть куда мимо. Уцелел единственный случай: пустая библиотека и никакой
 * задержки. Отсюда и «в одиночку зелёный, в наборе красный»: в одном файле блок
 * библиотеки заводит только этот сценарий, и на свежей базе библиотека к его началу
 * пуста, а в полном наборе соседние сценарии наполняют её параллельно. То есть падение
 * было не случайным, а закономерным — случайным был лишь состав набора.
 *
 * Вторым зондом там же проверена вторая дыра того же класса — обычная загрузка
 * документа: `fill` до гидратации саму гидратацию переживает, но первый же перерисов
 * (его вызывает следующее нажатие «+ Пункт») возвращает в поле значение из состояния
 * React, куда напечатанное не попало. Итог тот же — блок без названия.
 *
 * Поэтому ожидания два, и ни одно не заменяет второе:
 *  • смена адреса доказывает, что переход вообще начался;
 *  • `data-block-id` + `data-live` доказывают, что на экране форма ИМЕННО нового блока
 *    и она ожила, то есть напечатанное дойдёт до состояния, а не до пустоты.
 * Ни один таймаут при этом не увеличен: увеличенный таймаут — отложенное падение.
 */
async function createLibraryBlock(
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

  await expect(
    page.locator(
      `[data-testid="block-editor"][data-block-id="${blockId}"][data-live="true"]`,
    ),
    "Правка нового блока так и не ожила: на экране либо форма прежнего блока, либо " +
      "ещё не оживший экран — напечатанное в неё название пропало бы молча, а блок " +
      "сохранился бы под именем по умолчанию.",
  ).toHaveCount(1);

  await page.getByTestId("block-title").fill(title);
  await page.getByTestId("add-block-item").click();
  await page.getByTestId("item-title").first().fill(itemTitle);
  await page.getByTestId("save-block").click();
  await expect(page.getByTestId("block-saved")).toBeVisible();

  return blockId;
}

/**
 * Вставляет блок библиотеки в открытый чек-лист — так же, как это делает методист.
 *
 * Нажатие по «Вставить блок» ждёт ожившего редактора по той же причине, что и
 * `createLibraryBlock` (T121): кнопка клиентская, запасного пути у неё нет, и до
 * гидратации она принимает нажатие, ничего не открывая. Потеря этого нажатия снаружи
 * НЕ ВИДНА: панель библиотеки стоит в правой колонке всегда, и `.first()` молча брал
 * бы её вместо так и не открывшейся. Поэтому открытие панели проверяется счётом: их
 * становится две — открытая под секциями и постоянная в колонке.
 */
async function insertBlockByTitle(page: Page, title: string): Promise<void> {
  await expect(
    page.locator('[data-testid="insert-block"][data-live="true"]'),
    "Редактор чек-листа так и не ожил: нажатие по «Вставить блок» ушло бы в пустоту.",
  ).toHaveCount(1);

  await page.getByTestId("insert-block").click();
  await expect(
    page.getByTestId("library-panel"),
    "Панель библиотеки под секциями не открылась: нажатие не сработало.",
  ).toHaveCount(2);

  await page
    .getByTestId("library-panel")
    .first()
    .getByTestId("library-block")
    .filter({ hasText: title })
    .getByTestId("library-insert")
    .click();
}

test.describe("редактор чек-листа", () => {
  // Эталон и тексты сценария русские, поэтому и браузер русский.
  test.use({ locale: "ru-RU" });

  test("пункты набираются с клавиатуры: Enter создаёт следующий и уводит в него курсор", async ({
    page,
  }) => {
    await signIn(page);
    await createChecklist(page, `Открытие кухни ${label()}`);

    const items = page.getByTestId("item-title");
    await expect(items).toHaveCount(1);

    await items.first().click();
    await page.keyboard.type("Включить печь");
    await page.keyboard.press("Enter");

    // Курсор уже в новом пункте: методист печатает дальше, не трогая мышь.
    await expect(items).toHaveCount(2);
    await page.keyboard.type("Проверить фритюр");
    await expect(items.nth(1)).toHaveValue("Проверить фритюр");

    await page.keyboard.press("Enter");
    await page.keyboard.type("Протереть столы");
    await expect(items).toHaveCount(3);
    await expect(items.nth(2)).toHaveValue("Протереть столы");
  });

  test("Alt+стрелки переставляют пункт и оставляют на нём курсор", async ({
    page,
  }) => {
    await signIn(page);
    await createChecklist(page, `Порядок пунктов ${label()}`);

    const items = page.getByTestId("item-title");
    await items.first().click();
    await page.keyboard.type("Первый");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Второй");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Третий");

    await page.keyboard.press("Alt+ArrowUp");

    await expect(items.nth(1)).toHaveValue("Третий");
    await expect(items.nth(2)).toHaveValue("Второй");
    // Курсор поехал вместе с пунктом: следующее нажатие продолжает править его же.
    await expect(page.locator(":focus")).toHaveValue("Третий");

    await page.keyboard.press("Alt+ArrowDown");
    await expect(items.nth(1)).toHaveValue("Второй");
    await expect(items.nth(2)).toHaveValue("Третий");

    // На нижней границе секции пункт остаётся на месте, а не исчезает в соседней.
    await page.keyboard.press("Alt+ArrowDown");
    await expect(items.nth(2)).toHaveValue("Третий");
    await expect(items).toHaveCount(3);
  });

  test("список из буфера превращается в пункты одним нажатием", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await signIn(page);
    await createChecklist(page, `Вставка списка ${label()}`);

    await page.evaluate(async (text) => {
      await navigator.clipboard.writeText(text);
    }, PASTED_LIST);

    const items = page.getByTestId("item-title");
    await items.first().click();
    await page.keyboard.press("ControlOrMeta+KeyV");

    // Одно нажатие — все строки списка. Пустая строка пропущена, маркеры и нумерация сняты.
    await expect(items).toHaveCount(PASTED_ITEMS);
    await expect(items.nth(0)).toHaveValue("Открыть смену");
    await expect(items.nth(2)).toHaveValue("Помыть пол");
    await expect(items.nth(3)).toHaveValue("Протереть витрину");
    await expect(items.nth(4)).toHaveValue("Проверить кассу");
    // Число без точки и скобки нумерацией не считается: строка осталась целой.
    await expect(items.nth(5)).toHaveValue("5 кг теста достать из морозилки");
  });

  test("тип ответа, границы числа и критичность переключаются по месту и сохраняются", async ({
    page,
  }) => {
    await signIn(page);
    await createChecklist(page, `Типы ответов ${label()}`);

    const items = page.getByTestId("item-title");
    await items.first().click();
    await page.keyboard.type("Температура фритюра");

    await page.getByTestId("item-type").first().selectOption("number");
    await page.getByTestId("item-min").first().fill("160");
    await page.getByTestId("item-max").first().fill("180");
    // Переключатель уровня: три положения вместо тумблера критичности (D056).
    await page.getByTestId("item-severity-critical").first().click();

    await expect(page.getByTestId("editor-item").first()).toHaveAttribute(
      "data-severity",
      "critical",
    );

    await page.getByTestId("save-draft").click();
    await expect(page.getByTestId("editor-meta")).toHaveText(
      "Черновик сохранён",
    );

    await page.reload();
    await expect(page.getByTestId("item-type").first()).toHaveValue("number");
    await expect(page.getByTestId("item-min").first()).toHaveValue("160");
    await expect(page.getByTestId("item-max").first()).toHaveValue("180");
    await expect(page.getByTestId("editor-item").first()).toHaveAttribute(
      "data-severity",
      "critical",
    );
  });

  test("черновик сохраняется, версия публикуется, предпросмотр показывает то же самое", async ({
    page,
    context,
  }) => {
    const station = await seedStation(label());
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await signIn(page);
    const editorUrl = await createChecklist(page, `Открытие кухни ${label()}`);

    // Привязка к станции: без неё QR ничего не откроет.
    await page.getByTestId("checklist-station").selectOption({
      label: `${station.countryName} · ${station.storeName} · ${station.stationName}`,
    });

    await page.evaluate(async (text) => {
      await navigator.clipboard.writeText(text);
    }, PASTED_LIST);
    await page.getByTestId("item-title").first().click();
    await page.keyboard.press("ControlOrMeta+KeyV");
    await expect(page.getByTestId("item-title")).toHaveCount(PASTED_ITEMS);

    await page.getByTestId("save-draft").click();
    await expect(page.getByTestId("editor-meta")).toHaveText(
      "Черновик сохранён",
    );

    // Правка пережила перезагрузку — значит она в базе, а не только на экране.
    await page.reload();
    await expect(page.getByTestId("item-title")).toHaveCount(PASTED_ITEMS);
    await expect(page.getByTestId("item-title").first()).toHaveValue(
      "Открыть смену",
    );

    await page.getByTestId("publish").click();
    await expect(page.getByTestId("editor-published")).toContainText("1");

    // Черновик остался черновиком, рядом появилась опубликованная версия.
    await page.reload();
    await expect(page.getByTestId("version-row")).toHaveCount(2);

    await page.getByRole("link", { name: "Предпросмотр" }).click();
    await expect(page.getByTestId("preview-screen")).toBeVisible();
    await expect(page.getByTestId("preview-item")).toHaveCount(PASTED_ITEMS);
    await expect(page.getByTestId("preview-screen")).toContainText(
      station.stationName,
    );

    await page.goto(editorUrl);
    await expect(page.getByTestId("editor-screen")).toBeVisible();
  });

  test("список чек-листов показывает заведённый и дублирует его", async ({
    page,
  }) => {
    const title = `Закрытие кухни ${label()}`;
    await signIn(page);
    await createChecklist(page, title);
    await page.getByTestId("item-title").first().click();
    await page.keyboard.type("Выключить печь");
    await page.getByTestId("save-draft").click();
    await expect(page.getByTestId("editor-meta")).toHaveText(
      "Черновик сохранён",
    );

    await page.goto(CHECKLISTS_PATH);
    const row = page
      .getByTestId("checklist-row")
      .filter({ hasText: title })
      .first();
    await expect(row).toBeVisible();

    await row.getByTestId("duplicate-checklist").click();

    // Копия открывается сразу в редакторе, с теми же пунктами и своим названием.
    await expect(page.getByTestId("editor-screen")).toBeVisible();
    await expect(page.getByTestId("checklist-title")).toHaveValue(
      `${title} (копия)`,
    );
    await expect(page.getByTestId("item-title").first()).toHaveValue(
      "Выключить печь",
    );
  });

  // T115. Пункт «Открыть блок» полгода стоял серой надписью с пояснением «раздела
  // библиотеки ещё нет»: его нарисовали до блока `library`, а когда раздел появился,
  // надпись об этом не узнала. Это третий такой случай в продукте (справочник, меню
  // кабинета, теперь редактор), и цена у него одна: методист видит серый пункт и решает,
  // что дело в его правах, а не в недоделке, — и молчит.
  test("из секции вставленного блока методист уходит в сам блок библиотеки", async ({
    page,
  }) => {
    const blockTitle = `Санитария ${label()}`;
    await signIn(page);
    const blockId = await createLibraryBlock(
      page,
      blockTitle,
      "Проверить мойку",
    );

    await createChecklist(page, `Открытие кухни ${label()}`);
    await insertBlockByTitle(page, blockTitle);

    // Пункт — настоящая ссылка, а не надпись, и ведёт на нужный блок: в библиотеке
    // на полсотни блоков «просто в раздел» значит «ищи сам».
    const openBlock = page.getByTestId("section-open-block");
    await expect(openBlock).toHaveCount(1);
    await expect(openBlock).toHaveAttribute(
      "href",
      `${LIBRARY_PATH}?block=${blockId}`,
    );

    // Метка переживает переход только у клиентского роутера. Обычному `<a href>` Next
    // не приставляет базовый путь площадки, и на общем адресе такая ссылка уводит к
    // чужому продукту (T088, D046) — здесь это проверяется поведением, а не разметкой.
    await page.evaluate(() => {
      (window as unknown as Record<string, unknown>)["openBlockProbe"] = "жив";
    });

    await openBlock.click();

    await expect(page).toHaveURL(
      new RegExp(`/admin/library\\?block=${blockId}$`),
    );
    await expect(page.getByTestId("block-editor")).toBeVisible();
    await expect(page.getByTestId("block-title")).toHaveValue(blockTitle);
    expect(
      await page.evaluate(
        () => (window as unknown as Record<string, unknown>)["openBlockProbe"],
      ),
    ).toBe("жив");
  });

  // Предпросмотр — показ, а не работающий экран заполнения: отвечает сотрудник, открыв
  // чек-лист по QR-коду станции. Поэтому здесь не должно быть ни одного элемента, который
  // выглядит нажимаемым и не нажимается: серая кнопка «осталось N» читалась как сломанная.
  test("предпросмотр не показывает ни одной нажимаемой на вид, но мёртвой кнопки", async ({
    page,
  }) => {
    await signIn(page);
    await createChecklist(page, `Предпросмотр ${label()}`);
    await page.getByTestId("item-title").first().click();
    await page.keyboard.type("Включить печь");
    await page.getByTestId("save-draft").click();
    await expect(page.getByTestId("editor-meta")).toHaveText(
      "Черновик сохранён",
    );

    await page.getByRole("link", { name: "Предпросмотр" }).click();
    const screen = page.getByTestId("preview-screen");
    await expect(screen).toBeVisible();

    // Футер экрана заполнения показан — методист обязан видеть, что увидит сотрудник.
    await expect(page.getByTestId("preview-left")).toHaveText(
      "остался 1 пункт",
    );

    // Но показан именно показом: ни кнопок, ни выключенных элементов управления.
    await expect(screen.locator("button")).toHaveCount(0);
    await expect(
      screen.locator("[disabled], [aria-disabled='true']"),
    ).toHaveCount(0);
  });
});
