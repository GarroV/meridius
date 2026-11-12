#!/usr/bin/env node
// Снимки живых экранов для посадочной /welcome (D193) — одной командой.
//
//   npm run landing-shots
//   LANDING_SHOTS_BASE=https://meridius-demo.vasiliy-garro.workers.dev npm run landing-shots
//   LANDING_SHOTS_LANGS=en npm run landing-shots   (только один язык)
//
// Скрипт сам входит на демо-стенд (`/demo` → выбор роли), открывает настоящие экраны
// продукта и пишет обрезанные ретина-снимки (deviceScaleFactor 2) в
// `public/landing/<имя>-<en|ru>.webp`, а их размеры — в `public/landing/sizes.json`.
// Ничего не рисуется и не подставляется: только прячется плашка демо. Только настоящие
// экраны — решение D545 (у Decimus), D193 (здесь). Пересъёмка нужна при каждой правке
// интерфейса, видимой на этих экранах (реестр — docs/user-materials.md).
//
// Нужны: Playwright (есть в проекте), браузер из его кэша или CHROME_FOR_TESTING, и `cwebp`
// (`brew install webp`) — Playwright webp не пишет, а новую зависимость ради съёмки не
// заводим. Нет `cwebp` — скрипт падает с понятным сообщением, а не пишет png под видом webp.
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { register } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { chromium } from "@playwright/test";

register("./src-resolve-hook.mjs", import.meta.url);
const { KITCHEN_STATION_CODE } = await import("../src/blocks/demo/roles.ts");

const run = promisify(execFile);

const BASE = (
  process.env.LANDING_SHOTS_BASE ??
  "https://meridius-demo.vasiliy-garro.workers.dev"
).replace(/\/$/, "");
const OUT = path.resolve(import.meta.dirname, "../public/landing");
const ALL_LANGS = ["en", "ru"];
// LANDING_SHOTS_LANGS=en — снять только английские (пока стенд не выложен с переключателем языка).
const LANGS = (process.env.LANDING_SHOTS_LANGS ?? ALL_LANGS.join(","))
  .split(",")
  .map((lang) => lang.trim())
  .filter((lang) => ALL_LANGS.includes(lang));
const LOCALES = { en: "en-US", ru: "ru-RU" };
const SCALE = 2;
const WEBP_QUALITY = "86";
const DESKTOP = { width: 1280, height: 820 };
const PHONE = { width: 390, height: 844, isMobile: true };
const TABLET = { width: 1024, height: 768 };
// Плашка демо и всё служебное, что к смыслу снимка не относится.
const HIDE_CSS = '[data-testid="demo-banner"] { display: none !important; }';

/** Размер png из заголовка IHDR: ширина и высота — по 4 байта с 16-го. */
function pngSize(buffer) {
  return [buffer.readUInt32BE(16), buffer.readUInt32BE(20)];
}

