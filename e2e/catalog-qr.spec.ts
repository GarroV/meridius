// Сквозной сценарий перехода из справочника к наклейкам (T107, T312).
//
// Границы модулей запрещают справочнику импортировать блоки `qr` и `stations`, поэтому
// имена параметров адреса (`store`, `station`) совпадают только по договорённости —
// типами это не проверить. Держит контракт только настоящий переход в браузере:
// справочник собирает ссылку на старый адрес QR, а тот уводит в «Станции» — на лист
// наклеек пиццерии или на карточку станции.
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { E2E_ADMIN_PASSWORD } from "./admin-credentials";
import { seedStore, STATION_NAMES, type SeededStore } from "./station-fixtures";

const CATALOG_PATH = "/admin/catalog";

async function signIn(page: Page): Promise<void> {
  await page.goto("/admin/login");
  await page.getByLabel("Пароль").fill(E2E_ADMIN_PASSWORD);
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("admin-home")).toBeVisible();
}

/**
 * Доходит до пиццерии по дереву справочника: страна → пиццерия, кликами по именам.
 *
 * После каждого клика ждём не «строка видна» (она видна и до него), а сам адрес:
 * выбор в справочнике живёт в адресе, и только он говорит, что переход состоялся.
 * Иначе проверка проскакивает вперёд перехода и жмёт кнопку на прежней странице.
 */
async function openStore(page: Page, store: SeededStore): Promise<void> {
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

test.describe("переход из справочника к наклейкам", () => {
  // Эталон и тексты справочника русские, поэтому и браузер русский.
  test.use({ locale: "ru-RU" });

  test("«QR-коды станций» ведёт на лист наклеек выбранной пиццерии", async ({
    page,
  }) => {
    const store = await seedStore();
    await signIn(page);
    await openStore(page, store);

    await page.getByTestId("catalog-qr-stations").click();

    await expect(page).toHaveURL(/\/admin\/stations\/stickers\?/);
    expect(
      new URL(page.url()).searchParams.getAll("stationIds").sort(),
    ).toEqual([...store.stationIds].sort());
    await expect(page.getByTestId("qr-sticker")).toHaveCount(
      STATION_NAMES.length,
    );
    await expect(
      page.getByTestId("qr-sticker").filter({ hasText: store.storeName }),
    ).toHaveCount(STATION_NAMES.length);
  });

  test("«QR» в строке станции ведёт на карточку именно этой станции", async ({
    page,
  }) => {
    const store = await seedStore();
    await signIn(page);
    await openStore(page, store);

    // Вторая станция, не первая: первая могла бы совпасть и по случайности.
    const targetName = store.stationNames[1];
    if (targetName === undefined)
      throw new Error("В фикстуре нет второй станции");

    const row = page.getByTestId("station-row").filter({ hasText: targetName });
    await row.getByTestId("catalog-station-qr").click();

    // Карточка именно этой станции: без параметра `station` старый адрес увёл бы на
    // лист всей пиццерии, и такая потеря прошла бы тест незамеченной.
    await expect(page).toHaveURL(
      new RegExp(`/admin/stations/${store.stationIds[1] ?? ""}$`),
    );
    await expect(
      page.getByRole("heading", { level: 1, name: targetName }),
    ).toBeVisible();
  });
});
