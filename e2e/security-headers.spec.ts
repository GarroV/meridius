import { expect, test, type Page } from "@playwright/test";

import { E2E_ADMIN_PASSWORD } from "./admin-credentials";

// Заголовков безопасности не было нигде, включая публичный маршрут заполнения, который
// будет открыт в интернет. Проверяются оба уже построенных экрана: и публичный, и вход.
const SCREENS = ["/", "/admin/login"] as const;

interface Violation {
  readonly directive: string;
  readonly blocked: string;
}

/** Считает нарушения политики так, как их видит сам браузер, а не по чтению строки. */
async function watchViolations(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const collected: Violation[] = [];
    Object.defineProperty(globalThis, "__cspViolations", {
      value: collected,
      writable: false,
    });
    document.addEventListener("securitypolicyviolation", (event) => {
      collected.push({
        directive: event.violatedDirective,
        blocked: event.blockedURI,
      });
    });
  });
}

async function violations(page: Page): Promise<Violation[]> {
  return page.evaluate(
    () =>
      (globalThis as unknown as { __cspViolations: Violation[] })
        .__cspViolations,
  );
}

test.describe("заголовки безопасности", () => {
  test.use({ locale: "ru-RU" });

  for (const screen of SCREENS) {
    test(`${screen} отдаёт политику и запрет встраивания`, async ({ page }) => {
      const response = await page.goto(screen);
      const headers = response?.headers() ?? {};

      const policy = headers["content-security-policy"];
      expect(policy).toBeDefined();
      // Каркас политики: чужой источник по умолчанию запрещён, встраивать нельзя,
      // <base> подменить нельзя, форма уходит только к себе.
      expect(policy).toContain("default-src 'self'");
      expect(policy).toContain("frame-ancestors 'none'");
      expect(policy).toContain("base-uri 'self'");
      expect(policy).toContain("form-action 'self'");
      expect(policy).toContain("object-src 'none'");

      // X-Frame-Options — тот же запрет для браузеров, которые не знают frame-ancestors.
      expect(headers["x-frame-options"]).toBe("DENY");
      expect(headers["x-content-type-options"]).toBe("nosniff");
      expect(headers["referrer-policy"]).toBe(
        "strict-origin-when-cross-origin",
      );
      expect(headers["permissions-policy"]).toBeDefined();
    });

    test(`${screen} открывается без нарушений политики`, async ({ page }) => {
      // Политика, которая ломает собственный экран, хуже отсутствующей: её снимут целиком.
      // Tailwind и next/font подставляют свои стили, поэтому проверяется живой браузер.
      const consoleErrors: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(message.text());
      });

      await watchViolations(page);
      await page.goto(screen);
      await page.evaluate(() => document.fonts.ready);

      expect(await violations(page)).toEqual([]);
      expect(consoleErrors).toEqual([]);
    });
  }

  test("вход работает под политикой: форма отправляется и пускает", async ({
    page,
  }) => {
    // Эталон входа написан по-русски — как и в e2e/login.spec.ts.
    // Серверное действие отправляет форму POST'ом на тот же адрес — под form-action 'self'
    // это разрешено, но проверяется прогоном, а не рассуждением.
    await watchViolations(page);
    await page.goto("/admin/login");
    await page.getByLabel("Пароль").fill(E2E_ADMIN_PASSWORD);
    await page.locator('input[name="login"]').fill("admin");
    await page.getByTestId("login-submit").click();

    await expect(page.getByTestId("admin-home")).toBeVisible();
    expect(await violations(page)).toEqual([]);
  });
});
