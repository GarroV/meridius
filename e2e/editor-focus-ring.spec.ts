// Кольцо фокуса на ПОЛЯХ редактора видно человеку (T284).
//
// Дефект был ровно противоположен тому, что ловил `focus-ring.spec.ts` на кнопках. Там
// кольцо было, но цвета самой кнопки; здесь кольца не было вовсе: `focus:outline-none`
// снимал родное выделение браузера, а мягкое кольцо эталона (`.input:focus` в
// `components.css`) полю не давалось. Признаком фокуса оставалась рамка, сменившая цвет
// на `--accent`, — 1 px, который глазом не ловится, и методист, идущий табуляцией по
// строке пункта, не знал, в каком поле стоит.
//
// Отсюда форма сторожа, и она нарочно НЕ список полей.
//
// Перечисленные поимённо поля — сторож вчерашнего дефекта: он подтвердит, что починенные
// пять-семь мест целы, и промолчит о восьмом, которое заведут завтра. А заводят их в этом
// блоке постоянно: строка пункта за время стройки обросла типом, границами, единицей,
// чипом. Поэтому проверка ОБХОДИТ экран табуляцией — тем же путём, каким по нему идёт
// человек, — и требует кольцо от КАЖДОГО поля, до которого дошла. Новое поле попадает под
// правило само, в тот же день, когда появляется.
//
// Эталонное значение читается из `components.css` и пересчитывается самим браузером в том
// документе, где идёт замер: так оно приходит уже в цвете текущей темы, а в проверке не
// заводится второй экземпляр чисел эталона (тот же приём, что у `design-reference.test.ts`
// и у сторожа кнопок). Числа, переписанные руками, со временем начинают подтверждать
// сами себя.
import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { THEME_COOKIE_NAME } from "../src/blocks/core/theme";
import { E2E_ADMIN_PASSWORD } from "./admin-credentials";

const COMPONENTS = path.resolve(
  import.meta.dirname,
  "../docs/furca/design/reference/components.css",
);

const THEMES = ["light", "dark"] as const;

/**
 * Объявление `box-shadow` из `.input:focus` эталона — словами эталона, а не числами.
 * Пропажа правила или его тени — провал проверки, а не её пропуск: сверять было бы не с
 * чем, и молчаливо зелёный сторож здесь хуже красного.
 */
function referenceFieldShadow(): string {
  const css = readFileSync(COMPONENTS, "utf8");
  const rule = /\.input:focus\s*\{([^}]*)\}/.exec(css)?.[1];
  if (rule === undefined) {
    throw new Error(`в эталоне нет правила .input:focus (${COMPONENTS})`);
  }
  const shadow = /box-shadow:\s*([^;]+);/.exec(rule)?.[1];
  if (shadow === undefined) {
    throw new Error(`у .input:focus в эталоне нет box-shadow (${COMPONENTS})`);
  }
  return shadow.trim();
}

const REFERENCE_SHADOW = referenceFieldShadow();

/**
 * Во что объявление эталона превращается В ЭТОМ документе, то есть в этой теме.
 * Считает сам браузер на подопытном узле.
 */
async function resolveShadow(page: Page, declaration: string): Promise<string> {
  return page.evaluate((value) => {
    const probe = document.createElement("div");
    probe.style.boxShadow = value;
    document.body.append(probe);
    const computed = getComputedStyle(probe).boxShadow;
    probe.remove();
    return computed;
  }, declaration);
}

interface Focused {
  /** Чем поле опознать в тексте падения: опознаватель, имя или хотя бы тег. */
  readonly what: string;
  readonly boxShadow: string;
  readonly outlineStyle: string;
}

/** Поля, а не всё подряд: кнопка, ссылка и флажок кольцо получают по своим правилам. */
const FIELD_TYPES = new Set([
  "text",
  "search",
  "number",
  "time",
  "date",
  "email",
  "password",
  "url",
  "tel",
]);

/**
 * Обход табуляцией внутри `root`. Возвращает каждое поле, на котором побывал фокус, —
 * по одному разу. Обход настоящими нажатиями, а не `focus()`: правило продукта висит на
 * `:focus`, но проверять надо тот путь, на котором дефект и живёт.
 */
async function tabThroughFields(
  page: Page,
  root: string,
  steps: number,
): Promise<readonly Focused[]> {
  const seen = new Map<string, Focused>();
  for (let step = 0; step < steps; step += 1) {
    await page.keyboard.press("Tab");
    const field = await page.evaluate((selector) => {
      const node = document.activeElement;
      if (node === null) return null;
      const host = document.querySelector(selector);
      if (host?.contains(node) !== true) return null;

      const tag = node.tagName.toLowerCase();
      const type =
        node instanceof HTMLInputElement ? node.type.toLowerCase() : "";
      const style = getComputedStyle(node);
      return {
        tag,
        type,
        what:
          node.getAttribute("data-testid") ??
          node.getAttribute("name") ??
          node.getAttribute("aria-label") ??
          tag,
        boxShadow: style.boxShadow,
        outlineStyle: style.outlineStyle,
      };
    }, root);

    if (field === null) continue;
    const isField =
      field.tag === "select" ||
      field.tag === "textarea" ||
      (field.tag === "input" && FIELD_TYPES.has(field.type));
    if (!isField) continue;

    const key = `${field.what}#${field.tag}`;
    if (!seen.has(key)) {
      seen.set(key, {
        what: `${field.what} (<${field.tag}>)`,
        boxShadow: field.boxShadow,
        outlineStyle: field.outlineStyle,
      });
    }
  }
  return [...seen.values()];
}

