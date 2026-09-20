// Кольцо фокуса на акцентной кнопке видно человеку (T280).
//
// Дефект, ради которого сторож заведён, красным не был НИ У ОДНОЙ проверки и живёт ровно в
// зазоре между ними. Эталон даёт фокусу одно глобальное правило — обводка цветом `--accent`,
// — а акцентная кнопка залита тем же `--accent`. Кольцо при этом есть: попиксельная сверка
// его находит, исходники выглядят правильно, сторож исходников (`design-reference.test.ts`)
// доволен. А глазом кнопка — сплошной синий блок, и человек, идущий табуляцией, не видит,
// что стоит на «Опубликовать», то есть на необратимом действии.
//
// Отсюда форма проверки. Меряется ВЫЧИСЛЕННЫЙ стиль в живом браузере — тот же приём, что у
// сторожа наведения в `theme.spec.ts`: цвет, проигравший в каскаде, из исходников не виден
// вовсе, а тут вся суть была в каскаде. Фокус ставится НАСТОЯЩЕЙ табуляцией, а не вызовом
// `focus()`: `:focus-visible` — состояние клавиатурного пути, и подменять его программным
// фокусом значило бы проверять не то состояние, в котором дефект живёт.
//
// Главный инвариант тут НЕ «box-shadow равен токену»: и продукт, и ожидание берут `--focus-ring`
// из одного файла эталона, поэтому разъедутся они вместе и молча. Независимый инвариант —
// «кольцо не цвета собственной заливки»: он краснеет ровно на возврате дефекта, чем бы тот ни
// был вызван — снятым правилом, переопределённым токеном или новым экраном мимо крючка.
import { test, expect, type Locator, type Page } from "@playwright/test";

import { THEME_COOKIE_NAME } from "../src/blocks/core/theme";
import { E2E_ADMIN_PASSWORD } from "./admin-credentials";

const THEMES = ["light", "dark"] as const;
type Theme = (typeof THEMES)[number];

/** Любая запись цвета, какую отдаёт браузер: `rgb(r, g, b)` или `rgba(r, g, b, a)`. */
const COLOR = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/g;

interface Paint {
  /** Только r,g,b: прозрачность нарочно отброшена — accent под .45 всё равно accent. */
  readonly rgb: string;
  readonly alpha: number;
}

/** Все цвета строки в порядке появления. Невидимые (alpha 0) сюда попадают тоже. */
function colorsOf(value: string): readonly Paint[] {
  return [...value.matchAll(COLOR)].map((m) => ({
    rgb: `${m[1]},${m[2]},${m[3]}`,
    alpha: m[4] === undefined ? 1 : Number(m[4]),
  }));
}

interface Ring {
  readonly fill: string;
  readonly boxShadow: string;
  readonly outlineStyle: string;
  readonly outlineColor: string;
  readonly focusVisible: boolean;
}

async function ringOf(target: Locator): Promise<Ring> {
  return target.evaluate((node) => {
    const s = getComputedStyle(node);
    return {
      fill: s.backgroundColor,
      boxShadow: s.boxShadow,
      outlineStyle: s.outlineStyle,
      outlineColor: s.outlineColor,
      focusVisible: node.matches(":focus-visible"),
    };
  });
}

/**
 * Цвета, которыми кольцо РЕАЛЬНО покрашено. Обводка стиля `none` не рисуется вовсе, а
 * полностью прозрачное не рисуется тем более — иначе «кольцо есть» подтверждалось бы
 * объявлением, которого не видно.
 */
function paintedRing(ring: Ring): readonly Paint[] {
  const shadow = ring.boxShadow === "none" ? [] : colorsOf(ring.boxShadow);
  const outline =
    ring.outlineStyle === "none" ? [] : colorsOf(ring.outlineColor);
  return [...shadow, ...outline].filter((paint) => paint.alpha > 0);
}

/**
 * Кольцо, которое человек УВИДИТ. Два условия, и второе — тот самый дефект: краска есть,
 * но она цвета самой кнопки. Прозрачная заливка (ссылка, пункт меню) сравнению не мешает:
 * сравнивать не с чем, и кольцо видно по определению.
 */
async function expectVisibleRing(target: Locator, where: string): Promise<Ring> {
  const ring = await ringOf(target);
  expect(
    ring.focusVisible,
    `орган не в состоянии :focus-visible, мерить нечего: ${where}`,
  ).toBe(true);

  const painted = paintedRing(ring);
  expect(painted.length, `кольца не видно вовсе: ${where}`).toBeGreaterThan(0);

  const own = colorsOf(ring.fill).find((paint) => paint.alpha > 0);
  if (own !== undefined) {
    expect(
      painted.filter((paint) => paint.rgb !== own.rgb).length,
      `кольцо целиком цвета заливки органа (${ring.fill}) — человек его не увидит: ${where}`,
    ).toBeGreaterThan(0);
  }
  return ring;
}

