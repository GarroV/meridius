#!/usr/bin/env node
// Проверка боевого интерфейса без записи в базу и без локального сервера.
// PRODUCTION_URL, PRODUCTION_SESSION_FILE (короткоживущая сессия), CHROME_FOR_TESTING.
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";

import { chromium } from "@playwright/test";

const base = process.env.PRODUCTION_URL;
const sessionFile = process.env.PRODUCTION_SESSION_FILE;
const executablePath = process.env.CHROME_FOR_TESTING;
if (!base || !sessionFile || !executablePath)
  throw new Error(
    "Set PRODUCTION_URL, PRODUCTION_SESSION_FILE, CHROME_FOR_TESTING",
  );
const url = new URL(base);
const browser = await chromium.launch({ executablePath, headless: true });
const context = await browser.newContext({
  locale: "ru-RU",
  viewport: { width: 1440, height: 1000 },
  colorScheme: "light",
});
await context.addCookies([
  {
    name: "meridius_admin",
    value: (await readFile(sessionFile, "utf8")).trim(),
    domain: url.hostname,
    path: "/",
    httpOnly: true,
    secure: url.protocol === "https:",
    sameSite: "Lax",
  },
]);
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
await mkdir("reports/production-ui", { recursive: true });
try {
  const health = await page.request.get(`${base}/healthz`);
  assert.equal(health.status(), 200);
  await page.goto(`${base}/admin`);
  const home = page.getByTestId("admin-home");
  await home.waitFor();
  assert.equal(await page.getByTestId("alarm-strip").count(), 0);
  const stores = home.locator('a[href*="/feed/stores/"]');
  assert.ok((await stores.count()) > 0, "Pizzerias are visible");
  await page.screenshot({ path: "reports/production-ui/home.png" });
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
  assert.equal(await item.evaluate((node) => node.tagName), "TEXTAREA");
  const original = await item.inputValue();
  const edited = `${original} — проверка длинной формулировки без сохранения`;
  await item.fill(edited);
  assert.equal(
    await item.evaluate((node) => node.scrollHeight > node.clientHeight + 2),
    false,
    "Full item text is visible",
  );
  await page.getByTestId("editor-item").first().locator("summary").click();
  await page.getByTestId("item-type").first().waitFor({ state: "visible" });
  let warned = false;
  page.once("dialog", async (dialog) => {
    warned = true;
    await dialog.dismiss();
  });
  await page.locator('a[href$="/admin/stations"]:visible').first().click();
  assert.ok(warned, "Leaving an unsaved draft requires confirmation");
  assert.equal(await item.inputValue(), edited);
  await page.setViewportSize({ width: 375, height: 812 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    "Editor fits a phone",
  );
  await page.screenshot({ path: "reports/production-ui/editor-phone.png" });
  await item.fill(original);
  await page.goto(`${base}/admin`);
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    "Home fits a phone",
  );
  await page.emulateMedia({ colorScheme: "dark" });
  await page.screenshot({ path: "reports/production-ui/home-dark.png" });
  assert.deepEqual(errors, [], "No browser errors");
  console.log(
    "PASS: production health, pizzerias, statistics, multiline editor, settings, unsaved navigation, 375px, both themes; no writes, no browser errors.",
  );
} finally {
  await browser.close();
}
