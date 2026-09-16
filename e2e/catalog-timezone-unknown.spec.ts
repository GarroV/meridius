// Пиццерия со сломанным часовым поясом в карточке справочника (issue про D026/T062).
//
// Пиццерию можно завести в базе с зоной, которую не признаёт сам PostgreSQL (сид,
// миграция или код мимо справочника пишут её напрямую). Сейчас карточка об этом молчит:
// `<select>` без совпадающего пункта не показывает пусто — он молча подставляет первую
// зону по алфавиту, и методист либо не замечает беды вовсе, либо жмёт «Сохранить» и
// тем самым тихо подменяет сломанный пояс на другой, но тоже неверный. Обе ветки —
// тот же класс дефекта, что и disabled-контрол в T117: экран не говорит правду о
// состоянии пиццерии.
//
// Проверка держит три вещи: (A) карточка честно называет сломанный пояс вслух и не
// даёт по ошибке выбрать его снова; (B) «Сохранить» без выбора зоны отказывает, а не
// тихо сохраняет случайную зону, и путь починки (выбрать настоящую зону и сохранить)
// рабочий; (C) то же самое видно и на английском экране — двуязычность не факультативна.
//
// Сценарий заведомо красный: `data-testid="store-timezone-unknown"` в карточке ещё не
// существует. Это ожидаемый результат задачи, а не брак — сначала красный прогон,
// потом реализация.
import { randomUUID } from "node:crypto";

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { Pool } from "pg";

import { E2E_ADMIN_PASSWORD } from "./admin-credentials";
import { e2eDatabaseUrl } from "./database";

const CATALOG_PATH = "/admin/catalog";

/** Зона, которой PostgreSQL не знает, — опечатка одной буквой в настоящей `Asia/Almaty`. */
const BROKEN_TIMEZONE = "Asia/Almatyy";
const REAL_TIMEZONE = "Asia/Almaty";

interface BrokenStore {
  storeId: string;
  storeName: string;
  countryName: string;
}

/**
 * Пиццерия со сломанным поясом прямо в базе — тем же способом, каким её мог завести
 * сид, миграция или код мимо справочника. Заводится локально, а не через общую
 * `seedStore` из `station-fixtures.ts`: там пояс жёстко исправный, а этому сценарию
 * нужен именно битый.
 */
async function seedBrokenStore(): Promise<BrokenStore> {
  const label = randomUUID().slice(0, 8);
  const pool = new Pool({ connectionString: e2eDatabaseUrl() });
  try {
    const country = await pool.query<{ id: string }>(
      "insert into countries (name, locale) values ($1, 'ru') returning id",
      [`Страна ${label}`],
    );
    const countryId = country.rows[0]?.id;
    const store = await pool.query<{ id: string }>(
      "insert into stores (country_id, name, timezone) values ($1, $2, $3) returning id",
      [countryId, `Пиццерия ${label}`, BROKEN_TIMEZONE],
    );
    const storeId = store.rows[0]?.id;
    if (storeId === undefined)
      throw new Error("Пиццерия для сценария не завелась");

    return {
      storeId,
      storeName: `Пиццерия ${label}`,
      countryName: `Страна ${label}`,
    };
  } finally {
    await pool.end();
  }
}

async function signIn(page: Page): Promise<void> {
  await page.goto("/admin/login");
  // Не по подписи поля: она переводится, а английский сценарий этого же файла
  // проверяет тот же экран на другом языке.
  await page.locator('input[name="password"]').fill(E2E_ADMIN_PASSWORD);
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("admin-home")).toBeVisible();
}

// Доходит до карточки пиццерии кликами по дереву — тем же путём, что и методист.
async function openStore(page: Page, store: BrokenStore): Promise<void> {
  await page.goto(CATALOG_PATH);
  await page
    .getByTestId("country-item")
    .filter({ hasText: store.countryName })
    .click();
  await expect(page).toHaveURL(/[?&]country=/);

  await page
    .getByTestId("store-item")
    .filter({ hasText: store.storeName })
    .click();
  await expect(page).toHaveURL(new RegExp(`[?&]store=${store.storeId}\\b`));
}

