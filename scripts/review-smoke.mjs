#!/usr/bin/env node
// Проверка UI-ветки на отдельном удалённом стенде. Сервер на Маке не запускается.
// REVIEW_URL, REVIEW_LOGIN_FILE (две строки: логин и пароль), CHROME_FOR_TESTING.
import { readFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";

const base = process.env.REVIEW_URL;
const file = process.env.REVIEW_LOGIN_FILE;
if (!base || !file || !process.env.CHROME_FOR_TESTING)
  throw new Error("Set REVIEW_URL, REVIEW_LOGIN_FILE, CHROME_FOR_TESTING");
const [login, password] = (await readFile(file, "utf8")).trim().split("\n");
await mkdir("reports/ui-review", { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_FOR_TESTING,
  headless: true,
});
const context = await browser.newContext({
  locale: "ru-RU",
  viewport: { width: 1440, height: 1000 },
  colorScheme: "light",
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
try {
  await page.goto(`${base}/admin/login`);
  await page.locator("[name=login]").fill(login);
  await page.locator("[name=password]").fill(password);
  await page.locator("button[type=submit]").last().click();
  await page.getByTestId("admin-home").waitFor();
  assert.equal(await page.getByTestId("alarm-strip").count(), 0);
  const stores = page
    .getByTestId("admin-home")
    .locator('a[href*="/feed/stores/"]');
  assert.ok((await stores.count()) > 0, "Pizzerias are visible");
  await page.screenshot({
    path: "reports/ui-review/home-light.png",
    fullPage: true,
  });
  await stores.first().click();
  await page.waitForURL("**/admin/feed/stores/**");
  await page.goto(`${base}/admin/checklists`);
  await page
    .getByTestId("master-rail")
    .locator('a[href*="/checklists/"]:not([href$="/new"])')
    .first()
    .click();
  const item = page.getByTestId("item-title").first();
  await item.waitFor();
  const original = await item.inputValue();
  const edited =
    original +
    " — длинная формулировка для проверки переноса текста без обрезания и потери смысла";
  await item.fill(edited);
  const clipped = await item.evaluate(
    (node) => node.scrollHeight > node.clientHeight + 2,
  );
  assert.equal(clipped, false, "Full item text is visible");
  await page
    .locator('[data-testid="editor-item"]')
    .first()
    .locator("summary")
    .click();
  await page.getByTestId("item-type").first().waitFor({ state: "visible" });
  page.once("dialog", (dialog) => dialog.dismiss());
  await page
    .locator('a[data-testid="nav-stations"],a[href$="/admin/stations"]')
    .first()
    .click();
  assert.equal(
    await item.inputValue(),
    edited,
    "Cancelled navigation preserves changes",
  );
  await page.getByTestId("save-draft").click();
  await page
    .getByTestId("editor-meta")
    .filter({ hasText: /сохран|saved/i })
    .waitFor();
  await page.reload();
  assert.equal(
    await page.getByTestId("item-title").first().inputValue(),
    edited,
    "Draft persists after reload",
  );
  await page.screenshot({
    path: "reports/ui-review/editor-light.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 375, height: 812 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    "Editor fits a phone",
  );
  await page.screenshot({
    path: "reports/ui-review/editor-phone.png",
    fullPage: true,
  });
  // Ошибка публикации после успешного сохранения не должна снимать защиту правок.
  const titleField = page.getByTestId("checklist-title");
  const savedTitle = await titleField.inputValue();
  await titleField.fill("");
  await page.getByTestId("publish").click();
  await page.getByTestId("editor-error").waitFor();
  let warnedAfterFailure = false;
  page.once("dialog", async (dialog) => {
    warnedAfterFailure = true;
    await dialog.dismiss();
  });
  await page.locator('a[href$="/admin/stations"]').first().click();
  assert.ok(warnedAfterFailure, "Failed publish keeps the unsaved warning");
  assert.equal(await titleField.inputValue(), "");
  await titleField.fill(savedTitle);
  await page.goto(`${base}/admin`);
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    "Home fits a phone",
  );
  await page.screenshot({
    path: "reports/ui-review/home-phone.png",
    fullPage: true,
  });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.screenshot({
    path: "reports/ui-review/home-dark.png",
    fullPage: true,
  });
  assert.deepEqual(errors, [], "No browser errors");
  console.log(
    "PASS: login, pizzerias, detail, multiline editor, settings, unsaved warning, save/reload, failed publish warning, 375px, both themes; no browser errors.",
  );
} finally {
  await browser.close();
}
