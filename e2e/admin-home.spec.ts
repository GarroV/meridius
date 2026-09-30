// Главная кабинета — работа вошедшего, а не указатель разделов (D148, T315).
//
// Что держит сценарий. После входа человек видит своё и из каждой строки попадает туда,
// куда она зовёт: плашка «станции без чек-листа» — в «Станции», уже отфильтрованные;
// строка чек-листа — в его редактор; строка заполнения — в его карточку. Чек-листов нет —
// на экране один призыв, и он ведёт в «Шаблоны». Проверяется так, как пользуются: от формы
// входа и дальше по ссылкам, а не прямым `page.goto` в экран (находка #11 — тупик после
// входа, которого не ловил ни один сценарий, открывавший экраны по адресу).
//
// Мир свой, а не общий: вход партнёром, чьё пространство — одна свежая страна. Под
// учёткой УК на главной вся сеть, и то, что в неё положил соседний поток, делало бы
// строки непредсказуемыми. До T315 здесь проверялись шесть карточек разделов, которых на
// главной больше нет (#197).
import { randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";

import {
  ADMIN_REDIRECTED_SECTIONS,
  ADMIN_SECTIONS,
  type AdminSectionKey,
} from "@/blocks/core/admin-sections";

import { hashPassword } from "../src/blocks/auth/password";
import { E2E_ADMIN_PASSWORD } from "./admin-credentials";
import { e2eDatabaseUrl } from "./database";

const PASSWORD = "e2e-пароль-главной-длинный";

const CODE_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";

function stationCode(): string {
  return Array.from(
    { length: 10 },
    () =>
      CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)] ?? "z",
  ).join("");
}

async function one(
  pool: Pool,
  text: string,
  values: readonly unknown[],
): Promise<string> {
  const result = await pool.query<{ id: string }>(text, [...values]);
  const id = result.rows[0]?.id;
  if (id === undefined) throw new Error(`Не вставилось: ${text}`);
  return id;
}

/** Партнёр со своей страной; без станций — пустое пространство. */
async function seedPartner(
  pool: Pool,
  label: string,
): Promise<{ login: string; countryId: string }> {
  const countryId = await one(
    pool,
    "insert into countries (name, locale) values ($1, 'ru') returning id",
    [`Страна-главной-${label}`],
  );
  const tenantId = await one(
    pool,
    "insert into tenants (kind, name) values ('partner', $1) returning id",
    [`Партнёр-главной-${label}`],
  );
  await pool.query(
    "insert into tenant_countries (tenant_id, country_id) values ($1, $2)",
    [tenantId, countryId],
  );
  const login = `e2e-home-${label}`;
  await pool.query(
    "insert into accounts (tenant_id, login, password_hash) values ($1, $2, $3)",
    [
      tenantId,
      login,
      await hashPassword(PASSWORD, {
        cost: 1024,
        blockSize: 8,
        parallelization: 1,
      }),
    ],
  );
  return { login, countryId };
}

interface WorkingWorld {
  readonly login: string;
  readonly checklistId: string;
  readonly checklistTitle: string;
  readonly submissionId: string;
  readonly emptyStationName: string;
}

/** Пиццерия с двумя станциями: на одной рабочий чек-лист и заполнение, другая пустая. */
async function seedWorkingPartner(): Promise<WorkingWorld> {
  const label = randomUUID().slice(0, 8);
  const pool = new Pool({ connectionString: e2eDatabaseUrl() });
  try {
    const { login, countryId } = await seedPartner(pool, label);
    const storeId = await one(
      pool,
      "insert into stores (country_id, name, timezone) values ($1, $2, 'UTC') returning id",
      [countryId, `Пиццерия-главной-${label}`],
    );
    const stationId = await one(
      pool,
      "insert into stations (store_id, name, code) values ($1, $2, $3) returning id",
      [storeId, `Кухня-${label}`, stationCode()],
    );
    const emptyStationName = `Касса-без-чек-листа-${label}`;
    await pool.query(
      "insert into stations (store_id, name, code) values ($1, $2, $3)",
      [storeId, emptyStationName, stationCode()],
    );
    const checklistTitle = `Чек-лист-главной-${label}`;
    const checklistId = await one(
      pool,
      `insert into checklists (station_id, title, window_start, window_end, tenant_id)
       values ($1, $2, '00:00', '23:59', (select id from tenants where kind = 'hq')) returning id`,
      [stationId, JSON.stringify({ ru: checklistTitle, en: checklistTitle })],
    );
    const versionId = await one(
      pool,
      `insert into checklist_versions
         (checklist_id, version_number, status, station_id, sections, published_at)
       values ($1, 1, 'published', $2, '[]', now()) returning id`,
      [checklistId, stationId],
    );
    const submissionId = await one(
      pool,
      `insert into submissions (version_id, station_id, snapshot, answers, started_at)
       values ($1, $2, '[]', '[]', now()) returning id`,
      [versionId, stationId],
    );
    return {
      login,
      checklistId,
      checklistTitle,
      submissionId,
      emptyStationName,
    };
  } finally {
    await pool.end();
  }
}

