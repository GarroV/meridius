// Сквозной сценарий перехода из справочника в раздел QR (T107).
//
// Границы модулей запрещают справочнику импортировать блок `qr`, поэтому имена
// параметров адреса (`store`, `station`) у двух блоков совпадают только по
// договорённости — типами это не проверить. Держит контракт только настоящий
// переход в браузере: справочник собирает ссылку, а раздел QR читает её адрес.
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

test.describe("переход из справочника в QR", () => {
  // Эталон и тексты справочника русские, поэтому и браузер русский.
  test.use({ locale: "ru-RU" });

  test("«QR-коды станций» ведёт на лист кодов выбранной пиццерии", async ({
    page,
  }) => {
    const store = await seedStore();
    await signIn(page);
    await openStore(page, store);

    await page.getByTestId("catalog-qr-stations").click();

    await expect(page.getByTestId("qr-screen")).toBeVisible();
    expect(new URL(page.url()).searchParams.get("store")).toBe(store.storeId);
    await expect(page.getByTestId("qr-sticker")).toHaveCount(
      STATION_NAMES.length,
    );
    await expect(
      page.getByTestId("qr-sticker").filter({ hasText: store.storeName }),
    ).toHaveCount(STATION_NAMES.length);
  });

  test("«QR» в строке станции ведёт на код именно этой станции", async ({
    page,
  }) => {
    const store = await seedStore();
    await signIn(page);
    await openStore(page, store);

    // Вторая станция, не первая: без параметра `station` раздел QR молча
    // выбирает первую станцию списка, и такая потеря прошла бы тест незамеченной.
    const targetName = store.stationNames[1];
    if (targetName === undefined)
      throw new Error("В фикстуре нет второй станции");

    const row = page.getByTestId("station-row").filter({ hasText: targetName });
    await row.getByTestId("catalog-station-qr").click();

    await expect(page.getByTestId("qr-screen")).toBeVisible();
    const url = new URL(page.url());
    expect(url.searchParams.get("store")).toBe(store.storeId);
    expect(url.searchParams.get("station")).not.toBeNull();

    const tablet = page.getByTestId("qr-tablet");
    await expect(tablet).toContainText(targetName);
    // Соседняя станция не должна оказаться на карточке планшета — иначе
    // параметр `station` потерялся молча и выбралась первая станция списка.
    for (const otherName of store.stationNames) {
      if (otherName === targetName) continue;
      await expect(tablet).not.toContainText(otherName);
    }
  });
});
