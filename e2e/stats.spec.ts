// Сквозной сценарий раздела «Статистика» (D179, состав D170): управляющий выбирает
// страну слева, видит плитку пиццерии со статусом на сегодня, проваливается в неё и
// видит все её чек-листы со статистикой и статусом, сводку за 7 дней, переключает
// период на 30 и видит станцию, молчащую дольше суток. Сами числа сверяют тесты ядра
// (`src/blocks/feed/stats*.test.ts`, `today-*.test.ts`); здесь — что они доезжают до
// экрана, что старый адрес статистики ведёт в раздел и что экран не уезжает вбок на
// телефоне.
import { randomUUID } from "node:crypto";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
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
  readonly countryId: string;
  readonly storeId: string;
  readonly storeName: string;
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
    // Провал — только что: тревога «провален критичный» живёт в местных сутках, и
    // «два часа назад» в первые часы суток UTC попадало бы во вчера.
    await fill(0, false);
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

    return {
      label,
      countryId: kitchen.countryId,
      storeId: kitchen.storeId,
      storeName: kitchen.storeName,
      silentStation,
    };
  } finally {
    await pool.end();
  }
}

/** Нарушения axe вместе с элементом: по голому id не понять, что чинить. */
async function axeViolations(page: Page): Promise<string[]> {
  const axe = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(axe.passes.length, "axe ничего не проверил").toBeGreaterThan(0);
  return axe.violations.map(
    (violation) =>
      `${violation.id} → ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`,
  );
}

/** Пара дат периода в адресе экрана. */
const DATES_IN_URL = /from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}/;

function periodOf(url: string): { from: string; to: string } {
  const params = new URL(url).searchParams;
  return { from: params.get("from") ?? "", to: params.get("to") ?? "" };
}

