// Скачивание наклейки станции файлом.
//
// Заведено просьбой владельца: «не понимаю как куаркод скачать… формат должен быть векторный?
// чтоб легко масштаб менялся». Код показывался на экране и печатался листом, но файла не
// отдавал: вложить его в инструкцию или отправить управляющему было нельзя.
//
// Формат проверяется по содержимому, а не по имени: растровая картинка с расширением .svg
// прошла бы проверку имени и рассыпалась бы при печати на другом размере.
import { test, expect, type Page } from "@playwright/test";

import { E2E_ADMIN_PASSWORD } from "./admin-credentials";
import { seedStore } from "./station-fixtures";

async function signIn(page: Page): Promise<void> {
  await page.goto("/admin/login");
  await page.getByLabel("Пароль").fill(E2E_ADMIN_PASSWORD);
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("admin-home")).toBeVisible();
}

/**
 * Своя станция и её карточка: чужие данные прогонов сюда не примешиваются. С T312
 * наклейку скачивают с карточки станции — отдельного экрана QR больше нет.
 */
async function openOwnStation(page: Page): Promise<void> {
  const store = await seedStore();
  await page.goto(`/admin/stations/${store.stationIds[0] ?? ""}`);
  await expect(page.getByTestId("station-sticker-card")).toBeVisible();
}

test.describe("наклейка станции файлом", () => {
  test.use({ locale: "ru-RU" });

  test("кнопка «Скачать» отдаёт файл, и это вектор с печатным размером", async ({
    page,
  }) => {
    await signIn(page);
    await openOwnStation(page);

    const download = page.getByTestId("download-sticker");
    await expect(download).toBeVisible();

    const started = page.waitForEvent("download");
    await download.click();
    const file = await started;

    expect(file.suggestedFilename()).toMatch(/^qr-.+\.svg$/);

    const stream = await file.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const svg = Buffer.concat(chunks).toString("utf8");

    // Вектор: геометрия в viewBox, размер в миллиметрах — открывается в чужой программе
    // предсказуемо и масштабируется без потери качества.
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toMatch(/viewBox="0 0 \d+ \d+"/);
    expect(svg).toContain('width="42mm"');
    expect(svg).toContain("<path");
  });

  test("скачанный код ведёт на ту же станцию, что показан на экране", async ({
    page,
  }) => {
    await signIn(page);
    await openOwnStation(page);

    // Код станции виден на карточке; тот же код обязан быть в имени файла, иначе
    // управляющий наклеит на станцию чужую наклейку.
    const code = (await page.getByTestId("station-code").innerText()).trim();
    expect(code).not.toBe("");

    const started = page.waitForEvent("download");
    await page.getByTestId("download-sticker").click();
    const file = await started;

    // Имя несёт и станцию, и её код: по нему видно, куда клеить, и наклейки не путают.
    // Пробелов в имени нет — файл живёт дальше в письмах и в командной строке.
    const name = file.suggestedFilename();
    expect(name).toContain(code);
    expect(name.endsWith(".svg")).toBe(true);
    expect(name).not.toMatch(/\s/);
  });

  test("без входа файл не отдаётся", async ({ request }) => {
    const response = await request.get(
      "/admin/qr/sticker?store=00000000-0000-4000-8000-000000000000&station=00000000-0000-4000-8000-000000000001",
      { maxRedirects: 0 },
    );

    expect(response.status()).not.toBe(200);
    expect((await response.text()).startsWith("<svg")).toBe(false);
  });
});
