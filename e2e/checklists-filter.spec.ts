// Фильтры списка чек-листов (T075): выбор страны, пиццерии и станции над таблицей.
//
// Проверяется настоящим экраном, а не вызовом функции: сужение делают три списка,
// которые применяются в момент выбора, и доказать это можно только выбором в браузере.
// Отдельно проверяется, что состояние живёт в адресе — ссылкой на «Кухню Алматы»
// делятся в чате, и она обязана открыться тем же списком.
import { expect, test, type Page } from "@playwright/test";

import { E2E_ADMIN_PASSWORD } from "./admin-credentials";
import { seedStation, type SeededStation } from "./database";

const CHECKLISTS_PATH = "/admin/checklists";

function label(): string {
  return Math.random().toString(36).slice(2, 8);
}

async function signIn(page: Page): Promise<void> {
  await page.goto("/admin/login");
  await page.getByLabel("Пароль").fill(E2E_ADMIN_PASSWORD);
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("admin-home")).toBeVisible();
}

/** Заводит чек-лист на заданной станции и возвращает его название. */
async function createChecklist(
  page: Page,
  station: SeededStation,
): Promise<string> {
  const title = `Чек-лист ${label()}`;
  await page.goto(`${CHECKLISTS_PATH}/new`);
  const form = page.getByTestId("new-checklist-form");
  await form.getByRole("textbox").fill(title);
  await form.locator("#new-checklist-station").selectOption(station.stationId);
  await page.getByTestId("create-checklist").click();
  await expect(page.getByTestId("editor-screen")).toBeVisible();
  return title;
}

function rowOf(page: Page, title: string) {
  return page.getByTestId("checklist-row").filter({ hasText: title });
}

test.describe("фильтры списка чек-листов", () => {
  test.use({ locale: "ru-RU" });

  test("выбор страны сужает список: свой чек-лист остаётся, чужой уходит", async ({
    page,
  }) => {
    await signIn(page);
    const mine = await seedStation(label());
    const other = await seedStation(label());
    const kept = await createChecklist(page, mine);
    const dropped = await createChecklist(page, other);

    // Без фильтра на экране оба: сужения ещё нет.
    await page.goto(CHECKLISTS_PATH);
    await expect(rowOf(page, kept)).toBeVisible();
    await expect(rowOf(page, dropped)).toBeVisible();

    await page
      .getByTestId("checklist-filter-country")
      .selectOption({ label: mine.countryName });

    // Список применяется в момент выбора — кнопки «Показать» на эталоне нет.
    await page.waitForURL(/country=/);
    await expect(rowOf(page, kept)).toBeVisible();
    await expect(rowOf(page, dropped)).toHaveCount(0);
  });

  test("выбор станции сужает список до её чек-листов", async ({ page }) => {
    await signIn(page);
    const station = await seedStation(label());
    const neighbour = await seedStation(label());
    const kept = await createChecklist(page, station);
    const dropped = await createChecklist(page, neighbour);

    await page.goto(CHECKLISTS_PATH);
    await page
      .getByTestId("checklist-filter-station")
      .selectOption(station.stationId);

    await page.waitForURL(/station=/);
    await expect(rowOf(page, kept)).toBeVisible();
    await expect(rowOf(page, dropped)).toHaveCount(0);
  });

  test("выбранная страна сужает и сам список пиццерий", async ({ page }) => {
    // Иначе методист выбирает пиццерию, которой в выбранной стране нет, и получает
    // заведомо пустой список без объяснения.
    await signIn(page);
    const mine = await seedStation(label());
    const other = await seedStation(label());
    await createChecklist(page, mine);
    await createChecklist(page, other);

    await page.goto(CHECKLISTS_PATH);
    const stores = page.getByTestId("checklist-filter-store");
    await expect(
      stores.getByRole("option", { name: other.storeName }),
    ).toHaveCount(1);

    await page
      .getByTestId("checklist-filter-country")
      .selectOption({ label: mine.countryName });
    await page.waitForURL(/country=/);

    await expect(
      stores.getByRole("option", { name: mine.storeName }),
    ).toHaveCount(1);
    await expect(
      stores.getByRole("option", { name: other.storeName }),
    ).toHaveCount(0);
  });

  test("пустой результат назван пустым результатом, а не отсутствием чек-листов", async ({
    page,
  }) => {
    // «Чек-листов пока нет» здесь звало бы завести новый там, где методист просто выбрал
    // не ту станцию, — и он завёл бы дубль уже существующего.
    await signIn(page);
    const empty = await seedStation(label());
    const filled = await seedStation(label());
    await createChecklist(page, filled);

    await page.goto(CHECKLISTS_PATH);
    await page
      .getByTestId("checklist-filter-station")
      .selectOption(empty.stationId);
    await page.waitForURL(/station=/);

    await expect(page.getByTestId("checklist-row")).toHaveCount(0);
    await expect(page.getByTestId("checklists-filtered-empty")).toBeVisible();

    // Возврат к полному списку — одной ссылкой, а не перебором трёх списков обратно.
    await page.getByTestId("checklists-filter-reset").click();
    await expect(page.getByTestId("checklist-row").first()).toBeVisible();
  });

  test("состояние фильтра живёт в адресе: ссылка открывается тем же списком", async ({
    page,
  }) => {
    await signIn(page);
    const mine = await seedStation(label());
    const other = await seedStation(label());
    const kept = await createChecklist(page, mine);
    const dropped = await createChecklist(page, other);

    await page.goto(`${CHECKLISTS_PATH}?station=${mine.stationId}`);

    await expect(rowOf(page, kept)).toBeVisible();
    await expect(rowOf(page, dropped)).toHaveCount(0);
    // И выбор виден в самих списках, а не только в результате. Пиццерия при этом
    // подставлена по станции: выбрав «Кухню Алматы», методист выбрал и Алматы.
    await expect(page.getByTestId("checklist-filter-station")).toHaveValue(
      mine.stationId,
    );
    await expect(page.getByTestId("checklist-filter-store")).not.toHaveValue(
      "",
    );
  });

  test("мусор в адресе не роняет экран, а просто не сужает список", async ({
    page,
  }) => {
    await signIn(page);
    const station = await seedStation(label());
    const title = await createChecklist(page, station);

    await page.goto(`${CHECKLISTS_PATH}?country=Казахстан&store=1 or 1=1`);

    await expect(page.getByTestId("checklists-screen")).toBeVisible();
    await expect(rowOf(page, title)).toBeVisible();
  });
});