/** Местная дата со сдвигом на целые сутки — по календарю. */
function shiftDate(date: string, days: number): string {
  const at = new Date(`${date}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

async function pageWidth(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth);
}

test.describe("раздел «Статистика» (D179)", () => {
  // Тексты сценария и вход — на русском: язык кабинета берётся из браузера.
  test.use({ locale: "ru-RU" });

  test("страна → плитка пиццерии → её чек-листы со статусом; период «с — по»; молчащая станция", async ({
    page,
  }) => {
    const seeded = await seed();
    await signIn(page);

    // Старый адрес «7 дней» открывается тем же отрезком, но уже парой дат (D183 п.4).
    await page.goto(`/admin/feed?country=${seeded.countryId}&days=7`);
    await expect(page.getByTestId("feed-screen")).toBeVisible();
    await expect(page).toHaveURL(DATES_IN_URL);
    const week = periodOf(page.url());
    // Отрезок кончается сегодня — вперёд листать некуда.
    // Это не ссылка, а подпись «следующий период ещё не начался».
    await expect(page.getByTestId("period-next")).not.toHaveAttribute("href");

    // Выбранная страна подсвечена в колонке слева.
    await expect(
      page
        .getByTestId("country-rail")
        .locator('[data-testid="country-row"][aria-current="page"]'),
    ).toContainText(`Страна ${seeded.label}`);

    // Плитка пиццерии: статус на сегодня и цифры за период.
    const tile = page
      .getByTestId("store-tile")
      .filter({ hasText: seeded.storeName });
    await expect(tile).toHaveCount(1);
    await expect(tile).toContainText("За период: 2 заполнения");
    // Провал газа сегодня — тревога на плитке.
    await expect(tile.getByTestId("tile-alarms")).toBeVisible();
    // Сводка страны — те же числа: в стране одна пиццерия.
    await expect(page.getByTestId("stats-submissions")).toHaveText("2");

    await tile.click();
    await expect(page.getByTestId("store-stats-screen")).toBeVisible();
    await expect(page).toHaveURL(
      new RegExp(
        `/admin/feed/stores/${seeded.storeId}\\?from=${week.from}&to=${week.to}`,
      ),
    );

    // Все чек-листы пиццерии: кухня и касса, у каждого — статус на сегодня.
    const rows = page.getByTestId("store-checklist-row");
    await expect(rows).toHaveCount(2);
    await expect(rows.getByTestId("today-status")).toHaveCount(2);
    const kitchenRow = rows.filter({
      hasText: `Открытие кухни ${seeded.label}`,
    });
    await expect(kitchenRow.getByTestId("checklist-submissions")).toHaveText(
      "2",
    );
    await expect(kitchenRow.getByTestId("checklist-critical")).toContainText(
      /50\s?%/,
    );
    // У кассы заполнений нет: статус — «открыто» или «пропущено», но не «заполнен».
    const counterRow = rows.filter({ hasText: seeded.silentStation });
    await expect(counterRow.getByTestId("today-status")).not.toHaveAttribute(
      "data-kind",
      "filled",
    );

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

    // Лента заполнений переехала сюда: два заполнения кухни за сегодня видны строками.
    await expect(page.getByTestId("store-feed")).toBeVisible();
    await expect(page.getByTestId("alarm-strip")).toBeVisible();

    // Календарь «с — по»: те же 30 дней, что раньше давала кнопка «30 дней».
    const month = { from: shiftDate(week.to, -29), to: week.to };
    await page.getByTestId("period-from").fill(month.from);
    await page.getByTestId("period-apply").click();
    await expect(page).toHaveURL(
      new RegExp(`from=${month.from}&to=${month.to}`),
    );
    await expect(page.getByTestId("stats-submissions")).toHaveText("3");
    await expect(page.getByTestId("stats-critical-share")).toHaveText(
      /33[.,]3\s?%/,
    );
    await expect(kitchenRow.getByTestId("checklist-submissions")).toHaveText(
      "3",
    );

    // Назад — к плиткам той же страны, с тем же периодом.
    await page.getByTestId("store-back").click();
    await expect(page.getByTestId("feed-screen")).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`country=${seeded.countryId}`));
    await expect(page).toHaveURL(
      new RegExp(`from=${month.from}&to=${month.to}`),
    );
  });

  test("бывший адрес статистики ведёт в раздел с той же страной и пиццерией", async ({
    page,
  }) => {
    const seeded = await seed();
    await signIn(page);

    await page.goto(`/admin/feed/stats?country=${seeded.countryId}&days=30`);
    await expect(page.getByTestId("feed-screen")).toBeVisible();
    await expect(page).toHaveURL(
      new RegExp(`/admin/feed\\?country=${seeded.countryId}&from=`),
    );
    const legacy = periodOf(page.url());
    expect(legacy.from).toBe(shiftDate(legacy.to, -29));

    await page.goto(`/admin/feed/stats?store=${seeded.storeId}`);
    await expect(page.getByTestId("store-stats-screen")).toBeVisible();
    await expect(page).toHaveURL(
      new RegExp(`/admin/feed/stores/${seeded.storeId}`),
    );
  });

  test("на телефоне страна и пиццерия не шире окна; доступность без нарушений", async ({
    page,
  }) => {
    const seeded = await seed();
    await page.setViewportSize(PHONE);
    await signIn(page);

    // Без выбранной страны на телефоне видна колонка стран, с выбранной — плитки.
    await page.goto("/admin/feed");
    await expect(page.getByTestId("country-rail")).toBeVisible();

    await page.goto(`/admin/feed?country=${seeded.countryId}`);
    await expect(page.getByTestId("store-tiles")).toBeVisible();
    await expect(page.getByTestId("country-rail")).toBeHidden();
    expect(
      await pageWidth(page),
      "экран страны уехал вбок на 375 px",
    ).toBeLessThanOrEqual(PHONE.width);
    expect(await axeViolations(page)).toEqual([]);

    await page.goto(`/admin/feed/stores/${seeded.storeId}`);
    await expect(page.getByTestId("store-stats-screen")).toBeVisible();
    expect(
      await pageWidth(page),
      "экран пиццерии уехал вбок на 375 px",
    ).toBeLessThanOrEqual(PHONE.width);

    // Доступность — на той же ширине 375 px: здесь меню свёрнуто в иконки, и именно
    // здесь ссылка-логотип теряла видимую подпись (#195).
    expect(await axeViolations(page)).toEqual([]);
  });
});
