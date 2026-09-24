// Экран библиотеки блоков охраняем от двух дефектов, которые только что чинились и
// умеют возвращаться.
//
// Раздел 1 — ширина (T223, дефект #100). Разметка не меняется, а ломается раскладка:
// `SPLIT_CLASS` держит колонку правки фиксированной шириной, пока рядом не подрастёт
// сосед — тот же класс дефекта, что уже пойман для редактора в
// `editor-screen-width.spec.ts` («строка тихо переросла экран»), только здесь это две
// колонки экрана, а не строка пункта.
//
// Раздел 2 — обещание нажатия (D097, T224, дефект #101). Чип регулярности в строке
// блока библиотеки — `span`, который только показывает состояние; настоящая, нажимаемая
// кнопка с тем же видом живёт в редакторе чек-листа (`ScheduleChip.tsx`) и делится
// коробкой и цветами через экспортированные классы. Дефект был в том, что показывающий
// чип брал вместе с коробкой и отклик на наведение — вид общий, и следующая добавка к
// нему снова приедет туда, где нажатия нет. Поэтому здесь же, отдельным тестом, проверен
// и настоящий чип редактора: починка, снявшая обещание у показа, могла снять его и там.
import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { E2E_ADMIN_PASSWORD } from "./admin-credentials";

/**
 * Порог ширины карточки правки блока.
 *
 * До починки (T223, дефект #100) на телефоне карточке досталось 18 px — полоска у
 * правого края вместо формы. После починки — 358 px. 300 — порог смысла, а не подгонка
 * под 358: уже него в карточку не влезает строка пункта, и экран перестаёт делать
 * работу, ради которой открыт.
 */
import { themeTokens } from "../src/blocks/core/design-reference";

/** Телефон — самая узкая ширина, на которой обязан работать экран библиотеки. */
const PHONE = { width: 390, height: 844 } as const;
/** Окно раздела про чип: места достаточно, дефект там не про сжатие. */
const WIDE = { width: 1280, height: 900 } as const;

const CARD_MIN = 300;

/** Сколько шагов Tab делаем, разыскивая чип: он не должен всплыть ни на одном. */
const TAB_STEPS = 12;

/**
 * Вид чипа в покое и при наведении, общий для чипа-показа и чипа редактора (T224).
 * Значения берутся из ядра дизайн-системы, а не переписываются сюда числами (D143):
 * канон улучшается, и цифра здесь краснела бы на исправном продукте при каждом его
 * обновлении. Проверяется по-прежнему то, ради чего сценарий написан, — что чип
 * меняет вид под курсором ровно теми токенами, а не своими цветами.
 */
const CORE_CSS = readFileSync(
  path.resolve(
    import.meta.dirname,
    "../docs/furca/design/reference/dodo-ds.css",
  ),
  "utf8",
);

const HEX_COLOR = /#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})\b/i;

/** Хекс канона (`#RRGGBB`) в запись, которую отдаёт браузер (`rgb(r, g, b)`). */
function rgbOf(hex: string): string {
  let rgb: string | undefined;
  hex.replace(HEX_COLOR, (_whole, r: string, g: string, b: string) => {
    rgb = `rgb(${String(parseInt(r, 16))}, ${String(parseInt(g, 16))}, ${String(parseInt(b, 16))})`;
    return "";
  });
  if (rgb === undefined) {
    throw new Error(`«${hex}» не похож на шестизначный хекс канона`);
  }
  return rgb;
}

/** Значение светлого токена канона в записи браузера. Нет токена — сверять нечем. */
function tokenRgb(name: string): string {
  const value = themeTokens(CORE_CSS, "light").get(name);
  if (value === undefined) {
    throw new Error(`ядро дизайн-системы не называет ${name}`);
  }
  return rgbOf(value);
}

const CHIP_BORDER_REST = tokenRgb("--line-control");
const CHIP_BORDER_HOVER = tokenRgb("--line-control-2");
const CHIP_TEXT_REST = tokenRgb("--ink-3");
const CHIP_TEXT_HOVER = tokenRgb("--ink-2");

