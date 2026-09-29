// Раздел «Шаблоны» (T309): завести шаблон, опубликовать и взять к себе двумя путями.
//
// Что здесь, а что в разборе. Правила копии — черновик, источник, номер версии,
// отсутствие станции — закрыты тестами на базе (`editor/take-template.test.ts`).
// Здесь то, чего они не видят: что путь человека сходится на экранах — шаблон не
// всплывает в общем списке чек-листов, у него нет поля станции, «Взять без станции»
// открывает редактор КОПИИ, а «Взять к себе» приводит в раскатку с этим же шаблоном.
import { expect, test, type Page } from "@playwright/test";

import { E2E_ADMIN_PASSWORD } from "./admin-credentials";
import { seedStationWithoutChecklist } from "./fill-fixtures";

async function createPublishedTemplate(page: Page, title: string) {
  await page.goto("/admin/templates");
  await page.getByTestId("new-template").click();
  await expect(page.getByTestId("new-template-screen")).toBeVisible();
  // У шаблона станции не бывает — и поля для неё нет.
  await expect(page.locator("#new-checklist-station")).toHaveCount(0);

  await page.getByTestId("new-checklist-title").fill(title);
  await page.getByTestId("create-checklist").click();

  await expect(page.getByTestId("editor-screen")).toBeVisible();
  await expect(page.getByTestId("checklist-station")).toHaveCount(0);
  await expect(page.getByText("Станция не выбрана")).toHaveCount(0);
  await expect(page.getByTestId("nav-templates")).toHaveAttribute(
    "aria-current",
    "page",
  );

  await page.getByTestId("item-title").first().fill("Проверить холодильник");
  await page.getByTestId("publish").click();
  await expect(page.getByTestId("editor-published")).toContainText("1");
  return new URL(page.url()).pathname.split("/").at(-1) ?? "";
}

test.describe("раздел «Шаблоны»", () => {
  test.use({ locale: "ru-RU" });

  // Последовательно — по той же причине, что в `stations.spec.ts` (#170).
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ page }) => {
    await page.goto("/admin/login");
    await page.getByLabel("Пароль").fill(E2E_ADMIN_PASSWORD);
    await page.locator('input[name="login"]').fill("admin");
    await page.getByTestId("login-submit").click();
    await expect(page.getByTestId("admin-home")).toBeVisible();
  });

  test("шаблон заводится в своём разделе и не всплывает среди чек-листов", async ({
    page,
  }) => {
    const title = `Шаблон смены ${String(Date.now())}`;
    await createPublishedTemplate(page, title);

    await page.goto("/admin/templates");
    // D152, D154: раздел объясняет себя сам и тоном приглашения.
    await expect(page.getByText("Так мы видим идеальную смену")).toBeVisible();
    const card = page.getByTestId("template-card").filter({ hasText: title });
    await expect(card).toHaveCount(1);
    await expect(card).toContainText("1 пункт");

    await page.goto("/admin/checklists");
    await expect(page.getByTestId("checklists-screen")).toBeVisible();
    await expect(page.getByText(title)).toHaveCount(0);
  });

  test("«Взять без станции» открывает редактор копии, и копия — в чек-листах", async ({
    page,
  }) => {
    const title = `Шаблон к себе ${String(Date.now())}`;
    const templateId = await createPublishedTemplate(page, title);

    await page.goto("/admin/templates");
    const card = page.getByTestId("template-card").filter({ hasText: title });
    await card.getByTestId("template-take-alone").click();

    await expect(page.getByTestId("editor-screen")).toBeVisible();
    // Открылась копия, а не сам шаблон: у копии другой адрес и есть поле станции.
    await expect(page).not.toHaveURL(new RegExp(templateId));
    await expect(page.getByTestId("checklist-station")).toBeVisible();
    await expect(page.getByTestId("checklist-title")).toHaveValue(title);
    await expect(page.getByTestId("item-title").first()).toHaveValue(
      "Проверить холодильник",
    );

    await page.goto("/admin/checklists");
    await expect(page.getByText(title)).toHaveCount(1);
  });

  test("«Взять к себе» ведёт в раскатку с этим шаблоном", async ({ page }) => {
    // Шаблонов два: с одним шаблон «выбран» и без предвыбора, и проверка ничего не
    // проверила бы. Станция нужна потому, что панель раскатки стоит над списком
    // станций и без них не рисуется.
    await seedStationWithoutChecklist("шаблонов", "ru");
    const first = `Шаблон первый ${String(Date.now())}`;
    const second = `Шаблон второй ${String(Date.now())}`;
    await createPublishedTemplate(page, first);
    const secondId = await createPublishedTemplate(page, second);

    await page.goto("/admin/templates");
    await page
      .getByTestId("template-card")
      .filter({ hasText: second })
      .getByTestId("template-take-to-stations")
      .click();

    await expect(page.getByTestId("stations-screen")).toBeVisible();
    await expect(page.locator("#rollout-template")).toHaveValue(secondId);
  });
});
