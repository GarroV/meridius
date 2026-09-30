// Сквозной сценарий статистики (D150, D170): управляющий уходит из ленты пиццерии в
// статистику с тем же выбором, видит числа за 7 дней, переключает период на 30 и
// видит станцию, молчащую дольше суток. Сами числа сверяет тест ядра
// (`src/blocks/feed/stats.test.ts`); здесь — что они доезжают до экрана и что экран
// не уезжает вбок на телефоне.
import { randomUUID } from "node:crypto";

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { Pool } from "pg";

import { e2eDatabaseUrl } from "./database";
import { PHONE, seedKitchenChecklist, signIn } from "./feed-fixtures";

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

function sectionsOf(label: string) {
  return [
    {
      id: "section-open",
      title: { ru: "Открытие", en: "Opening" },
      source: "own",
      items: [
        {
          id: `gas-${label}`,
          title: { ru: `Газ перекрыт ${label}`, en: `Gas off ${label}` },
          type: "bool",
          severity: "critical",
        },
        {
          id: `tables-${label}`,
          title: { ru: `Столы протёрты ${label}`, en: `Tables ${label}` },
          type: "bool",
          severity: "normal",
        },
      ],
    },
  ];
}

interface Seeded {
  readonly label: string;
  readonly storeId: string;
  readonly silentStation: string;
}

/**
 * Пиццерия с двумя станциями. «Кухня»: два заполнения за последние сутки, в одном
 * провален газ — 50 %. «Касса»: чек-лист вышел три дня назад, заполнений нет — молчит.
 * И одно заполнение двадцатидневной давности: видно только за 30 дней.
 */
async function seed(): Promise<Seeded> {
  const label = randomUUID().slice(0, 8);
  const sections = sectionsOf(label);
  const pool = new Pool({ connectionString: e2eDatabaseUrl() });
  try {
    const kitchen = await seedKitchenChecklist(
      pool,
      label,
      `st${label}`.slice(0, 10),
      sections,
      " · статистика",
    );
    const fill = async (hoursAgo: number, gas: boolean): Promise<void> => {
      await pool.query(
        `insert into submissions
           (version_id, station_id, snapshot, answers, started_at, submitted_at)
         values ($1, $2, $3, $4,
           now() - make_interval(hours => $5) - interval '5 minutes',
           now() - make_interval(hours => $5))`,
        [
          kitchen.versionId,
          kitchen.stationId,
          JSON.stringify(sections),
          JSON.stringify([
            { itemId: `gas-${label}`, value: gas, at: 0 },
            { itemId: `tables-${label}`, value: true, at: 0 },
          ]),
          hoursAgo,
        ],
      );
    };
    await fill(2, false);
    await fill(5, true);
    await fill(20 * 24, true);

    const silentStation = `Касса ${label}`;
    const counter = await pool.query<{ id: string }>(
      "insert into stations (store_id, name, code) values ($1, $2, $3) returning id",
      [kitchen.storeId, silentStation, `ss${label}`.slice(0, 10)],
    );
    const checklist = await pool.query<{ id: string }>(
      `insert into checklists (station_id, title, window_start, window_end, tenant_id)
       values ($1, $2, '00:00', '23:59', (select id from tenants where kind = 'hq'))
       returning id`,
      [counter.rows[0]?.id, JSON.stringify({ ru: `Касса ${label}` })],
    );
    await pool.query(
      `insert into checklist_versions
         (checklist_id, version_number, status, station_id, sections, published_at)
       values ($1, 1, 'published', $2, $3, now() - interval '3 days')`,
      [checklist.rows[0]?.id, counter.rows[0]?.id, JSON.stringify(sections)],
    );

    return { label, storeId: kitchen.storeId, silentStation };
  } finally {
    await pool.end();
  }
}

test.describe("статистика по пиццерии (D150)", () => {
  // Тексты сценария и вход — на русском: язык кабинета берётся из браузера.
  test.use({ locale: "ru-RU" });

  test("из ленты — в статистику с тем же выбором; 7 и 30 дней; молчащая станция", async ({
    page,
  }) => {
    const seeded = await seed();
    await signIn(page);

    await page.goto(`/admin/feed?store=${seeded.storeId}`);
    await page.getByTestId("feed-stats-link").click();

    await expect(page.getByTestId("stats-screen")).toBeVisible();
    expect(page.url()).toContain(`store=${seeded.storeId}`);
    await expect(page.getByTestId("stats-lead")).toBeVisible();
    await expect(page.getByTestId("stats-submissions")).toHaveText("2");
    await expect(page.getByTestId("stats-critical-share")).toHaveText(/50\s?%/);

    const top = page.getByTestId("stats-top-row");
    await expect(top).toHaveCount(1);
    await expect(top.first()).toContainText(`Газ перекрыт ${seeded.label}`);
    await expect(page.getByTestId("stats-top-failures").first()).toHaveText(
      "1",
    );

    const silent = page.getByTestId("stats-silent-row");
    await expect(silent).toHaveCount(1);
    await expect(silent.first()).toContainText(seeded.silentStation);
    await expect(page.getByTestId("stats-silent")).toHaveText("1");

    const period = page.locator("#feed-filter-days");
    await expect(period).toHaveAttribute("data-live", "true");
    await period.selectOption("30");
    await expect(page).toHaveURL(/days=30/);
    await expect(page.getByTestId("stats-submissions")).toHaveText("3");
    await expect(page.getByTestId("stats-critical-share")).toHaveText(
      /33[.,]3\s?%/,
    );

    await page.getByTestId("stats-feed-link").click();
    await expect(page.getByTestId("feed-screen")).toBeVisible();
    expect(page.url()).toContain(`store=${seeded.storeId}`);
  });

  test("на телефоне страница не шире окна; доступность без нарушений", async ({
    page,
  }) => {
    const seeded = await seed();
    await page.setViewportSize(PHONE);
    await signIn(page);

    await page.goto(`/admin/feed/stats?store=${seeded.storeId}`);
    await expect(page.getByTestId("stats-screen")).toBeVisible();

    const width = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    expect(
      width,
      "страница статистики уехала вбок на 375 px",
    ).toBeLessThanOrEqual(PHONE.width);

    // Доступность — на той же ширине 375 px: здесь меню свёрнуто в иконки, и именно
    // здесь ссылка-логотип теряла видимую подпись (#195).
    const axe = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    // Нарушение называется вместе с элементом: по голому id не понять, что чинить.
    expect(
      axe.violations.map(
        (violation) =>
          `${violation.id} → ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`,
      ),
    ).toEqual([]);
    expect(axe.passes.length, "axe ничего не проверил").toBeGreaterThan(0);
  });
});
