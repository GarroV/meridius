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

  // Последовательно, и это обход чужого дефекта, а не привычка. Каждый сценарий входит
  // сам, а предел входа занимает место ДО проверки пароля и снимает счёт только после
  // успеха: семь одновременных входов с верным паролем упираются в `perClient` (5 за
  // 15 минут), и один-два сценария падают на входе — каждый раз разные. Выглядело как
  // известная флейка под нагрузкой (#85), оказалось #170. Как только #170 починят,
  // строку убрать: параллельный прогон здесь ничем больше не мешает.
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ page }) => {
    await page.goto("/admin/login");
    await page.getByLabel("Пароль").fill(E2E_ADMIN_PASSWORD);
    await page.locator('input[name="login"]').fill("admin");
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

  test("со списка открывается карточка станции, и на ней всё про эту станцию", async ({
    page,
  }) => {
    const seeded = await seedStationWithoutChecklist("карточки", "ru");

    await page.goto("/admin/stations?gap=noChecklist");
    await page
      .getByTestId("station-row")
      .filter({ hasText: seeded.stationName })
      .getByTestId("station-link")
      .click();

    await expect(page.getByTestId("station-screen")).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 1, name: seeded.stationName }),
    ).toBeVisible();

    // Три карточки в одном месте — ровно то, ради чего раздел затевался: до него
    // чек-лист, наклейка и планшет жили в трёх разных разделах.
    await expect(page.getByTestId("station-checklist-card")).toBeVisible();
    await expect(page.getByTestId("station-sticker-card")).toBeVisible();
    await expect(page.getByTestId("station-tablet-card")).toBeVisible();

    // Наклейка показывает тот самый код, который сеятель выдал станции.
    await expect(page.getByTestId("station-code")).toHaveText(seeded.code);

    // Станция без чек-листа объясняет, чем это плохо, а не просто пустует.
    await expect(page.getByText("откроет пустоту")).toBeVisible();
  });

  test("на карточке есть инструкция привязки с настоящим адресом и факты, из-за которых её считали сломанной", async ({
    page,
  }) => {
    const seeded = await seedStationWithoutChecklist("инструкции", "ru");

    await page.goto("/admin/stations?gap=noChecklist");
    await page
      .getByTestId("station-row")
      .filter({ hasText: seeded.stationName })
      .getByTestId("station-link")
      .click();

    // Просьба владельца дословно: «надо в разделе привязки дать инструкцию, как
    // привязывать планшет, и соответственно всю логику описать».
    // Шаги — общие с продуктом (`device/ui/PairGuide`), с настоящим адресом страницы
    // привязки (D167): его набирают на планшете, путь без площадки не годится.
    const guide = page.getByTestId("pair-guide");
    await expect(guide.getByTestId("pair-guide-step")).toHaveCount(4);
    await expect(guide.getByTestId("pair-guide-address")).toHaveText(
      /^https?:\/\/.+\/pair$/,
    );
    await expect(guide).toContainText("5 минут");
    await expect(guide).toContainText("после перезагрузки");

    const facts = page.getByTestId("pair-facts");
    await expect(facts).toContainText("привязку планшета не трогает");
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

  test("выбор другой станции открывает её карточку рядом, не перерисовывая колонку", async ({
    page,
  }) => {
    // D163: «в станциях меридиуса тоже самое» — мастер-деталь, как у чек-листов.
    const first = await seedStationWithoutChecklist("колонки-1", "ru");
    const second = await seedStationWithoutChecklist("колонки-2", "ru");

    await page.goto("/admin/stations?gap=noChecklist");
    await expect(page.getByTestId("stations-pick")).toBeVisible();
    await page.evaluate(() => {
      const rail = document.querySelector('[data-testid="stations-rail"]');
      if (rail !== null) {
        (rail as unknown as Record<string, unknown>)["probe"] = "та же";
      }
    });

    const rowOf = (name: string) =>
      page.getByTestId("station-row").filter({ hasText: name });

    await rowOf(first.stationName).getByTestId("station-link").click();
    await expect(
      page.getByRole("heading", { level: 1, name: first.stationName }),
    ).toBeVisible();
    await rowOf(second.stationName).getByTestId("station-link").click();
    await expect(
      page.getByRole("heading", { level: 1, name: second.stationName }),
    ).toBeVisible();
    await expect(
      rowOf(second.stationName).getByTestId("station-link"),
    ).toHaveAttribute("aria-current", "page");

    const probe = await page.evaluate(() => {
      const rail = document.querySelector('[data-testid="stations-rail"]');
      return rail === null
        ? undefined
        : (rail as unknown as Record<string, unknown>)["probe"];
    });
    expect(
      probe,
      "Колонка станций перерисовалась при выборе другой станции.",
    ).toBe("та же");
    // Фильтр колонки пережил выбор станции.
    await expect(page.getByTestId("filter-noChecklist")).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});