function label(): string {
  return Math.random().toString(36).slice(2, 8);
}

async function signIn(page: Page): Promise<void> {
  await page.goto("/admin/login");
  // Не по подписи: язык интерфейса у прогона меняется, `name="password"` — нет.
  await page.locator('input[name="password"]').fill(E2E_ADMIN_PASSWORD);
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("admin-home")).toBeVisible();
}

/**
 * Заводит блок через «+ Новый блок» и вписывает название и один пункт.
 *
 * Обрезок `library.spec.ts::createBlock` без защиты от гонки с медленным ответом
 * (T130) — та гонка проверяется там же и не имеет отношения к ширине и к чипу; здесь
 * важен только блок с известным `blockId`, до которого можно вернуться по адресу.
 */
async function createBlock(
  page: Page,
  title: string,
  itemTitle: string,
): Promise<string> {
  await page.goto("/admin/library");
  const before = page.url();
  await page.getByTestId("new-block").click();
  await page.waitForFunction((url) => globalThis.location.href !== url, before);

  const blockId = new URL(page.url()).searchParams.get("block") ?? "";
  expect(blockId, "У нового блока не появился ?block= в адресе").not.toBe("");

  const editor = page.locator(
    `[data-testid="block-editor"][data-block-id="${blockId}"][data-live="true"]`,
  );
  await expect(editor).toHaveCount(1);

  await editor.getByTestId("block-title").fill(title);
  await editor.getByTestId("add-block-item").click();
  await editor.getByTestId("item-title").first().fill(itemTitle);
  await editor.getByTestId("save-block").click();
  await expect(editor.getByTestId("block-saved")).toBeVisible();

  return `/admin/library?block=${blockId}`;
}

/** Заводит чек-лист через экран заведения. */
async function createChecklist(page: Page, title: string): Promise<void> {
  await page.goto("/admin/checklists/new");
  await page.getByTestId("new-checklist-title").fill(title);
  await page.getByTestId("create-checklist").click();
  await expect(page.getByTestId("editor-screen")).toBeVisible();
}

/** Вставляет блок по названию — так же, как это делает методист (`library.spec.ts`). */
async function insertBlockByTitle(
  page: Page,
  blockTitle: string,
): Promise<void> {
  await expect(
    page.locator('[data-testid="insert-block"][data-live="true"]'),
  ).toHaveCount(1);
  await page.getByTestId("insert-block").click();
  await expect(page.getByTestId("library-panel")).toHaveCount(2);
  await page
    .getByTestId("library-panel")
    .first()
    .getByTestId("library-block")
    .filter({ hasText: blockTitle })
    .getByTestId("library-insert")
    .click();
}

/** Ширина документа и окна: расхождение — это и есть горизонтальная прокрутка. */
async function pageWidth(
  page: Page,
): Promise<{ scrollWidth: number; clientWidth: number }> {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
}

/** Кто именно растянул документ. Приём из `editor-screen-width.spec.ts`. */
async function widestElement(page: Page): Promise<string> {
  return page.evaluate(() => {
    const room = document.documentElement.clientWidth;
    let worst = "";
    let worstRight = room;
    for (const element of document.body.querySelectorAll("*")) {
      const box = element.getBoundingClientRect();
      if (box.right <= worstRight) continue;
      worstRight = box.right;
      const testId = element.getAttribute("data-testid");
      worst =
        `<${element.tagName.toLowerCase()}` +
        (testId === null ? "" : ` data-testid="${testId}"`) +
        `> правый край ${String(Math.round(box.right))}`;
    }
    return worst === "" ? "никто: документ шире по своей разметке" : worst;
  });
}