/** Любая запись цвета, какую отдаёт браузер: `rgb(r, g, b)` или `rgba(r, g, b, a)`. */
const COLOR = /rgba?\(\d+,\s*\d+,\s*\d+(?:,\s*([\d.]+))?\)/g;

/**
 * Чем тень РЕАЛЬНО красит. Сравнивать вычисленное значение целиком со значением эталона
 * нельзя: Tailwind собирает `box-shadow` из нескольких слоёв и дописывает перед кольцом
 * четыре полностью прозрачных — своё место под обводку, вставку и тень, которых у поля
 * нет. На экране их не видно вовсе, и требовать их отсутствия значило бы держать в
 * проверке устройство сборщика стилей, а не правило эталона.
 */
function paintedLayers(boxShadow: string): readonly string[] {
  if (boxShadow === "none") return [];
  return [...boxShadow.matchAll(COLOR)]
    .filter((match) => match[1] === undefined || Number(match[1]) > 0)
    .map((match) => match[0]);
}

/**
 * Поле под фокусом обязано нести кольцо эталона — и ничего кроме него.
 *
 * Два условия, и второе не лишнее: первое ловит пропажу кольца (тот самый дефект),
 * второе — подмену его самодельной тенью, которая «тоже кольцо», но другое, и при
 * этом в исходниках выглядит правильно.
 */
function expectReferenceRing(
  fields: readonly Focused[],
  expected: string,
  atLeast: number,
  where: string,
): void {
  expect(
    fields.length,
    `табуляция не нашла полей, мерить было нечего: ${where}`,
  ).toBeGreaterThanOrEqual(atLeast);

  const описание = (field: Focused): string =>
    `${field.what}: box-shadow=${field.boxShadow}, outline-style=${field.outlineStyle}`;

  const naked = fields.filter((field) => !field.boxShadow.includes(expected));
  expect(
    naked.map(описание),
    `поле под фокусом без мягкого кольца эталона (${expected}): ${where}. ` +
      "Родное выделение с полей продукта снято, значит кольцо обязано быть своим.",
  ).toEqual([]);

  const expectedLayers = paintedLayers(expected).length;
  const extra = fields.filter(
    (field) => paintedLayers(field.boxShadow).length !== expectedLayers,
  );
  expect(
    extra.map(описание),
    `поле красит фокус не только кольцом эталона: ${where}`,
  ).toEqual([]);
}

async function signIn(page: Page): Promise<void> {
  await page.goto("/admin/login");
  // Не по подписи: язык интерфейса у прогона меняется, `name="password"` — нет.
  await page.locator('input[name="password"]').fill(E2E_ADMIN_PASSWORD);
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("admin-home")).toBeVisible();
}

function label(): string {
  return Math.random().toString(36).slice(2, 8);
}

/**
 * Чек-лист с ЧИСЛОВЫМ пунктом: границы диапазона и единица измерения появляются в строке
 * только у него, а ровно там кольца и не было.
 */
async function createNumberChecklist(page: Page): Promise<void> {
  await page.goto("/admin/checklists/new");
  await page.getByTestId("new-checklist-title").fill(`Кольцо ${label()}`);
  await page.getByTestId("create-checklist").click();
  await expect(page.getByTestId("editor-screen")).toBeVisible();

  await page.getByTestId("item-title").first().fill("Температура печи");
  await page.getByTestId("item-type").first().selectOption("number");
  await expect(page.getByTestId("item-min").first()).toBeVisible();
}

test.describe("поле редактора под фокусом получает кольцо эталона", () => {
  for (const theme of THEMES) {
    test(`тема «${theme}»`, async ({ page, context }) => {
      await context.addCookies([
        {
          name: THEME_COOKIE_NAME,
          value: theme,
          domain: "localhost",
          path: "/",
        },
      ]);
      await signIn(page);
      await createNumberChecklist(page);

      const expected = await resolveShadow(page, REFERENCE_SHADOW);
      expect(
        expected,
        `эталон не дал тень для .input:focus, тема «${theme}»`,
      ).not.toBe("none");

      // Экран целиком: заголовок секции, название пункта, тип, обе границы, единица.
      await page.locator("body").click({ position: { x: 2, y: 2 } });
      const screen = await tabThroughFields(
        page,
        '[data-testid="editor-screen"]',
        90,
      );
      expectReferenceRing(
        screen,
        expected,
        5,
        `экран редактора, тема «${theme}»`,
      );

      // Окно регулярности: поля времени и шага живут только в нём.
      await page.getByTestId("item-schedule-chip").first().click();
      await expect(page.getByTestId("schedule-dialog")).toBeVisible();
      await page.getByTestId("schedule-add").click();
      const dialog = await tabThroughFields(
        page,
        '[data-testid="schedule-dialog"]',
        24,
      );
      expectReferenceRing(
        dialog,
        expected,
        1,
        `окно регулярности, тема «${theme}»`,
      );
      await page.getByTestId("schedule-cancel").click();

      // Поле вставки списка: единственное место, куда методист вставляет из буфера.
      await page.getByTestId("section-paste").first().click();
      const paste = page.getByTestId("paste-area");
      await expect(paste).toBeVisible();
      // Окно вставки ловит фокус само (`autoFocus`), табулировать до поля некуда.
      await paste.focus();
      const pasteRing = await paste.evaluate((node) => ({
        boxShadow: getComputedStyle(node).boxShadow,
        outlineStyle: getComputedStyle(node).outlineStyle,
      }));
      expectReferenceRing(
        [{ what: "paste-area (<textarea>)", ...pasteRing }],
        expected,
        1,
        `поле вставки списка, тема «${theme}»`,
      );
    });
  }
});
