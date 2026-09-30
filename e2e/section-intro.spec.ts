// Каждый раздел кабинета открывается вводным блоком — на экране, а не в исходниках (D152).
//
// Модульный сторож (`src/blocks/core/section-intro.test.ts`) видит вызов компонента, но не
// видит, дошёл ли блок до человека: на телефоне рабочая зона мастер-детали без выбора
// спрятана, и блок, стоящий только там, был бы в разметке и не был бы на экране. Поэтому
// здесь — видимый блок на обеих ширинах и на обоих языках, с текстом из словаря, а не с
// ключом (next-intl на пропавший ключ рисует сам ключ и не падает).
import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Browser } from "@playwright/test";

import { ADMIN_SECTIONS } from "@/blocks/core/admin-sections";
import {
  INTRO_PARTS,
  INTRO_SECTIONS,
  type IntroSectionKey,
} from "@/blocks/core/section-intro";

import { E2E_ADMIN_PASSWORD } from "./admin-credentials";

type IntroTexts = Record<
  IntroSectionKey,
  Record<(typeof INTRO_PARTS)[number], string>
> & { readonly more: string };

/** Словарь читается файлом: раннер сквозных не импортирует JSON без атрибута типа. */
function introTexts(language: "ru" | "en"): IntroTexts {
  const file = path.resolve(
    import.meta.dirname,
    `../src/messages/${language}.json`,
  );
  const dictionary = JSON.parse(readFileSync(file, "utf8")) as {
    sectionIntro: IntroTexts;
  };
  return dictionary.sectionIntro;
}

/** Граница D172: до 640 px включительно блок показывает только первую строку. */
const PHONE_MAX = 640;

const WIDTHS = [
  { name: "стол", width: 1280, height: 900 },
  { name: "телефон", width: 375, height: 812 },
] as const;

const LOCALES = [
  { locale: "ru-RU", password: "Пароль", intro: introTexts("ru") },
  { locale: "en-US", password: "Password", intro: introTexts("en") },
] as const;

async function signedIn(browser: Browser, locale: string, password: string) {
  const context = await browser.newContext({ locale });
  const page = await context.newPage();
  await page.goto("/admin/login");
  await page.getByLabel(password).fill(E2E_ADMIN_PASSWORD);
  await page.locator('input[name="login"]').fill("admin");
  await page.getByTestId("login-submit").click();
  await page.waitForURL(/\/admin(?!\/login)/);
  return { context, page };
}

test.describe("вводный блок разделов кабинета (D152)", () => {
  for (const { locale, password, intro } of LOCALES) {
    test(`каждый раздел объясняет себя на обеих ширинах (${locale})`, async ({
      browser,
    }) => {
      const { context, page } = await signedIn(browser, locale, password);

      for (const { name, width, height } of WIDTHS) {
        await page.setViewportSize({ width, height });
        for (const section of INTRO_SECTIONS) {
          await page.goto(ADMIN_SECTIONS[section].path);
          const block = page
            .locator(`[data-testid="section-intro"][data-section="${section}"]`)
            .filter({ visible: true });
          await expect(
            block,
            `раздел «${section}» без видимого вводного блока (${name}, ${locale})`,
          ).toHaveCount(1);
          const [first, ...rest] = INTRO_PARTS;
          await expect(block.getByText(intro[section][first])).toBeVisible();

          // D172: на телефоне «что здесь» и «что дальше» раскрываются по «Подробнее»,
          // на широком экране видны сразу, а «Подробнее» там нет.
          const more = block.locator("summary").filter({ visible: true });
          if (width <= PHONE_MAX) {
            for (const part of rest) {
              await expect(
                block.getByText(intro[section][part]).filter({ visible: true }),
                `«${part}» раздела «${section}» виден до «Подробнее» (${name}, ${locale})`,
              ).toHaveCount(0);
            }
            await expect(more).toHaveText(intro.more);
            await more.click();
          } else {
            await expect(more).toHaveCount(0);
          }
          for (const part of rest) {
            await expect(
              block.getByText(intro[section][part]).filter({ visible: true }),
              `«${part}» раздела «${section}» не виден (${name}, ${locale})`,
            ).toHaveCount(1);
          }
        }
      }

      await context.close();
    });
  }
});
