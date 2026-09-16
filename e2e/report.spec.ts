// Сквозной сценарий отчёта об обходах: управляющий уходит из ленты в отчёт с теми же
// фильтрами и видит сетку «пункты × часы обхода» с пропусками.
//
// Вторая проверка здесь не про данные, а про ширину: таблица заведомо шире телефона,
// и она обязана скроллиться ВНУТРИ своего контейнера. Уехавшая вбок страница ломает
// не таблицу, а весь экран — шапку, фильтры и навигацию, — и увидеть это можно только
// в настоящем браузере на настоящей ширине.
import { randomUUID } from "node:crypto";

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { AxeResults } from "axe-core";
import { Pool } from "pg";

import { E2E_ADMIN_PASSWORD } from "./admin-credentials";
import { e2eDatabaseUrl } from "./database";

const FEED_PATH = "/admin/feed";
const REPORT_PATH = "/admin/feed/report";
const PHONE = { width: 375, height: 800 };
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

/**
 * Окно на целые сутки, обход раз в восемь часов: проходы в 00:00, 08:00 и 16:00.
 *
 * Сутки целиком — нарочно: узкое окно делало бы сценарий зависимым от часа прогона,
 * и ночью «пропусков нет» выглядело бы поломкой.
 */
const SECTIONS = [
  {
    id: "section-line",
    title: { ru: "Линия раздачи", en: "Toppings line" },
    source: "own",
    items: [
      {
        id: "item-line",
        title: { ru: "Проверить линию раздачи", en: "Check the line" },
        type: "bool",
        severity: "critical",
        schedule: [{ from: "00:00", to: "23:59", everyMinutes: 480 }],
      },
      {
        id: "item-tables",
        title: { ru: "Столы протёрты", en: "Tables wiped" },
        type: "bool",
        severity: "normal",
      },
    ],
  },
];

interface Seeded {
  readonly storeName: string;
  readonly stationName: string;
  readonly stationId: string;
}

/**
 * Данные сценария кладутся прямо в базу: сценарий проверяет отчёт, и падение в чужом
 * блоке искали бы не там. Названия уникальны на прогон — файлы сценариев идут
 * параллельно.
 */
async function seed(): Promise<Seeded> {
  const label = randomUUID().slice(0, 8);
  const pool = new Pool({ connectionString: e2eDatabaseUrl() });

  try {
    const country = await pool.query<{ id: string }>(
      "insert into countries (name, locale) values ($1, 'ru') returning id",
      [`Страна ${label}`],
    );
    const store = await pool.query<{ id: string }>(
      "insert into stores (country_id, name, timezone) values ($1, $2, 'UTC') returning id",
      [country.rows[0]?.id, `Пиццерия ${label}`],
    );
    const storeId = store.rows[0]?.id;
    const storeName = `Пиццерия ${label}`;

    const stationName = `Кухня ${label}`;
    const station = await pool.query<{ id: string }>(
      "insert into stations (store_id, name, code) values ($1, $2, $3) returning id",
      [storeId, stationName, `r${label}k`],
    );
    const stationId = station.rows[0]?.id ?? "";

    const checklist = await pool.query<{ id: string }>(
      `insert into checklists (station_id, title, window_start, window_end)
       values ($1, $2, '00:00', '23:59') returning id`,
      [
        stationId,
        JSON.stringify({
          ru: `Обходы кухни ${label}`,
          en: `Kitchen rounds ${label}`,
        }),
      ],
    );
    const checklistId = checklist.rows[0]?.id ?? "";

    // Версия опубликована вчера: в период тогда попадают ровно двое суток — вчера
    // и сегодня. Три дня назад клетка полуночного обхода была бы «пропущено» даже при
    // сделанном обходе, и это верно (пропуск в клетке сильнее сделанного), но сценарию
    // нужны обе клетки сразу.
    const version = await pool.query<{ id: string }>(
      `insert into checklist_versions
         (checklist_id, version_number, status, station_id, sections, published_at)
       values ($1, 1, 'published', $2, $3, now() - interval '1 day') returning id`,
      [checklistId, stationId, JSON.stringify(SECTIONS)],
    );
    const versionId = version.rows[0]?.id ?? "";

    // Полуночный обход отмечен и вчера, и сегодня: его клетка тогда «сделано» при
    // любом часе прогона. Восьми- и шестнадцатичасовой вчера не сделаны — они и есть
    // пропуски, которые отчёт обязан показать.
    for (const day of ["current_date - 1", "current_date"]) {
      await pool.query(
        `insert into checks (station_id, version_id, item_id, local_date, interval_start, value)
         values ($1, $2, 'item-line', ${day}, 0, 'true'::jsonb)`,
        [stationId, versionId],
      );
    }

    return { storeName, stationName, stationId };
  } finally {
    await pool.end();
  }
}