async function toWebp(png, file) {
  const dir = await mkdtemp(path.join(tmpdir(), "meridius-shot-"));
  const source = path.join(dir, "shot.png");
  try {
    await writeFile(source, png);
    await run("cwebp", ["-quiet", "-q", WEBP_QUALITY, source, "-o", file]);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      throw new Error(
        "Нет cwebp: установите (`brew install webp`) и повторите",
      );
    }
    throw error;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Вход на демо-стенд: `/demo` и выбор роли (кнопка формы, без пароля). */
async function enterDemo(page, lang) {
  await page.goto(`${BASE}/demo?lang=${lang}`);
  // `demo-role-hq` — сама форма карточки, нажимать надо её кнопку отправки.
  const button = page
    .locator('[data-testid="demo-role-hq"] button[type="submit"]')
    .first();
  await button.click();
  await page.waitForURL(/\/admin/);
}

async function checkLanguage(page, lang, name) {
  const documentLang = await page.locator("html").getAttribute("lang");
  if (documentLang !== lang) {
    throw new Error(
      `${name}-${lang}: документ на языке «${documentLang}», снимок вышел бы не тем`,
    );
  }
}

/**
 * Экраны: имя, окно, как дойти до экрана на этом стенде. `isPublic` — экран заполнения:
 * вход не нужен, а язык ему задаёт пиццерия (D122), а не браузер, поэтому язык документа
 * не сверяется. Демо-пиццерии английские, так что русский снимок заполнения и планшета
 * выходит английским, пока в демо нет русской станции, — это решает владелец демо-набора.
 */
const SHOTS = [
  {
    name: "fill",
    isPublic: true,
    viewport: PHONE,
    open: (page) => page.goto(`${BASE}/s/${KITCHEN_STATION_CODE}`),
  },
  {
    name: "tablet",
    isPublic: true,
    viewport: TABLET,
    open: (page) => page.goto(`${BASE}/s/${KITCHEN_STATION_CODE}`),
  },
  {
    name: "editor",
    viewport: DESKTOP,
    open: async (page) => {
      await page.goto(`${BASE}/admin/checklists`);
      await page
        .getByTestId("master-rail")
        .locator('a[href*="/checklists/"]:not([href$="/new"])')
        .first()
        .click();
      await page.getByTestId("item-title").first().waitFor();
    },
  },
  {
    name: "qr",
    viewport: DESKTOP,
    open: async (page) => {
      await page.goto(`${BASE}/admin/stations`);
      await page.getByTestId("station-link").first().click();
      await page.getByTestId("station-code").waitFor();
    },
  },
  {
    name: "stats",
    viewport: DESKTOP,
    open: async (page) => {
      await page.goto(`${BASE}/admin`);
      await page.locator('a[href*="/feed/stores/"]').first().click();
      await page.waitForURL("**/admin/feed/stores/**");
    },
  },
  {
    name: "feed",
    viewport: DESKTOP,
    open: (page) => page.goto(`${BASE}/admin/feed`),
  },
  {
    name: "network",
    viewport: DESKTOP,
    open: (page) => page.goto(`${BASE}/admin/catalog`),
  },
  {
    name: "templates",
    viewport: DESKTOP,
    open: (page) => page.goto(`${BASE}/admin/templates`),
  },
];

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROME_FOR_TESTING
    ? { executablePath: process.env.CHROME_FOR_TESTING }
    : {}),
});
const sizes = {};
try {
  for (const lang of LANGS) {
    for (const shot of SHOTS) {
      // Окно у каждого снимка своё, а вход общий на язык: контекст на снимок проще,
      // чем пересаживать окно, и куки демо-роли не текут между экранами.
      const context = await browser.newContext({
        locale: LOCALES[lang],
        viewport: { width: shot.viewport.width, height: shot.viewport.height },
        isMobile: shot.viewport.isMobile === true,
        hasTouch: shot.viewport.isMobile === true,
        deviceScaleFactor: SCALE,
        colorScheme: "light",
      });
      const page = await context.newPage();
      try {
        if (!shot.isPublic) await enterDemo(page, lang);
        await shot.open(page);
        await page.addStyleTag({ content: HIDE_CSS });
        await page.evaluate(() => document.fonts.ready);
        if (!shot.isPublic) await checkLanguage(page, lang, shot.name);
        const png = await page.screenshot();
        const key = `${shot.name}-${lang}`;
        await toWebp(png, path.join(OUT, `${key}.webp`));
        sizes[key] = pngSize(png);
        console.log(`снято: ${key} ${sizes[key].join("×")}`);
      } finally {
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
}

// Ключи — по алфавиту: файл попадает в git, и пересъёмка не должна менять порядок строк.
const ordered = Object.fromEntries(
  Object.entries(sizes).sort(([a], [b]) => a.localeCompare(b)),
);
// Формат — как у prettier (пара размеров в одну строку): иначе проверка формата краснеет
// после каждой пересъёмки.
const lines = Object.entries(ordered).map(
  ([key, [width, height]]) => `  ${JSON.stringify(key)}: [${width}, ${height}]`,
);
await writeFile(path.join(OUT, "sizes.json"), `{\n${lines.join(",\n")}\n}\n`);
console.log(`готово: ${Object.keys(ordered).length} снимков в ${OUT}`);
