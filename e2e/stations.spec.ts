// Раздел «Станции»: экран открывается, показывает дырки и фильтруется по ним.
//
// Что здесь проверяется, а что нет. Правило «что считать дыркой» живёт в `gaps.ts` и
// закрыто разбором отдельно — повторять его сквозным сценарием значит писать тот же
// счёт второй раз и на другом языке. Здесь проверяется то, чего разбор не видит: что
// экран вообще поднимается на настоящих данных, что счёт на фишке фильтра совпадает с
// числом строк под ним, и что фильтр в адресе действительно сужает список.
//
// Совпадение счёта со списком — не придирка. Фишка и список считаются в разных местах
// (счёт по всей сети, список после фильтрации), и разойтись они могут молча: человек
// увидит «Без чек-листа · 12» и двенадцать строк, из которых половина закрыта.
import { expect, test } from "@playwright/test";

import { E2E_ADMIN_PASSWORD } from "./admin-credentials";
import { seedStationWithoutChecklist } from "./fill-fixtures";

test.describe("раздел «Станции»", () => {
  test.use({ locale: "ru-RU" });

  test.beforeEach(async ({ page }) => {
    await page.goto("/admin/login");
    await page.getByLabel("Пароль").fill(E2E_ADMIN_PASSWORD);
    await page.getByTestId("login-submit").click();
    await expect(page.getByTestId("admin-home")).toBeVisible();
  });

  test("экран открывается и объясняет, зачем он", async ({ page }) => {
    await page.goto("/admin/stations");

    await expect(page.getByTestId("stations-screen")).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 1, name: "Станции" }),
    ).toBeVisible();

    // D152: раздел обязан сказать о себе прямо на экране, а не подсказкой в другом месте.
    await expect(page.getByText("Здесь живут станции сети")).toBeVisible();
  });

  test("станция без чек-листа помечена и попадает в свой фильтр", async ({
    page,
  }) => {
    // Заводим её сами: на пустой базе проверка про дырки зеленеет, ничего не проверив,
    // — а это ровно тот сорт зелёного, ради которого раздел и затевался.
    const seeded = await seedStationWithoutChecklist("станций", "ru");

    await page.goto("/admin/stations?gap=noChecklist");

    const row = page
      .getByTestId("station-row")
      .filter({ hasText: seeded.stationName });
    await expect(row).toHaveCount(1);
    await expect(row.getByTestId("gap-noChecklist")).toBeVisible();

    // И она же не показывается как закрытая, когда фильтр обратный.
    await page.goto("/admin/stations?gap=silent");
    await expect(
      page.getByTestId("station-row").filter({ hasText: seeded.stationName }),
    ).toHaveCount(0);
  });

  test("счёт на фишке «Без чек-листа» совпадает с числом строк под ней", async ({
    page,
  }) => {
    await seedStationWithoutChecklist("счёта", "ru");
    await page.goto("/admin/stations");

    const chip = page.getByTestId("filter-noChecklist");
    await expect(chip).toBeVisible();

    const label = (await chip.textContent()) ?? "";
    const promised = Number(label.split("·").at(-1)?.trim());
    expect(
      Number.isInteger(promised),
      `Фишка фильтра обязана называть число: прочитано «${label}»`,
    ).toBe(true);

    await chip.click();
    await expect(page).toHaveURL(/gap=noChecklist/);

    const shown = await page.getByTestId("station-row").count();
    expect(
      shown,
      "Счёт на фишке и число строк под ней разошлись — человек увидит одно, " +
        "а получит другое. Обе цифры считаются в разных местах, и это их сверка.",
    ).toBe(promised);

    // Каждая показанная строка действительно помечена этой дыркой, а не просто попала
    // в список: фильтр, который ничего не отсеивает, тоже даёт совпадение чисел.
    if (shown > 0) {
      await expect(page.getByTestId("gap-noChecklist")).toHaveCount(shown);
    }
  });

  test("пустой результат фильтра говорит словами, а не пустотой", async ({
    page,
  }) => {
    await page.goto("/admin/stations?gap=silent");

    const rows = await page.getByTestId("station-row").count();
    if (rows === 0) {
      await expect(page.getByTestId("stations-empty")).toBeVisible();
    } else {
      await expect(page.getByTestId("gap-silent")).toHaveCount(rows);
    }
  });

  test("неизвестный фильтр показывает всё, а не пустоту", async ({ page }) => {
    // Адрес правят руками и присылают ссылками. Показать на мусорный признак пустой
    // экран — значит соврать, что станций нет.
    await page.goto("/admin/stations?gap=выдумка");

    await expect(page.getByTestId("filter-all")).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});