async function seedEmptyPartner(): Promise<string> {
  const pool = new Pool({ connectionString: e2eDatabaseUrl() });
  try {
    return (await seedPartner(pool, randomUUID().slice(0, 8))).login;
  } finally {
    await pool.end();
  }
}

async function signInAs(
  page: Page,
  login: string,
  password: string,
): Promise<void> {
  await page.goto("/admin/login");
  await page.locator('input[name="login"]').fill(login);
  await page.locator('input[name="password"]').fill(password);
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("admin-home")).toBeVisible();
}

/** Возврат тем же путём, каким пришёл человек: раздел обязан вести назад на главную. */
async function backHome(page: Page): Promise<void> {
  await page.goBack();
  await expect(page.getByTestId("admin-home")).toBeVisible();
}

test.describe("главная кабинета — работа вошедшего", () => {
  // Подписи проверяются по-русски, значит и язык страницы задаётся явно: по умолчанию у
  // прогона он английский.
  test.use({ locale: "ru-RU" });

  test("каждая строка главной приводит туда, куда зовёт", async ({ page }) => {
    const world = await seedWorkingPartner();
    await signInAs(page, world.login, PASSWORD);
    const home = page.getByTestId("admin-home");

    // Призыва «с нуля» нет: чек-лист у партнёра есть, и два первых шага не спорят.
    await expect(home.getByTestId("home-from-template")).toHaveCount(0);

    // Дырка первой строкой, и её ссылка открывает «Станции» уже отфильтрованными.
    await expect(home.getByTestId("home-gap")).toBeVisible();
    await home.getByTestId("home-gap-link").click();
    await expect(page).toHaveURL(/\/admin\/stations\?gap=noChecklist$/);
    await expect(
      page.getByTestId("master-rail").getByText(world.emptyStationName),
    ).toBeVisible();
    await backHome(page);

    // Свой чек-лист — строкой, и она открывает его редактор.
    await home
      .getByTestId("home-checklists")
      .getByRole("link", { name: new RegExp(world.checklistTitle) })
      .click();
    await expect(page).toHaveURL(
      new RegExp(`/admin/checklists/${world.checklistId}$`),
    );
    await backHome(page);

    // Заполнение на его станции — строкой, и она открывает карточку заполнения.
    await home
      .getByTestId("home-submissions")
      .getByRole("link", { name: new RegExp(world.checklistTitle) })
      .click();
    await expect(page).toHaveURL(
      new RegExp(`/admin/feed/${world.submissionId}$`),
    );
    await backHome(page);
  });

  test("без чек-листов — один призыв, и он ведёт в «Шаблоны»", async ({
    page,
  }) => {
    const login = await seedEmptyPartner();
    await signInAs(page, login, PASSWORD);
    const home = page.getByTestId("admin-home");

    await expect(home.getByTestId("home-gap")).toHaveCount(0);
    await expect(home.getByTestId("home-checklists")).toHaveCount(0);
    await expect(home.getByTestId("home-submissions")).toHaveCount(0);

    await home.getByTestId("home-from-template").click();
    await expect(page).toHaveURL(/\/admin\/templates$/);
    await expect(page.getByTestId("templates-screen")).toBeVisible();
  });

  test("из главной меню ведёт в каждый раздел, а выйти по-прежнему можно", async ({
    page,
  }) => {
    await signInAs(page, "admin", E2E_ADMIN_PASSWORD);

    // Карточек разделов на главной больше нет — путь в раздел теперь меню (#11 остаётся
    // закрытым им, а не главной).
    const menu = page.locator("nav.sidenav");
    for (const key of Object.keys(ADMIN_SECTIONS) as AdminSectionKey[]) {
      if (ADMIN_REDIRECTED_SECTIONS.includes(key)) continue;
      await expect(
        menu.locator(`a[href="${ADMIN_SECTIONS[key].path}"]`),
        `в меню главной нет ссылки на раздел «${key}»`,
      ).toHaveCount(1);
    }

    await page.getByTestId("sign-out").click();
    await expect(page.getByTestId("login-submit")).toBeVisible();
  });
});
