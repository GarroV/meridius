// Будильник как пункт чек-листа (D156, T317): одна цепочка целиком — составитель
// закладывает будильник в редакторе, пункт доезжает до опубликованной версии, на
// станции он показан кнопкой «Поставить будильник» с подставленными подписью и
// временем, поставленный будильник закрывает пункт и встаёт в панель будильников
// станции рядом с ручными, а ручной будильник D070 заводится как прежде.
//
// Правила разбора и ответа закрыты тестами (`editor/validation.test.ts`,
// `fill/validation.test.ts`, `fill/answers.test.ts`); здесь то, чего они не видят:
// что поля редактора пишут разметку, а экран станции её читает и ставит будильник
// серверным действием.
import { expect, test, type Page } from "@playwright/test";

import { stationScanUrl } from "../src/blocks/qr/scan-url";
import { E2E_ADMIN_PASSWORD } from "./admin-credentials";
import { e2eDatabaseUrl } from "./database";
import { seedStationWithoutChecklist } from "./fill-fixtures";
import { E2E_PUBLIC_BASE_URL } from "./public-base-url";

/** Круглосуточное окно: значение поля `window` (`window-field.ts`). */
const ALL_DAY_WINDOW = "00:00|24:00";
const ITEM = "Поставить будильник на тесто";
const LABEL = "вынести тесто";
const DELAY_MINUTES = 5;

async function login(page: Page) {
  await page.goto("/admin/login");
  await page.getByLabel("Пароль").fill(E2E_ADMIN_PASSWORD);
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("admin-home")).toBeVisible();
}

/** Значения ответов последнего заполнения станции — то, что легло в базу. */
async function storedValues(code: string): Promise<unknown[]> {
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: e2eDatabaseUrl() });
  try {
    const { rows } = await pool.query<{ answers: { value: unknown }[] }>(
      `select s.answers from submissions s join stations st on st.id = s.station_id
        where st.code = $1 order by s.submitted_at desc limit 1`,
      [code],
    );
    return (rows[0]?.answers ?? []).map((answer) => answer.value);
  } finally {
    await pool.end();
  }
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** Местное время станции (пояс стенда — UTC) через `minutes` минут, «ЧЧ:ММ». */
function utcClockIn(minutes: number): string {
  const at = new Date(Date.now() + minutes * 60_000);
  return `${pad(at.getUTCHours())}:${pad(at.getUTCMinutes())}`;
}

test.describe("будильник как пункт чек-листа", () => {
  test.use({ locale: "ru-RU" });

  test("составитель закладывает будильник, станция ставит его одной кнопкой", async ({
    page,
    browser,
  }) => {
    await login(page);
    const station = await seedStationWithoutChecklist("будильник-пункт", "ru");
    const title = `Тесто ${String(Date.now())}`;

    // Составитель: чек-лист станции с одним пунктом-будильником «через 5 минут».
    await page.goto("/admin/checklists/new");
    await page.getByTestId("new-checklist-title").fill(title);
    await page.locator('select[name="stationId"]').selectOption({
      label: `${station.countryName} · ${station.storeName} · ${station.stationName}`,
    });
    await page.locator("#new-checklist-window").selectOption(ALL_DAY_WINDOW);
    await page.getByTestId("create-checklist").click();
    await expect(page.getByTestId("editor-screen")).toBeVisible();

    await page.getByTestId("item-title").first().fill(ITEM);
    await page.getByTestId("item-type").first().selectOption("alarm");
    await page.getByTestId("item-alarm-label").fill(LABEL);
    await page.getByTestId("item-alarm-after").fill(String(DELAY_MINUTES));
    await page.getByTestId("publish").click();
    await expect(page.getByTestId("editor-published")).toContainText("1");

    // Пункт пережил публикацию: перезагруженный редактор показывает те же поля.
    await page.reload();
    await expect(page.getByTestId("item-type").first()).toHaveValue("alarm");
    await expect(page.getByTestId("item-alarm-label")).toHaveValue(LABEL);
    await expect(page.getByTestId("item-alarm-after")).toHaveValue(
      String(DELAY_MINUTES),
    );

    // Станция: вместо галочки — кнопка с подставленными подписью и временем.
    const kitchen = await browser.newPage({ locale: "ru-RU" });
    await kitchen.goto(
      new URL(stationScanUrl(E2E_PUBLIC_BASE_URL, station.code)).pathname,
    );
    const alarmItem = kitchen.getByTestId("fill-alarm");
    await expect(alarmItem).toBeVisible();
    await expect(kitchen.getByTestId("fill-alarm-label")).toHaveValue(LABEL);
    const suggested = await kitchen.getByTestId("fill-alarm-time").inputValue();
    // Серверное «сейчас» + 5 минут; минута на границе счёта допускается.
    expect([
      utcClockIn(DELAY_MINUTES - 1),
      utcClockIn(DELAY_MINUTES),
    ]).toContain(suggested);
    await expect(kitchen.getByTestId("fill-submit")).toBeDisabled();

    await kitchen.getByTestId("fill-alarm-set-button").click();

    await expect(kitchen.getByTestId("fill-alarm-set")).toContainText(
      suggested,
    );
    const panel = kitchen.getByTestId("alarms-panel");
    await expect(panel).toContainText(LABEL);
    await expect(panel).toContainText(suggested);

    // Ручной будильник D070 заводится как прежде, рядом с заложенным.
    const manual = `ручной ${String(Date.now())}`;
    await kitchen.getByTestId("alarm-time").fill(utcClockIn(DELAY_MINUTES + 5));
    await kitchen.getByTestId("alarm-label").fill(manual);
    await kitchen.getByTestId("alarm-add").click();
    await expect(panel).toContainText(manual);
    await expect(panel).toContainText(LABEL);

    // Пункт закрыт будильником — чек-лист отправляется, в ответе время будильника.
    await kitchen.getByTestId("fill-submit").click();
    await expect(kitchen.getByTestId("fill-sent")).toBeVisible();
    expect(await storedValues(station.code)).toStrictEqual([suggested]);
    await kitchen.close();
  });
});