test.describe("карточка пиццерии: сломанный часовой пояс", () => {
  test.describe("русский браузер", () => {
    test.use({ locale: "ru-RU" });

    test("карточка называет сломанный пояс вслух и не даёт выбрать его снова", async ({
      page,
    }) => {
      const store = await seedBrokenStore();
      await signIn(page);
      await openStore(page, store);

      const notice = page.getByTestId("store-timezone-unknown");
      await expect(notice).toBeVisible();
      // Сломанное значение названо вслух, а не спрятано за общей фразой.
      await expect(notice).toContainText(BROKEN_TIMEZONE);

      const select = page.locator("#store-timezone");
      // Список не подставляет чужую зону вместо честного «не выбрано».
      await expect(select).toHaveValue("");
      const brokenOption = select.locator(`option[value="${BROKEN_TIMEZONE}"]`);
      await expect(brokenOption).toHaveCount(0);
    });

    test("«Сохранить» без выбора зоны отказывает, а выбор настоящей зоны чинит карточку", async ({
      page,
    }) => {
      const store = await seedBrokenStore();
      await signIn(page);
      await openStore(page, store);

      // Сохранить, ничего не выбирая в списке зон.
      await page.locator('button[form="store-edit-form"]').click();

      const error = page.getByTestId("catalog-error");
      await expect(error).toBeVisible();
      await expect(error).toHaveText("Такой часовой пояс базе неизвестен");
      // Пиццерия по-прежнему помечена сломанной — отказ не потерял состояние.
      await expect(page.getByTestId("store-timezone-unknown")).toBeVisible();

      // Путь починки: выбрать настоящую зону и сохранить.
      await page.locator("#store-timezone").selectOption(REAL_TIMEZONE);
      await page.locator('button[form="store-edit-form"]').click();

      await expect(page.getByTestId("catalog-error")).toHaveCount(0);
      await expect(page.getByTestId("store-timezone-unknown")).toHaveCount(0);
      await expect(page.locator("#store-timezone")).toHaveValue(REAL_TIMEZONE);
    });
  });

  test.describe("английский браузер", () => {
    test.use({ locale: "en-US" });

    test("тот же отказ виден на английском экране", async ({ page }) => {
      // Своя пиццерия: сценарии идут параллельно, общее состояние между ними не годится.
      const store = await seedBrokenStore();
      await signIn(page);
      await openStore(page, store);

      const notice = page.getByTestId("store-timezone-unknown");
      await expect(notice).toBeVisible();
      await expect(notice).toContainText(BROKEN_TIMEZONE);
      await expect(notice).toContainText("does not know the zone");

      const text = await notice.textContent();
      expect(text ?? "").not.toContain("База не знает");
    });
  });

  test.describe("доступность нового состояния", () => {
    test.use({ locale: "ru-RU" });

    // Общий прогон доступности (`a11y.spec.ts`) открывает справочник с ИСПРАВНОЙ
    // пиццерией, то есть этого состояния карточки не видит вовсе. А состояние не
    // косметическое: список помечен `aria-invalid`, причина привязана к нему
    // `aria-describedby` — без проверки легко оставить ссылку на несуществующий id,
    // и тогда диктор прочитает список как исправный.
    test("карточка со сломанным поясом не заводит нарушений доступности", async ({
      page,
    }) => {
      const store = await seedBrokenStore();
      await signIn(page);
      await openStore(page, store);
      await expect(page.getByTestId("store-timezone-unknown")).toBeVisible();

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();

      expect(
        results.violations.map(
          (violation) =>
            `${violation.id}: ${violation.help} → ${violation.nodes
              .map((node) => node.target.join(" "))
              .join(", ")}`,
        ),
      ).toStrictEqual([]);
      // Пустой прогон (страница не догрузилась) не должен выглядеть пройденным.
      expect(results.passes.length).toBeGreaterThan(0);

      // Причина указывает на существующий элемент, а не в пустоту.
      const describedBy = await page
        .locator("#store-timezone")
        .getAttribute("aria-describedby");
      expect(describedBy).not.toBeNull();
      await expect(page.locator(`#${describedBy ?? ""}`)).toHaveCount(1);
    });
  });
});