/**
 * Что вылезло за правый край окна ВНУТРИ карточек самой библиотеки.
 *
 * Почему одного `document.scrollWidth === clientWidth` мало, хотя редактор меряет именно
 * им. Ниже складки прокрутка по решению `design/app.css` достаётся содержимому, а не
 * документу: документ остаётся ровно по окну, пока содержимое уезжает вбок. Замерено на
 * этом самом экране — метка «где используется» с английской подписью занимала 405 px в
 * карточке шириной 358 и вылезала за её рамку, а проверка документа при этом оставалась
 * зелёной. То есть проверка, не умеющая покраснеть на живом дефекте, здесь уже была.
 *
 * Верхняя полоса меню в счёт НЕ идёт, и это не поблажка: ниже складки она горизонтально
 * прокручиваемая по замыслу (`core/ui/AdminNav`, `max-md:overflow-x-auto`), её пункты
 * выходят за окно по делу и лечить их тут нечем — это чужой блок. Считаем только то, что
 * рисует библиотека.
 */
async function spillingFromCards(page: Page): Promise<readonly string[]> {
  return page.evaluate(() => {
    const room = document.documentElement.clientWidth;
    const roots = document.querySelectorAll(
      '[data-testid="library-list"], [data-block-id], [data-testid="block-usages"]',
    );
    const found: string[] = [];
    for (const root of roots) {
      for (const element of [root, ...root.querySelectorAll("*")]) {
        const box = element.getBoundingClientRect();
        // Полпикселя — запас на дробные ширины, которые даёт вёрстка в долях.
        if (box.right <= room + 0.5) continue;
        const testId = element.getAttribute("data-testid");
        found.push(
          `<${element.tagName.toLowerCase()}` +
            (testId === null ? "" : ` data-testid="${testId}"`) +
            `> ширина ${String(Math.round(box.width))}, правый край ` +
            `${String(Math.round(box.right))} при окне ${String(room)}` +
            // `textContent` у элемента строка всегда — проверять на null линт запрещает.
            ` — «${element.textContent.trim().slice(0, 40)}»`,
        );
      }
    }
    return found;
  });
}

/** testid активного элемента — для прохода Tab-ом по форме. */
async function activeTestId(page: Page): Promise<string | null> {
  return page.evaluate(
    () => document.activeElement?.getAttribute("data-testid") ?? null,
  );
}

test.describe("ширина экрана библиотеки", () => {
  test("карточка правки и список блоков не схлопываются на телефоне", async ({
    page,
  }) => {
    const blockTitle = `Блок ширины ${label()}`;
    // Название ДЛИННОЕ сознательно, и укорачивать его нельзя — проверка на этом стоит.
    // Подпись метки «где используется» собирается из названия чек-листа и пиццерии
    // (`usageLabel`), и переполняла карточку телефона именно длинная: у демонстрационных
    // данных «Morning opening — Kitchen · Demoland, Central Square» это 51 знак и 405 px
    // в карточке шириной 358. С коротким названием (было «Чек-лист для ширины abc123»,
    // 26 знаков) проверка проходила зелёной на заведомо сломанной вёрстке — проверено
    // фактом, поломкой продукта. Здесь 52 знака плюс метка прогона.
    const checklistTitle = `Открытие кухни: холодильники, поверхности и заготовки ${label()}`;

    await signIn(page);
    const blockUrl = await createBlock(
      page,
      blockTitle,
      "Проверить холодильник",
    );

    // Ссылка «Где используется» — сама виновница переполнения до починки (замер:
    // правый край 778 при окне 390), поэтому блок обязан быть вставлен хоть куда-то,
    // а не остаться неиспользуемым.
    await createChecklist(page, checklistTitle);
    await insertBlockByTitle(page, blockTitle);
    const saved = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" && response.status() < 400,
    );
    await page.getByTestId("save-draft").click();
    await saved;

    await page.setViewportSize(PHONE);
    await page.goto(blockUrl);
    await expect(page.getByTestId("library-list")).toBeVisible();

    const card = page.locator("[data-block-id]");
    const cardBox = await card.boundingBox();
    expect(
      cardBox,
      "Карточка правки блока не нашлась на экране",
    ).not.toBeNull();
    const cardWidth = Math.round(cardBox?.width ?? 0);
    expect(
      cardWidth,
      `Карточка правки блока схлопнута до ${String(cardWidth)} px на телефоне (390): ` +
        `методист не может править название и пункты — строка пункта в такую ширину ` +
        `не влезает. До починки было 18 px, после — 358 px; порог 300 — нижняя граница ` +
        `смысла, а не подгонка под замер.`,
    ).toBeGreaterThanOrEqual(CARD_MIN);

    const width = await pageWidth(page);
    expect(
      width.scrollWidth,
      `Экран библиотеки шире окна телефона (${String(width.scrollWidth)} при ` +
        `${String(width.clientWidth)}): страница уезжает вбок вместе со списком блоков ` +
        `и карточкой правки. Растянул: ${await widestElement(page)}`,
    ).toBe(width.clientWidth);

    // Вторая половина той же проверки, и без неё первая зелёная впустую: документ по окну,
    // а содержимое карточек уезжает вбок само по себе (см. пояснение к `spillingFromCards`).
    const spilling = await spillingFromCards(page);
    expect(
      spilling,
      `Содержимое карточек библиотеки вылезает за правый край экрана телефона: методист ` +
        `видит обрезанные подписи и не может их дочитать, при том что страница вбок не ` +
        `прокручивается. Вылезло:\n  ${spilling.join("\n  ")}`,
    ).toEqual([]);

    const list = page.getByTestId("library-list");
    const listBox = await list.boundingBox();
    expect(listBox, "Список блоков не нашёлся на экране").not.toBeNull();
    const listWidth = Math.round(listBox?.width ?? 0);
    expect(
      listWidth,
      `Список блоков сжат до ${String(listWidth)} px на телефоне: названия блоков ` +
        `нечитаемы, список перестаёт быть списком.`,
    ).toBeGreaterThanOrEqual(CARD_MIN);
  });
});

