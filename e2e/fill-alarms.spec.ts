import { expect, test, type Page } from "@playwright/test";

import { stationScanUrl } from "../src/blocks/qr/scan-url";
import { e2eDatabaseUrl } from "./database";
import { seedFillStand } from "./fill-fixtures";
import { E2E_PUBLIC_BASE_URL } from "./public-base-url";

/**
 * Будильники станции на экране заполнения `/s/<код>` (D070, T139): сотрудник вручную
 * вносит время и подпись — заводит записку под рукой, — а прозвонивший будильник снимает
 * кнопкой «Понятно». Сценарий в настоящем браузере, потому что проверяется ровно то, чего
 * модульные тесты `alarms.test.ts` не видят: что панель дошла до экрана, что запись уходит
 * серверным действием, и что будильник переживает перезагрузку планшета — ради этого он и
 * хранится строкой в базе, а не во вкладке.
 */

const PHONE = { width: 375, height: 760 } as const;

/** Путь из напечатанной наклейки. Маршрут обязан совпасть с тем, что печатает блок `qr`. */
function stickerPath(code: string): string {
  return new URL(stationScanUrl(E2E_PUBLIC_BASE_URL, code)).pathname;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function clock(totalMinutes: number): string {
  const bounded = Math.min(Math.max(totalMinutes, 0), 23 * 60 + 59);
  return `${pad(Math.floor(bounded / 60))}:${pad(bounded % 60)}`;
}

/**
 * Местное время станции с запасом в будущее, «ЧЧ:ММ». Часовой пояс станций сценария —
 * UTC (его ставит `seedFillStand`), поэтому местное время станции равно UTC-времени
 * прогона, и считать его можно прямо из `Date`, не поднимая второй календарь.
 *
 * Результат прижат к 23:59: без этого прогон в последние минуты суток перескакивал бы
 * на завтра, а поле принимает только «сегодня» — это не обход, а та же граница, что и
 * у ночной смены в самом продукте (D070).
 */
function futureLocalTime(now: Date, marginMinutes: number): string {
  return clock(now.getUTCHours() * 60 + now.getUTCMinutes() + marginMinutes);
}

/** Местное время станции, которое сегодня уже прошло. */
function pastLocalTime(now: Date, marginMinutes: number): string {
  return clock(now.getUTCHours() * 60 + now.getUTCMinutes() - marginMinutes);
}

/**
 * Заводит уже прозвонивший будильник напрямую в базе — это и есть перезагрузка планшета,
 * ради которой будильник хранится строкой, а не во вкладке: сотрудник его не видел, потому
 * что экран не был открыт, а не потому что он не наступил.
 */
async function seedRungAlarm(
  stationId: string,
  label: string,
): Promise<string> {
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: e2eDatabaseUrl() });
  try {
    const { rows } = await pool.query<{ id: string }>(
      `insert into alarms (station_id, local_date, at, label)
       values ($1, (now() at time zone 'UTC')::date, now() - interval '2 minutes', $2)
       returning id`,
      [stationId, label],
    );
    const id = rows[0]?.id;
    if (id === undefined) throw new Error("Будильник для сценария не завёлся");
    return id;
  } finally {
    await pool.end();
  }
}

/** Все строки будильников панели (обычные и звонящие плашки), кроме плашки отказа. */
function alarmRows(page: Page, label?: string) {
  const rows = page
    .getByTestId("alarms-panel")
    .locator('div[data-testid^="alarm-"]:not([data-testid="alarm-notice"])');
  return label === undefined ? rows : rows.filter({ hasText: label });
}

async function addAlarm(page: Page, time: string, label: string): Promise<void> {
  await page.getByTestId("alarm-time").fill(time);
  await page.getByTestId("alarm-label").fill(label);
  await page.getByTestId("alarm-add").tap();
}

test.describe("будильники станции", () => {
  // Русская речь панели: подписи и отказы, которые проверяют сценарии, — по-русски.
  test.use({
    viewport: PHONE,
    hasTouch: true,
    isMobile: true,
    locale: "ru-RU",
  });

  test("заведение: время позже текущего и подпись дают строку в списке", async ({
    page,
  }) => {
    const stand = await seedFillStand("будильник-завести");
    await page.goto(stickerPath(stand.code));

    const time = futureLocalTime(new Date(), 5);
    const label = "вынести тесто";

    await addAlarm(page, time, label);

    const row = alarmRows(page, label);
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(time);
    await expect(page.getByTestId("alarm-notice")).toHaveCount(0);
  });

  test("прошедшее время отбивается вслух, строка не заводится", async ({
    page,
  }) => {
    const stand = await seedFillStand("будильник-прошлое");
    await page.goto(stickerPath(stand.code));

    const time = pastLocalTime(new Date(), 5);
    await addAlarm(page, time, "опоздавший будильник");

    await expect(page.getByTestId("alarm-notice")).toBeVisible();
    await expect(alarmRows(page)).toHaveCount(0);
  });

  test("крестик снимает будильник: строк становится на одну меньше", async ({
    page,
  }) => {
    const stand = await seedFillStand("будильник-снять");
    await page.goto(stickerPath(stand.code));

    const now = new Date();
    const keepLabel = "не трогать";
    const dropLabel = "снять меня";
    await addAlarm(page, futureLocalTime(now, 5), keepLabel);
    // Первому надо осесть (сброс полей и пересчёт списка идут асинхронно), иначе
    // второй заводится в гонке с ним и находит поля уже стёртыми чужим ответом.
    await expect(alarmRows(page, keepLabel)).toHaveCount(1);
    await addAlarm(page, futureLocalTime(now, 7), dropLabel);

    await expect(alarmRows(page)).toHaveCount(2);

    const dropRow = alarmRows(page, dropLabel);
    await dropRow.locator('[data-testid^="alarm-drop-"]').tap();

    await expect(alarmRows(page)).toHaveCount(1);
    await expect(alarmRows(page, dropLabel)).toHaveCount(0);
    await expect(alarmRows(page, keepLabel)).toHaveCount(1);
  });

  test("будильник переживает перезагрузку планшета: звонит на свежем открытии экрана", async ({
    page,
  }) => {
    const stand = await seedFillStand("будильник-перезагрузка");
    const label = "уже наступивший";
    const alarmId = await seedRungAlarm(stand.stationId, label);

    // Планшет открывает экран заново — ровно так выглядит его перезагрузка посреди смены.
    await page.goto(stickerPath(stand.code));

    const ringing = page.getByTestId(`alarm-ringing-${alarmId}`);
    await expect(ringing).toBeVisible();
    await expect(ringing).toContainText(label);
    // Он же остаётся обычной строкой списка, пока его не подтвердили.
    await expect(page.getByTestId(`alarm-${alarmId}`)).toBeVisible();

    await page.getByTestId(`alarm-ack-${alarmId}`).tap();

    await expect(ringing).toHaveCount(0);
    await expect(page.getByTestId(`alarm-${alarmId}`)).toHaveCount(0);
  });

  test("на станции видны только её будильники: соседняя не подмешивается", async ({
    page,
  }) => {
    const mine = await seedFillStand("будильник-своя");
    const neighbour = await seedFillStand("будильник-соседняя");
    const label = "чужая записка";

    await page.goto(stickerPath(neighbour.code));
    await addAlarm(page, futureLocalTime(new Date(), 5), label);
    await expect(alarmRows(page, label)).toHaveCount(1);

    await page.goto(stickerPath(mine.code));
    await expect(alarmRows(page)).toHaveCount(0);
    await expect(alarmRows(page, label)).toHaveCount(0);
  });
});
