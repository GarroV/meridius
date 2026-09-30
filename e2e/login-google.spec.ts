// Вход через Google (D176, #177): кнопка на экране входа, уход к Google и отказ на
// возврате. Сам Google в прогоне не участвует — реквизиты выдуманы, а отказ на метке
// случается до обмена кода.
import { expect, test } from "@playwright/test";

import {
  E2E_GOOGLE_CLIENT_ID,
  E2E_GOOGLE_REDIRECT_URI,
} from "./admin-credentials";

const LOGIN_PATH = "/admin/login";
const START_PATH = "/admin/login/google";
const CALLBACK_PATH = "/admin/login/google/callback";

test.describe("вход через Google", () => {
  test("кнопка стоит рядом с паролем, а не вместо него", async ({ page }) => {
    await page.goto(LOGIN_PATH);

    await expect(page.getByTestId("login-google")).toHaveText(
      "Войти через Google",
    );
    await expect(
      page.locator("form", { has: page.getByTestId("login-google") }),
    ).toHaveAttribute("action", START_PATH);
    await expect(page.getByTestId("login-submit")).toBeVisible();
  });

  test("начало входа уводит к Google с нашим клиентом и одноразовой меткой", async ({
    request,
  }) => {
    const response = await request.get(START_PATH, { maxRedirects: 0 });

    expect(response.status()).toBe(303);
    const location = new URL(response.headers()["location"] ?? "");
    expect(location.origin).toBe("https://accounts.google.com");
    expect(location.searchParams.get("client_id")).toBe(E2E_GOOGLE_CLIENT_ID);
    expect(location.searchParams.get("redirect_uri")).toBe(
      E2E_GOOGLE_REDIRECT_URI,
    );
    const state = location.searchParams.get("state") ?? "";
    expect(state.length).toBeGreaterThan(20);
    // Метка лежит в куке только для сервера: из JavaScript страницы её не достать.
    expect(response.headers()["set-cookie"]).toContain(
      `meridius_google_state=${state}`,
    );
    expect(response.headers()["set-cookie"]?.toLowerCase()).toContain(
      "httponly",
    );
  });

  test("возврат с чужой меткой не пускает и говорит об этом на форме", async ({
    page,
  }) => {
    await page.goto(`${CALLBACK_PATH}?code=подброшенный&state=чужая`);

    await expect(page).toHaveURL(/\/admin\/login\?google=failed$/);
    await expect(page.getByTestId("login-google-error")).toBeVisible();

    // Сессии нет: кабинет по-прежнему уводит на форму входа.
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/login$/);
  });
});
