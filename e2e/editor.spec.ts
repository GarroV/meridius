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

// Вечернее окно смены: подпись из словаря (`editor.form.windowEvening`) и то значение,
// которым окно стоит в списке экрана правки. Сценарии ниже выбирают окно ПОДПИСЬЮ —
// так же, как методист, — а проверяют то, что сохранилось.
const EVENING_LABEL = "Вечер, 20:00–00:00";
const EVENING_WINDOW = "20:00|00:00";
const MORNING_WINDOW = "06:00|11:00";

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
 * «Сохранить черновик» и ожидание того, что сохранение СОСТОЯЛОСЬ (T195).
 *
 * Почему не просто `toHaveText("Черновик сохранён")`, как стояло в семи местах этого файла.
 * Надпись появляется, только когда серверное действие ВЕРНУЛОСЬ, то есть её пятисекундный
 * предел покрывал всю дорогу до сервера и обратно: разбор формы, две записи в базу,
 * `revalidatePath` и перерисовку экрана. На свободной машине это доли секунды, а под
 * стройкой (три стенда блоков плюс приёмочный, пять воркеров) то же самое занимает
 * секунды — и сценарий краснел на ровном месте, показывая «ещё не публиковался».
 *
 * Измерено порчей (17.09.2026): семь секунд задержки внутри `submitSaveDraft` дают ровно
 * то падение, которым T195 и описана, — `Received: "ещё не публиковался"`. С ожиданием
 * ниже тот же прогон с той же задержкой зелёный, и ни один предел не увеличен: ждём не
 * дольше, а ДРУГОЕ — сначала ответ сервера (событие, а не перепрашиваемую надпись), и
 * только потом состояние экрана. Тот же приём уже стоит в `library.spec.ts` и по той же
 * причине: надпись — следствие ответа, и ждать её вместо него значит ставить сценарий
 * в зависимость от того, насколько занята машина.
 */
async function saveDraft(page: Page): Promise<void> {
  const answered = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" && response.status() < 400,
  );
  await page.getByTestId("save-draft").click();
  await answered;
  await expect(page.getByTestId("editor-meta")).toHaveText("Черновик сохранён");
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

/**
 * Открывает окно настройки регулярности чипом в строке пункта.
 *
 * Ждёт `data-live`, а не видимость: чип клиентский и до гидратации стоит в
 * разметке, принимает нажатие и не открывает ничего — тот же род потерянного
 * нажатия, что у кнопки «Вставить блок» (T121).
 */
