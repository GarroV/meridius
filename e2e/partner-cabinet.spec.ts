// Кабинет глазами двух ролей (T344, #199): меню и подвал знают, кто вошёл.
//
// Сверка T337/T338 нашла: пункта «Партнёры» в меню УК нет вовсе, в подвале меню у
// партнёра написано «методист», а в библиотеке, которую партнёр только читает, крошка
// «Работа». Здесь каждый из этих фактов проверяется на живой учётке партнёра.
import { randomUUID } from "node:crypto";

import { expect, test, type Browser, type Page } from "@playwright/test";
import { Pool } from "pg";

import { hashPassword } from "../src/blocks/auth/password";
import { E2E_ADMIN_PASSWORD } from "./admin-credentials";
import { e2eDatabaseUrl } from "./database";

const PARTNER_PASSWORD = "пароль-партнёра-e2e-кабинет";

/** Партнёр с одной страной — прямо в базе: экран заведения стережёт `partners.spec`. */
async function seedPartner(): Promise<string> {
  const label = randomUUID().slice(0, 8);
  const pool = new Pool({ connectionString: e2eDatabaseUrl() });
  try {
    const country = await pool.query<{ id: string }>(
      "insert into countries (name, locale) values ($1, 'ru') returning id",
      [`Страна-кабинета-${label}`],
    );
    const tenant = await pool.query<{ id: string }>(
      "insert into tenants (kind, name) values ('partner', $1) returning id",
      [`Партнёр-кабинета-${label}`],
    );
    const tenantId = tenant.rows[0]?.id;
    const countryId = country.rows[0]?.id;
    if (tenantId === undefined || countryId === undefined) {
      throw new Error("не завёлся партнёр или страна");
    }
    await pool.query(
      "insert into tenant_countries (tenant_id, country_id) values ($1, $2)",
      [tenantId, countryId],
    );
    const login = `e2e-cab-${label}`;
    await pool.query(
      "insert into accounts (tenant_id, login, password_hash) values ($1, $2, $3)",
      [
        tenantId,
        login,
        await hashPassword(PARTNER_PASSWORD, {
          cost: 1024,
          blockSize: 8,
          parallelization: 1,
        }),
      ],
    );
    return login;
  } finally {
    await pool.end();
  }
}

async function signedIn(
  browser: Browser,
  login: string,
  password: string,
): Promise<Page> {
  const context = await browser.newContext({ locale: "ru-RU" });
  const page = await context.newPage();
  await page.goto("/admin/login");
  await page.locator('input[name="login"]').fill(login);
  await page.locator('input[name="password"]').fill(password);
  await page.getByTestId("login-submit").click();
  await expect(page).not.toHaveURL(/\/admin\/login/);
  return page;
}

test.describe("кабинет УК и партнёра", () => {
  test("УК: пункт «Партнёры» в меню, подсвечен на своём экране; подпись роли", async ({
    browser,
  }) => {
    const page = await signedIn(browser, "admin", E2E_ADMIN_PASSWORD);

    const item = page.getByTestId("nav-partners");
    await expect(item).toHaveAttribute("href", "/admin/partners");
    await expect(item).not.toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("nav-role")).toHaveText("методист УК");

    await item.click();
    await expect(page.getByTestId("partners-screen")).toBeVisible();
    await expect(page.getByTestId("nav-partners")).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(
      page.locator('[data-testid="section-intro"][data-section="partners"]'),
    ).toBeVisible();

    // Библиотека у УК — рабочий раздел, крошка прежняя.
    await page.goto("/admin/library");
    await expect(page.getByTestId("admin-crumbs")).toHaveText("Работа");
    await page.context().close();
  });

  test("партнёр: пункта «Партнёры» нет, роль — партнёр, библиотека — справочник", async ({
    browser,
  }) => {
    const login = await seedPartner();
    const page = await signedIn(browser, login, PARTNER_PASSWORD);

    await page.goto("/admin");
    await expect(page.getByTestId("nav-catalog")).toBeVisible();
    await expect(page.getByTestId("nav-partners")).toHaveCount(0);
    await expect(page.getByTestId("nav-role")).toHaveText("партнёр");

    await page.goto("/admin/library");
    await expect(page.getByTestId("library-screen")).toBeVisible();
    await expect(page.getByTestId("admin-crumbs")).toHaveText("Справочник");
    await page.context().close();
  });
});
