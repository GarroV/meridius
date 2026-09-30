// Экран УК «Партнёры» (T337, D169) — сквозной путь учётки партнёра через настоящий
// кабинет: УК заводит партнёра → партнёр входит и видит только свои страны → УК
// сбрасывает пароль, и входит только новый → УК снимает учётку → вход отказан, а
// открытая сессия гаснет.
import { randomUUID } from "node:crypto";

import { expect, test, type Browser, type Page } from "@playwright/test";
import { Pool } from "pg";

import { E2E_ADMIN_PASSWORD } from "./admin-credentials";
import { e2eDatabaseUrl } from "./database";

const PARTNER_PASSWORD = "пароль-партнёра-e2e";

async function seedCountry(pool: Pool, name: string): Promise<void> {
  await pool.query("insert into countries (name, locale) values ($1, 'ru')", [
    name,
  ]);
}

async function signIn(
  page: Page,
  login: string,
  password: string,
): Promise<void> {
  await page.goto("/admin/login");
  await page.locator('input[name="login"]').fill(login);
  await page.locator('input[name="password"]').fill(password);
  await page.getByTestId("login-submit").click();
}

async function freshPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ locale: "ru-RU" });
  return context.newPage();
}

test.describe("экран «Партнёры»", () => {
  test.use({ locale: "ru-RU" });

  test("УК заводит партнёра, сбрасывает ему пароль и снимает учётку", async ({
    page,
    browser,
  }) => {
    test.setTimeout(120_000);
    const label = randomUUID().slice(0, 8);
    const mine = `Страна-партнёра-${label}`;
    const foreign = `Чужая-страна-${label}`;
    const tenant = `Партнёр-${label}`;
    const login = `e2e-partner-${label}`;
    const pool = new Pool({ connectionString: e2eDatabaseUrl() });
    try {
      await seedCountry(pool, mine);
      await seedCountry(pool, foreign);
    } finally {
      await pool.end();
    }

    // УК заводит партнёра с одной страной.
    await signIn(page, "admin", E2E_ADMIN_PASSWORD);
    await expect(page).not.toHaveURL(/\/admin\/login/);
    await page.goto("/admin/partners");
    const form = page.getByTestId("partner-create");
    await form.getByLabel("Партнёр", { exact: true }).fill(tenant);
    await form.getByLabel("Логин").fill(login);
    await form.getByLabel("Пароль").fill(PARTNER_PASSWORD);
    await form.getByLabel(mine).check();
    await page.getByTestId("partner-create-submit").click();
    await expect(page.getByTestId("partner-create-done")).toContainText(login);
    const row = page.locator(
      `[data-testid="partner-account"][data-login="${login}"]`,
    );
    await expect(row).toContainText(tenant);
    await expect(row).toContainText(mine);

    // Партнёр входит и видит только свою страну; экран «Партнёры» ему — 404.
    const partner = await freshPage(browser);
    await signIn(partner, login, PARTNER_PASSWORD);
    await expect(partner).not.toHaveURL(/\/admin\/login/);
    await partner.goto("/admin/catalog");
    await expect(partner.locator("body")).toContainText(mine);
    await expect(partner.locator("body")).not.toContainText(foreign);
    // Тот же экран запросом клиентской навигации несёт имя страны — значит проверка
    // того же запроса после сброса ниже может упасть, а не зеленеет вхолостую.
    const rscBefore = await partner.request.get("/admin/catalog", {
      headers: { RSC: "1" },
    });
    expect(await rscBefore.text()).toContain(mine);
    const refused = await partner.request.get("/admin/partners");
    expect(refused.status()).toBe(404);

    // УК сбрасывает пароль: прежний больше не входит, новый — входит, а вкладка,
    // открытая до сброса, уходит на вход (#198). Время выпуска сессии — целые секунды,
    // и сессия той же секунды, что и сброс, выживает (accounts.ts): пауза отделяет вход
    // партнёра от сброса, чтобы сценарий проверял правило, а не везение со временем.
    await partner.waitForTimeout(1_000);
    await row.getByTestId("partner-reset-open").click();
    await row.getByTestId("partner-reset").click();
    const issued = row.getByTestId("partner-reset-password");
    await expect(issued).toHaveText(/^\S{12,}$/);
    const newPassword = (await issued.textContent()) ?? "";

    const withOld = await freshPage(browser);
    await signIn(withOld, login, PARTNER_PASSWORD);
    await expect(withOld.getByTestId("login-error")).toBeVisible();
    const withNew = await freshPage(browser);
    await signIn(withNew, login, newPassword);
    await expect(withNew).not.toHaveURL(/\/admin\/login/);
    // Клиентская навигация (заголовок RSC): подпись куки верна, поэтому охрана перед
    // рендером её пропускает, и отказ даёт только разметка. Тело ответа не должно
    // унести страницу вместе с редиректом.
    const rsc = await partner.request.get("/admin/catalog", {
      headers: { RSC: "1" },
      maxRedirects: 0,
    });
    expect(await rsc.text()).not.toContain(mine);
    await partner.goto("/admin/catalog");
    await expect(partner).toHaveURL(/\/admin\/login/);
    await expect(partner.locator("body")).not.toContainText(mine);

    // УК снимает учётку: вход отказан, открытая сессия гаснет на следующем запросе.
    await row.getByTestId("partner-disable-open").click();
    await row.getByTestId("partner-disable-submit").click();
    await expect(row).toHaveAttribute("data-removed", "true");

    const afterRemoval = await freshPage(browser);
    await signIn(afterRemoval, login, newPassword);
    await expect(afterRemoval.getByTestId("login-error")).toBeVisible();
    await withNew.goto("/admin/catalog");
    await expect(withNew).toHaveURL(/\/admin\/login/);
  });

  test("отказ формы называет причину и ничего не заводит", async ({ page }) => {
    const label = randomUUID().slice(0, 8);
    await signIn(page, "admin", E2E_ADMIN_PASSWORD);
    await expect(page).not.toHaveURL(/\/admin\/login/);
    await page.goto("/admin/partners");

    const form = page.getByTestId("partner-create");
    await form
      .getByLabel("Партнёр", { exact: true })
      .fill(`Без-стран-${label}`);
    await form.getByLabel("Логин").fill(`e2e-nocountry-${label}`);
    await form.getByLabel("Пароль").fill(PARTNER_PASSWORD);
    await page.getByTestId("partner-create-submit").click();

    await expect(page.getByTestId("partner-create-error")).toContainText(
      "хотя бы одну страну",
    );
    await expect(
      page.locator(`[data-login="e2e-nocountry-${label}"]`),
    ).toHaveCount(0);
  });
});