async function openSchedule(page: Page, itemIndex: number): Promise<void> {
  await page
    .locator('[data-testid="item-schedule-chip"][data-live="true"]')
    .nth(itemIndex)
    .click();
  await expect(page.getByTestId("schedule-dialog")).toBeVisible();
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

  test("длинное название секции видно целиком, а не обрезается на середине слова", async ({
    page,
  }) => {
    await signIn(page);
    await createChecklist(page, `Длинный заголовок ${label()}`);

    // Такой заголовок даёт импорт боевого пакета: период суток, часы и подсекция.
    const long = "Открытие 05:00–08:00 · Приём смены у менеджера";
    const title = page.getByTestId("section-title").first();
    await title.fill(long);

    // Поле не прокручивается — значит текст помещается целиком. Проверка именно
    // такая, потому что `toHaveValue` проходит и на обрезанном на экране поле:
    // значение в разметке полное, а видно «Открытие 05:00–08:00 · П».
    const fits = await title.evaluate(
      (node: HTMLInputElement) => node.scrollWidth <= node.clientWidth + 1,
    );
    expect(fits, `заголовок «${long}» не помещается в поле`).toBe(true);
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

    await saveDraft(page);

    await page.reload();
    await expect(page.getByTestId("item-type").first()).toHaveValue("number");
    await expect(page.getByTestId("item-min").first()).toHaveValue("160");
    await expect(page.getByTestId("item-max").first()).toHaveValue("180");
    await expect(page.getByTestId("editor-item").first()).toHaveAttribute(
      "data-severity",
      "critical",
    );
  });

  test("табличный пункт: колонки заводятся по месту и переживают сохранение", async ({
    page,
  }) => {
    // Третий род пункта — журнал замеса теста (T141, D074): колонки задаёт методист,
    // строки заводит сотрудник. Проверяется вместе с сохранением, потому что колонка,
    // не пережившая перезагрузку, выглядит на экране точно так же, как пережившая.
    await signIn(page);
    await createChecklist(page, `Замес теста ${label()}`);

    await page.getByTestId("item-title").first().click();
    await page.keyboard.type("Журнал замесов");
    await page.getByTestId("item-type").first().selectOption("table");

    // Первая колонка заводится вместе с типом: курсору сразу есть куда встать.
    await expect(page.getByTestId("item-column")).toHaveCount(1);
    await page.getByTestId("column-title").first().fill("Температура теста");
    await page.getByTestId("column-norm").first().fill("24…26 °C");

    await page.getByTestId("column-add").first().click();
    await page.getByTestId("column-title").nth(1).fill("Вес, г");

    // Регулярность табличному пункту не предлагается: журнал заводят строками за
    // смену, а у обхода свой учёт (D076).
    await expect(page.getByTestId("item-schedule-chip")).toHaveCount(0);

    await saveDraft(page);

    await page.reload();
    await expect(page.getByTestId("item-type").first()).toHaveValue("table");
    await expect(page.getByTestId("column-title").first()).toHaveValue(
      "Температура теста",
    );
    await expect(page.getByTestId("column-norm").first()).toHaveValue(
      "24…26 °C",
    );
    await expect(page.getByTestId("column-title").nth(1)).toHaveValue("Вес, г");

    // Предпросмотр показывает колонки с нормами, а не пустую сетку.
    await page.getByRole("link", { name: "Предпросмотр" }).click();
    await expect(page.getByTestId("preview-screen")).toBeVisible();
    await expect(page.getByTestId("preview-table")).toHaveText(
      "Журнал: Температура теста (24…26 °C) · Вес, г",
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

    await saveDraft(page);

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
    await saveDraft(page);

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

  // T129. Окно смены — единственное свойство формы заведения, которое методист задаёт
  // выбором, а не вводом, и именно оно уезжало на сервер не тем, что видно на экране:
  // список был без `name`, а на сервер шли скрытые поля, посчитанные из состояния React.
  // Выбор, сделанный до того как экран ожил, в состояние не попадал — и чек-лист
  // заводился на утро при выбранном вечере. Замер зондом 11.09.2026: на экране «вечер»,
  // в скрытом поле 06:00, в базе окно 06:00–11:00. Узнать об этом можно только на кухне:
  // чек-лист откроется по QR не в ту смену.
  //
  // Оба сценария проверяют одно — что уезжает на сервер, — но разными путями отправки:
  // без скриптов форму отправляет браузер, со скриптами — React. Один путь за другой
  // не отвечает: скрытые поля ломали именно второй, а первый молчал о том же.
  test("окно смены уезжает на сервер выбранным — даже когда скриптов нет вовсе", async ({
    page,
  }) => {
    await signIn(page);
    // Скриптов нет совсем: остаётся ровно то, что форма отправляет сама. Ни состояния,
    // ни гидратации — если сохранится утро, значит на сервер уехала не разметка экрана.
    await page.route("**/*.js", async (route) => {
      await route.abort();
    });

    await page.goto(`${CHECKLISTS_PATH}/new`);
    const form = page.getByTestId("new-checklist-form");
    await form
      .locator("#new-checklist-window")
      .selectOption({ label: EVENING_LABEL });
    await form.locator("#new-checklist-title").fill(`Вечерний ${label()}`);
    await page.getByTestId("create-checklist").click();

    // Редактор открыт сервером и показывает то, что легло в базу.
    await expect(page.getByTestId("editor-screen")).toBeVisible();
    await expect(page.getByTestId("checklist-window")).toHaveValue(
      EVENING_WINDOW,
    );
  });

  test("окно, выбранное до того как форма ожила, отправкой не подменяется", async ({
    page,
  }) => {
    await signIn(page);
    // Скрипты едут медленно — так у методиста на слабой сети выглядит первая секунда:
    // экран уже нарисован и принимает выбор, а обработчиков на нём ещё нет.
    await page.route("**/*.js", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.continue();
    });

    await page.goto(`${CHECKLISTS_PATH}/new`, { waitUntil: "commit" });
    const form = page.getByTestId("new-checklist-form");
    await form
      .locator("#new-checklist-window")
      .selectOption({ label: EVENING_LABEL });
    await form.locator("#new-checklist-title").fill(`Вечерний ${label()}`);

    // Ждём, пока форма ОЖИВЁТ, и только потом отправляем: иначе сценарий проверил бы
    // тот же путь, что и предыдущий. «Разметка на месте» здесь не значит ничего —
    // урок T121: форма видна с первой секунды и до гидратации не делает ничего.
    await expect(page.getByTestId("create-checklist")).toHaveAttribute(
      "data-live",
      "true",
      { timeout: 15_000 },
    );
    await page.getByTestId("create-checklist").click();

    await expect(page.getByTestId("editor-screen")).toBeVisible();
    await expect(page.getByTestId("checklist-window")).toHaveValue(
      EVENING_WINDOW,
    );
  });

  // Обратная сторона той же проверки: невыбранное окно остаётся утренним. Без неё
  // «всегда вечер» прошло бы обе проверки выше.
  test("окно, которое не трогали, остаётся утренним", async ({ page }) => {
    await signIn(page);
    await createChecklist(page, `Утренний ${label()}`);

    await expect(page.getByTestId("checklist-window")).toHaveValue(
      MORNING_WINDOW,
    );
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
    await saveDraft(page);

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
  // Главное обещание T137, и проверять его можно только в браузере: между окном
  // настройки и базой лежат состояние React, скрытое поле формы и разбор на сервере,
  // и модульные проверки видят только крайние звенья этой цепочки.
  test("регулярность настраивается чипом и переживает сохранение черновика", async ({
    page,
  }) => {
    await signIn(page);
    await createChecklist(page, `Обход ${label()}`);
    await page.getByTestId("item-title").first().click();
    await page.keyboard.type("Проверить сроки годности");

    const chip = page.getByTestId("item-schedule-chip").first();
    await expect(chip).toHaveText("Разово");

    await openSchedule(page, 0);
    // Отрезков ещё нет: пункт обычный, пока методист не сказал обратного.
    await expect(page.getByTestId("schedule-segment")).toHaveCount(0);

    await page.getByTestId("schedule-add").click();
    // Первый отрезок — окно чек-листа целиком: за его пределами обхода не будет.
    await expect(page.getByTestId("schedule-from-0")).toHaveValue("06:00");
    await expect(page.getByTestId("schedule-to-0")).toHaveValue("11:00");

    await page.getByTestId("schedule-step-0").selectOption("120");
    await page.getByTestId("schedule-remind").selectOption("20");
    await page.getByTestId("schedule-apply").click();

    await expect(page.getByTestId("schedule-dialog")).toHaveCount(0);
    await expect(chip).toHaveText("06:00–11:00, каждые 2 часа");

    await saveDraft(page);

    // Главный шаг: страница перечитана с сервера, то есть расписание съездило
    // в базу и вернулось. До этой проверки всё выше доказывало только состояние экрана.
    await page.reload();
    await expect(page.getByTestId("item-schedule-chip").first()).toHaveText(
      "06:00–11:00, каждые 2 часа",
    );

    await openSchedule(page, 0);
    await expect(page.getByTestId("schedule-remind")).toHaveValue("20");
  });

  test("«Применить ко всей секции» ставит настройку всем пунктам сразу", async ({
    page,
  }) => {
    await signIn(page);
    await createChecklist(page, `Секция ${label()}`);

    await page.getByTestId("item-title").first().click();
    await page.keyboard.type("Линия начинения");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Линия теста");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Стол выдачи");

    const chips = page.getByTestId("item-schedule-chip");
    await expect(chips).toHaveCount(3);

    await openSchedule(page, 0);
    await page.getByTestId("schedule-add").click();
    await page.getByTestId("schedule-apply-section").click();
    await expect(page.getByTestId("schedule-dialog")).toHaveCount(0);

    // Секция носителем расписания НЕ стала (D075): настройка легла на каждый её
    // пункт по отдельности — это видно по трём одинаковым чипам, а не по одной подписи секции.
    for (let index = 0; index < 3; index += 1) {
      await expect(chips.nth(index)).toHaveText("06:00–11:00, каждый час");
    }
  });

  // Закрывает дыру, найденную отрицательным прогоном (П4 в журнале блока): перечитывание
  // черновика при открытии можно было выключить целиком, и весь набор оставался зелёным.
  // Снаружи это выглядит как «Отмена, которая не отменяет»: пункт остался разовым, а окно
  // при следующем открытии показывает брошенный набор отрезков.
  test("«Отмена» действительно отменяет: окно открывается состоянием пункта", async ({
    page,
  }) => {
    await signIn(page);
    await createChecklist(page, `Отмена ${label()}`);
    await page.getByTestId("item-title").first().click();
    await page.keyboard.type("Протереть витрину");

    await openSchedule(page, 0);
    await page.getByTestId("schedule-add").click();
    await expect(page.getByTestId("schedule-segment")).toHaveCount(1);
    await page.getByTestId("schedule-cancel").click();

    await expect(page.getByTestId("item-schedule-chip").first()).toHaveText(
      "Разово",
    );

    await openSchedule(page, 0);
    await expect(page.getByTestId("schedule-segment")).toHaveCount(0);
    await expect(page.getByTestId("schedule-none")).toBeVisible();
  });

  test("пустой отрезок не даёт применить настройку", async ({ page }) => {
    await signIn(page);
    await createChecklist(page, `Пустой отрезок ${label()}`);
    await page.getByTestId("item-title").first().click();
    await page.keyboard.type("Фритюр");

    await openSchedule(page, 0);
    await page.getByTestId("schedule-add").click();
    await page.getByTestId("schedule-to-0").fill("06:00");

    // Отказ разбора пришёл бы через два экрана, на «Сохранить черновик», и там уже
    // не видно, КАКОЙ отрезок сведён в точку.
    await expect(page.getByTestId("schedule-broken")).toBeVisible();
    await expect(page.getByTestId("schedule-apply")).toBeDisabled();
    await expect(page.getByTestId("schedule-apply-section")).toBeDisabled();

    await page.getByTestId("schedule-to-0").fill("09:00");
    await expect(page.getByTestId("schedule-broken")).toHaveCount(0);
    await expect(page.getByTestId("schedule-apply")).toBeEnabled();
  });

  test("пересекающиеся отрезки не дают применить настройку", async ({
    page,
  }) => {
    await signIn(page);
    await createChecklist(page, `Пересечение ${label()}`);
    await page.getByTestId("item-title").first().click();
    await page.keyboard.type("Линия начинения");

    await openSchedule(page, 0);
    await page.getByTestId("schedule-add").click();
    await page.getByTestId("schedule-add").click();
    await expect(page.getByTestId("schedule-segment")).toHaveCount(2);

    // Два отрезка расписали сутки целиком: третьему места нет, и кнопка это говорит
    // вслух, а не предлагает отрезок поверх уже набранных.
    await expect(page.getByTestId("schedule-add")).toBeDisabled();
    await expect(page.getByTestId("schedule-add-hint")).toHaveText(
      "Сутки расписаны целиком: свободного времени под ещё один отрезок не осталось.",
    );

    // Второй отрезок заезжает на первый. Раньше такое расписание сохранялось молча:
    // отметка вставала в проход первого отрезка, проход второго закрывался без своей
    // отметки — и сотрудник, который обход СДЕЛАЛ, видел в отчёте пропуск.
    await page.getByTestId("schedule-from-1").fill("10:00");
    const notice = page.getByTestId("schedule-broken");
    await expect(notice).toBeVisible();
    await expect(notice).toHaveAttribute("data-problem", "overlap");
    await expect(notice).toContainText("Отрезки 1 и 2 пересекаются");
    await expect(page.getByTestId("schedule-apply")).toBeDisabled();
    await expect(page.getByTestId("schedule-apply-section")).toBeDisabled();

    await page.getByTestId("schedule-from-1").fill("11:00");
    await expect(page.getByTestId("schedule-broken")).toHaveCount(0);
    await expect(page.getByTestId("schedule-apply")).toBeEnabled();
  });

  test("предпросмотр показывает периодический пункт состоянием, а не строкой формы", async ({
    page,
  }) => {
    await signIn(page);
    await createChecklist(page, `Предпросмотр обхода ${label()}`);
    await page.getByTestId("item-title").first().click();
    await page.keyboard.type("Включить печь");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Проверить сроки годности");

    await openSchedule(page, 1);
    await page.getByTestId("schedule-add").click();
    await page.getByTestId("schedule-remind").selectOption("20");
    await page.getByTestId("schedule-apply").click();

    await saveDraft(page);

    await page.getByRole("link", { name: "Предпросмотр" }).click();
    await expect(page.getByTestId("preview-screen")).toBeVisible();

    // В форме остался один пункт — обычный. Периодический в форму не идёт
    // вовсе: его отмечают обходом (D076), и экран станции делит пункты так же.
    await expect(page.getByTestId("preview-item")).toHaveCount(1);
    await expect(page.getByTestId("preview-left")).toHaveText(
      "остался 1 пункт",
    );

    const round = page.getByTestId("preview-round");
    await expect(round).toHaveCount(1);
    await expect(round).toContainText("Проверить сроки годности");
    await expect(round).toContainText("06:00–11:00, каждый час");
    await expect(round).toContainText("каждые 20 минут");

    // Предпросмотр остаётся показом и с панелью обхода (T115).
    await expect(
      page.getByTestId("preview-screen").locator("button"),
    ).toHaveCount(0);
  });
});