/**
 * Во что эталонный `--focus-ring` превращается в ЭТОМ документе (а значит — в этой теме).
 * Считает сам браузер на подопытном узле: писать пересчёт токена в запись браузера руками
 * значило бы завести второй экземпляр значений и сверять продукт с собственной опечаткой.
 */
async function referenceRing(page: Page): Promise<string> {
  return page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.boxShadow = "var(--focus-ring)";
    document.body.append(probe);
    const value = getComputedStyle(probe).boxShadow;
    probe.remove();
    return value;
  });
}

/**
 * Табуляция до цели — ровно путь человека из задачи. Возвращает признак, а не молчит:
 * недостижимая цель обязана красить проверку в красный, а не оставлять её без замера.
 */
async function tabTo(page: Page, target: Locator, limit = 60): Promise<boolean> {
  await target.waitFor();
  for (let step = 0; step < limit; step += 1) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((node) => node === document.activeElement)) {
      return true;
    }
  }
  return false;
}

async function signIn(page: Page): Promise<void> {
  await page.goto("/admin/login");
  // Поле по типу, а не по подписи: браузер прогона по умолчанию английский (T253).
  await page.locator("input[type=password]").fill(E2E_ADMIN_PASSWORD);
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("admin-home")).toBeVisible();
}

/** Экраны с акцентной кнопкой, которые открываются БЕЗ заведения данных. */
const ACCENT_BUTTONS = [
  {
    name: "список чек-листов, «Новый чек-лист»",
    path: "/admin/checklists",
    testId: "new-checklist",
  },
  {
    name: "заведение чек-листа, «Создать»",
    path: "/admin/checklists/new",
    testId: "create-checklist",
  },
  {
    name: "библиотека блоков, «Новый блок»",
    path: "/admin/library",
    testId: "new-block",
  },
] as const;

test.describe("акцентная кнопка под фокусом получает кольцо эталона", () => {
  for (const theme of THEMES) {
    test(`тема «${theme}»`, async ({ page, context }) => {
      await context.addCookies([
        { name: THEME_COOKIE_NAME, value: theme, domain: "localhost", path: "/" },
      ]);
      await signIn(page);

      for (const button of ACCENT_BUTTONS) {
        const where = `${button.name}, тема «${theme}»`;
        await page.goto(button.path);
        const target = page.getByTestId(button.testId);

        expect(
          await tabTo(page, target),
          `до кнопки не дойти табуляцией: ${where}`,
        ).toBe(true);

        // Независимый инвариант: кольцо видно и оно НЕ цвета заливки кнопки. Краснеет на
        // возврате дефекта, даже если эталон с продуктом разъедутся вместе.
        const ring = await expectVisibleRing(target, where);

        // И сверх того — кольцо именно эталонное, а не самодельное.
        const reference = await referenceRing(page);
        expect(
          reference,
          `эталон не дал --focus-ring: сверять было бы не с чем, ${where}`,
        ).not.toBe("none");
        expect(ring.boxShadow, `кольцо не из эталона: ${where}`).toBe(reference);
      }
    });
  }
});

/**
 * Обратная сторона той же правки: чинили акцентную кнопку — у остальных органов кольцо
 * обязано остаться прежним. Берётся пункт меню (каркас кабинета) и поле пароля на входе:
 * первый живёт на каждом экране кабинета, второе — единственное поле, которое видит
 * человек, ещё не вошедший.
 */
test.describe("остальные органы кольца не потеряли", () => {
  for (const theme of THEMES) {
    test(`тема «${theme}»`, async ({ page, context }) => {
      await context.addCookies([
        { name: THEME_COOKIE_NAME, value: theme, domain: "localhost", path: "/" },
      ]);

      // Сначала — экран входа: до него человек ещё не вошёл, и гасить сессию не нужно.
      await page.goto("/admin/login");
      const field = page.locator("input[type=password]");
      expect(
        await tabTo(page, field),
        `до поля пароля не дойти табуляцией, тема «${theme}»`,
      ).toBe(true);
      await expectVisibleRing(field, `поле пароля на входе, тема «${theme}»`);

      await signIn(page);
      await page.goto("/admin/checklists");
      const navItem = page.getByTestId("nav-feed");
      expect(
        await tabTo(page, navItem),
        `до пункта меню не дойти табуляцией, тема «${theme}»`,
      ).toBe(true);
      await expectVisibleRing(navItem, `пункт меню кабинета, тема «${theme}»`);
    });
  }
});