/**
 * Проверка доступности живёт здесь, а не в общем `a11y.spec.ts`: туда в одну волну
 * пишут несколько блоков сразу, и общий файл — первое место, где они сталкиваются.
 *
 * Обе проверки нужны вместе: список нарушений читаемый (иначе по красному сценарию
 * не понять, что чинить), и axe действительно что-то проверил — пустой прогон
 * неотличим от пройденного.
 */
function expectAccessible(results: AxeResults): void {
  expect(
    results.violations.map(
      (violation) =>
        `${violation.id}: ${violation.help} → ${violation.nodes
          .map((node) => node.target.join(" "))
          .join(", ")}`,
    ),
  ).toEqual([]);
  expect(results.passes.length).toBeGreaterThan(0);
}

async function signIn(page: Page): Promise<void> {
  await page.goto("/admin/login");
  await page.getByLabel("Пароль").fill(E2E_ADMIN_PASSWORD);
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("admin-home")).toBeVisible();
}

test.describe("отчёт об обходах", () => {
  // Эталон и тексты сценария русские, поэтому и браузер русский.
  test.use({ locale: "ru-RU" });

  test("из ленты открывается отчёт с теми же фильтрами и показывает пропуски", async ({
    page,
  }) => {
    const seeded = await seed();
    await signIn(page);

    await page.goto(`${FEED_PATH}?station=${seeded.stationId}&period=week`);
    await page.getByTestId("feed-report-link").click();

    await expect(page.getByTestId("rounds-report-screen")).toBeVisible();
    // Фильтры доехали: отчёт открылся по той же станции и тому же периоду, а не
    // «по всей сети за сегодня».
    await expect(page).toHaveURL(
      new RegExp(`station=${seeded.stationId}.*period=week`),
    );

    const table = page.getByTestId("rounds-scroller");
    await expect(table).toBeVisible();
    for (const hour of ["00:00", "08:00", "16:00"]) {
      await expect(
        table.getByRole("columnheader", { name: hour }),
      ).toBeVisible();
    }

    // Полуночный обход сделан в оба дня, восьми- и шестнадцатичасовой вчера пропущены.
    await expect(
      page.locator('[data-testid="rounds-cell"][data-kind="done"]'),
    ).not.toHaveCount(0);
    await expect(
      page.locator('[data-testid="rounds-cell"][data-kind="missed"]'),
    ).not.toHaveCount(0);

    // Пункт без расписания обходами не мерится и в сетку не попадает.
    await expect(page.getByText("Столы протёрты")).toHaveCount(0);
  });

  test("на телефоне таблица скроллится внутри себя, а не тащит страницу вбок", async ({
    page,
  }) => {
    const seeded = await seed();
    await signIn(page);

    await page.setViewportSize(PHONE);
    await page.goto(`${REPORT_PATH}?station=${seeded.stationId}&period=week`);
    await expect(page.getByTestId("rounds-scroller")).toBeVisible();

    const scroller = page.getByTestId("rounds-scroller");
    const overflow = await scroller.evaluate((node) => ({
      scrollWidth: node.scrollWidth,
      clientWidth: node.clientWidth,
    }));
    // Таблица действительно шире телефона — иначе проверка ничего не значит.
    expect(overflow.scrollWidth).toBeGreaterThan(overflow.clientWidth);

    const page_ = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    // А страница вбок не уехала: шапка, фильтры и навигация остались на месте.
    expect(page_.scrollWidth).toBe(page_.clientWidth);
  });

  test("станция без чек-листов объясняет, что завести, а не молчит", async ({
    page,
  }) => {
    const label = randomUUID().slice(0, 8);
    const pool = new Pool({ connectionString: e2eDatabaseUrl() });
    let stationId = "";
    try {
      const country = await pool.query<{ id: string }>(
        "insert into countries (name, locale) values ($1, 'ru') returning id",
        [`Страна ${label}`],
      );
      const store = await pool.query<{ id: string }>(
        "insert into stores (country_id, name, timezone) values ($1, $2, 'UTC') returning id",
        [country.rows[0]?.id, `Пиццерия ${label}`],
      );
      const station = await pool.query<{ id: string }>(
        "insert into stations (store_id, name, code) values ($1, $2, $3) returning id",
        [store.rows[0]?.id, `Кухня ${label}`, `e${label}k`],
      );
      stationId = station.rows[0]?.id ?? "";
    } finally {
      await pool.end();
    }

    await signIn(page);
    await page.goto(`${REPORT_PATH}?station=${stationId}`);

    const empty = page.getByTestId("rounds-empty");
    await expect(empty).toBeVisible();
    await expect(empty).toHaveAttribute("data-kind", "noChecklists");
  });

  test("отчёт без нарушений доступности", async ({ page }) => {
    const seeded = await seed();
    await signIn(page);

    await page.goto(`${REPORT_PATH}?station=${seeded.stationId}&period=week`);
    await page.getByTestId("rounds-report-screen").waitFor();

    expectAccessible(
      await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze(),
    );
  });
});