test.describe("чип регулярности ничего не обещает нажатием", () => {
  test("чип-показ в библиотеке не ведёт себя как кнопка", async ({ page }) => {
    await signIn(page);
    const blockUrl = await createBlock(
      page,
      `Блок для чипа ${label()}`,
      "Проверить пол",
    );

    await page.setViewportSize(WIDE);
    await page.goto(blockUrl);

    // На экране библиотеки чип-показ один на пункт (в отличие от редактора чек-листа,
    // где рядом может стоять панель библиотеки с тем же testid чужого чипа).
    const chip = page.locator('[data-testid="item-schedule-chip"]').first();
    await expect(chip).toBeVisible();

    // 1. Не кнопка и не фокусируемый элемент.
    await expect(chip).toHaveJSProperty("tagName", "SPAN");
    await expect(chip).toHaveAttribute("data-relative", "true");

    const tabIndex = await chip.evaluate((el) => (el as HTMLElement).tabIndex);
    expect(
      tabIndex,
      `У чипа-показа tabIndex = ${String(tabIndex)}, а обязан быть -1: элемент без ` +
        `tabindex не должен становиться целью клавиатурного обхода.`,
    ).toBe(-1);

    await chip.evaluate((el) => {
      (el as HTMLElement).focus();
    });
    const focusedAfterCall = await activeTestId(page);
    expect(
      focusedAfterCall,
      `Программный .focus() поставил фокус на чип-показ (activeElement: ` +
        `${String(focusedAfterCall)}): элемент без нажатия не должен принимать фокус ` +
        `вовсе.`,
    ).not.toBe("item-schedule-chip");

    // 2. Курсор не обещает нажатия.
    const cursor = await chip.evaluate((el) => getComputedStyle(el).cursor);
    expect(
      cursor,
      `Курсор чипа-показа — "${cursor}": если это "pointer", вид обещает нажатие, ` +
        `которого у показа нет (D097).`,
    ).not.toBe("pointer");

    // 3. Наведение ничего не меняет.
    const restBorder = await chip.evaluate(
      (el) => getComputedStyle(el).borderTopColor,
    );
    const restColor = await chip.evaluate((el) => getComputedStyle(el).color);
    await chip.hover();
    await page.waitForTimeout(100);
    const hoverBorder = await chip.evaluate(
      (el) => getComputedStyle(el).borderTopColor,
    );
    const hoverColor = await chip.evaluate((el) => getComputedStyle(el).color);

    expect(
      hoverBorder,
      `Рамка чипа-показа поменялась при наведении (${restBorder} → ${hoverBorder}): ` +
        `чип взял общий вид чипа редактора целиком и вместе с ним — отклик на мышь, ` +
        `которого у показа быть не должно (T224, дефект #101).`,
    ).toBe(restBorder);
    expect(
      hoverColor,
      `Текст чипа-показа поменял цвет при наведении (${restColor} → ${hoverColor}): ` +
        `тот же класс дефекта, что и с рамкой выше.`,
    ).toBe(restColor);

    // 4. Нажатие ничего не открывает.
    await chip.click();
    await expect(page.getByTestId("schedule-dialog")).toHaveCount(0);

    // 5. Фокус клавиатурой на чип-показ не попадает.
    await page.getByTestId("item-title").first().click();
    const focusedByTab: (string | null)[] = [];
    for (let step = 0; step < TAB_STEPS; step += 1) {
      await page.keyboard.press("Tab");
      focusedByTab.push(await activeTestId(page));
    }
    expect(
      focusedByTab,
      `Tab от поля названия за ${String(TAB_STEPS)} шагов привёл фокус на чип-показ ` +
        `(порядок обхода: ${JSON.stringify(focusedByTab)}): у чипа нет нажатия, а ` +
        `клавиатурный фокус его бы пообещал.`,
    ).not.toContain("item-schedule-chip");
  });

  // Отдельный тест: вид у двух чипов общий (`ScheduleChip.tsx`), и починка, которая
  // сняла бы обещание нажатия у показа, прошла бы пять проверок выше зелёной и
  // сломала бы этот, настоящий, чип молча.
  test("чип редактора чек-листа остаётся кнопкой", async ({ page }) => {
    await signIn(page);
    await createChecklist(page, `Чек-лист для чипа ${label()}`);

    await page.getByTestId("item-title").first().click();
    await page.keyboard.type("Проверить холодильник");

    const chip = page
      .locator('[data-testid="item-schedule-chip"][data-live="true"]')
      .first();
    await expect(chip).toBeVisible();

    await expect(chip).toHaveJSProperty("tagName", "BUTTON");

    const cursor = await chip.evaluate((el) => getComputedStyle(el).cursor);
    expect(
      cursor,
      `Курсор чипа редактора — "${cursor}", а не "pointer": чип нажимаемый и обязан ` +
        `обещать это мышью.`,
    ).toBe("pointer");

    const restBorder = await chip.evaluate(
      (el) => getComputedStyle(el).borderTopColor,
    );
    const restColor = await chip.evaluate((el) => getComputedStyle(el).color);
    await chip.hover();
    await page.waitForTimeout(100);
    const hoverBorder = await chip.evaluate(
      (el) => getComputedStyle(el).borderTopColor,
    );
    const hoverColor = await chip.evaluate((el) => getComputedStyle(el).color);

    expect(
      restBorder,
      `Рамка чипа редактора в покое — "${restBorder}", ожидался ${CHIP_BORDER_REST}.`,
    ).toBe(CHIP_BORDER_REST);
    expect(
      hoverBorder,
      `Рамка чипа редактора не поменялась при наведении (${restBorder} → ` +
        `${hoverBorder}, ожидался переход в ${CHIP_BORDER_HOVER}): вид общий с чипом-` +
        `показом библиотеки (ScheduleChip.tsx), и починка, снявшая отклик у показа, ` +
        `могла молча снять его и здесь.`,
    ).toBe(CHIP_BORDER_HOVER);

    expect(
      restColor,
      `Текст чипа редактора в покое — "${restColor}", ожидался ${CHIP_TEXT_REST}.`,
    ).toBe(CHIP_TEXT_REST);
    expect(
      hoverColor,
      `Текст чипа редактора не поменял цвет при наведении (${restColor} → ` +
        `${hoverColor}, ожидался переход в ${CHIP_TEXT_HOVER}): тот же класс дефекта, ` +
        `что и с рамкой выше.`,
    ).toBe(CHIP_TEXT_HOVER);

    await chip.click();
    await expect(page.getByTestId("schedule-dialog")).toBeVisible();
  });
});
