import { expect, test } from "@playwright/test";

import {
  E2E_ADMIN_PASSWORD,
  E2E_ADMIN_PASSWORD_HASH,
  E2E_SESSION_SECRET,
} from "./admin-credentials";

const LOGIN_PATH = "/admin/login";
const ADMIN_PATH = "/admin";
const SESSION_COOKIE = "meridius_admin";
const DAY_MS = 24 * 60 * 60 * 1000;
// Столько попыток подряд с одного клиента терпит вход (src/blocks/auth/rate-limit.ts).
// Считаются попытки, а не одни промахи: место в счёте занимается до проверки пароля.
const ATTEMPTS_BEFORE_LOCK = 5;

test.describe("вход в админку", () => {
  // Эталон входа написан по-русски, поэтому и браузер здесь русский.
  test.use({ locale: "ru-RU" });

  test("верный пароль пускает и ставит долгую httpOnly-куку", async ({
    page,
    context,
  }) => {
    await page.goto(ADMIN_PATH);
    await expect(page).toHaveURL(new RegExp(`${LOGIN_PATH}$`));

    await page.getByLabel("Пароль").fill(E2E_ADMIN_PASSWORD);
    await page.getByTestId("login-submit").click();

    await expect(page).toHaveURL(new RegExp(`${ADMIN_PATH}$`));
    await expect(page.getByTestId("admin-home")).toBeVisible();

    const cookie = (await context.cookies()).find(
      (item) => item.name === SESSION_COOKIE,
    );
    expect(cookie).toBeDefined();
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("Lax");
    expect(cookie?.path).toBe("/");
    // Срок 30 дней: сверяем с точностью до суток, чтобы не ловить секунды на границе.
    const days = ((cookie?.expires ?? 0) * 1000 - Date.now()) / DAY_MS;
    expect(days).toBeGreaterThan(29);
    expect(days).toBeLessThan(31);
  });

  test("сессия держится после перезагрузки страницы", async ({ page }) => {
    await page.goto(LOGIN_PATH);
    await page.getByLabel("Пароль").fill(E2E_ADMIN_PASSWORD);
    await page.getByTestId("login-submit").click();
    await expect(page.getByTestId("admin-home")).toBeVisible();

    await page.reload();

    await expect(page.getByTestId("admin-home")).toBeVisible();
  });

  test("неверный пароль показывает отказ, не пускает и не ставит куку", async ({
    page,
    context,
  }) => {
    await page.goto(LOGIN_PATH);

    await page.getByLabel("Пароль").fill("подобранный-пароль");
    await page.getByTestId("login-submit").click();

    await expect(page.getByTestId("login-error")).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`${LOGIN_PATH}$`));
    expect((await context.cookies()).map((item) => item.name)).not.toContain(
      SESSION_COOKIE,
    );
  });

  test("после отказа на экране нет ни введённого пароля, ни хэша, ни секрета", async ({
    page,
  }) => {
    await page.goto(LOGIN_PATH);
    await page.getByLabel("Пароль").fill(E2E_ADMIN_PASSWORD);
    await page.getByTestId("login-submit").click();
    await expect(page.getByTestId("admin-home")).toBeVisible();

    await page.goto(LOGIN_PATH); // вошедшего форма входа не показывает
    await expect(page).toHaveURL(new RegExp(`${ADMIN_PATH}$`));

    const markup = await page.content();
    for (const secret of [
      E2E_ADMIN_PASSWORD,
      E2E_ADMIN_PASSWORD_HASH,
      E2E_SESSION_SECRET,
    ]) {
      expect(markup).not.toContain(secret);
    }
  });

  test("выход убирает сессию: админка снова показывает форму входа", async ({
    page,
    context,
  }) => {
    await page.goto(LOGIN_PATH);
    await page.getByLabel("Пароль").fill(E2E_ADMIN_PASSWORD);
    await page.getByTestId("login-submit").click();
    await expect(page.getByTestId("admin-home")).toBeVisible();

    await page.getByTestId("sign-out").click();

    await expect(page).toHaveURL(new RegExp(`${LOGIN_PATH}$`));
    expect((await context.cookies()).map((item) => item.name)).not.toContain(
      SESSION_COOKIE,
    );

    await page.goto(ADMIN_PATH);
    await expect(page).toHaveURL(new RegExp(`${LOGIN_PATH}$`));
  });

  test("форма входа не отдаёт браузеру ни хэша, ни секрета подписи", async ({
    page,
  }) => {
    const response = await page.goto(LOGIN_PATH);
    const body = (await response?.text()) ?? "";

    expect(body).not.toContain(E2E_ADMIN_PASSWORD_HASH);
    expect(body).not.toContain(E2E_SESSION_SECRET);
    expect(body).not.toContain(E2E_ADMIN_PASSWORD);
    // Ни одного места, где значение поля пароля возвращалось бы обратно в разметку.
    expect(body).not.toMatch(/type="password"[^>]*value="[^"]+"/);
  });

  test("экран входа собран по эталону: заголовок, поле, кнопка и строка про кухню", async ({
    page,
  }) => {
    await page.goto(LOGIN_PATH);

    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "MERIDIUS Dodo",
    );
    await expect(page.getByLabel("Пароль")).toHaveAttribute("type", "password");
    await expect(page.getByTestId("login-submit")).toHaveText("Войти");
    await expect(
      page.getByText(
        "Сотрудникам на кухне вход не нужен: чек-лист открывается по QR-коду станции.",
      ),
    ).toBeVisible();
  });

  test("форма входа работает с выключенным JavaScript", async ({ browser }) => {
    // Действие серверное, поэтому вход не должен зависеть от того, доехали ли скрипты:
    // это же свойство держит форму рабочей на слабой связи в пиццерии.
    const context = await browser.newContext({
      locale: "ru-RU",
      javaScriptEnabled: false,
    });
    const page = await context.newPage();

    await page.goto(LOGIN_PATH);
    await page.getByLabel("Пароль").fill(E2E_ADMIN_PASSWORD);
    await page.getByTestId("login-submit").click();

    await expect(page.getByTestId("admin-home")).toBeVisible();

    await context.close();
  });

  test("перебор пароля упирается в предел и сообщает, когда повторить", async ({
    browser,
  }) => {
    // Свой адрес в заголовке: клиент опознаётся корзиной от его хэша, и этот сценарий
    // не запирает вход остальным, которые идут параллельно с тем же сервером. Корзина
    // этого адреса (8651) не совпадает с корзиной клиента без заголовка (3541), под
    // которым в админку ходят все прочие сценарии.
    const context = await browser.newContext({
      locale: "ru-RU",
      extraHTTPHeaders: { "x-forwarded-for": "203.0.113.77" },
    });
    const page = await context.newPage();

    for (let attempt = 0; attempt < ATTEMPTS_BEFORE_LOCK; attempt++) {
      await page.goto(LOGIN_PATH);
      await page.getByLabel("Пароль").fill("подобранный-пароль");
      await page.getByTestId("login-submit").click();
      await expect(page.getByTestId("login-error")).toBeVisible();
    }

    // Дальше не пускают даже с верным паролем — и говорят, через сколько повторить.
    await page.goto(LOGIN_PATH);
    await page.getByLabel("Пароль").fill(E2E_ADMIN_PASSWORD);
    await page.getByTestId("login-submit").click();

    await expect(page.getByTestId("login-error")).toHaveText(
      "Слишком много попыток входа. Повторите через 15 минут.",
    );
    await expect(page).toHaveURL(new RegExp(`${LOGIN_PATH}$`));
    expect((await context.cookies()).map((item) => item.name)).not.toContain(
      SESSION_COOKIE,
    );

    await context.close();
  });

  test("на английском телефоне экран входа английский", async ({ browser }) => {
    const context = await browser.newContext({ locale: "en-US" });
    const page = await context.newPage();

    await page.goto(LOGIN_PATH);

    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "MERIDIUS Dodo",
    );
    await expect(page.getByTestId("login-submit")).toHaveText("Sign in");

    await context.close();
  });
});

test.describe("кольцо фокуса на поле пароля", () => {
  // Сторож смотрит ПОСЧИТАННЫЙ браузером стиль, а не строку классов, и это не
  // придирка к способу. Первый сторож этого дефекта читал вёрстку — искал у поля
  // с мягким кольцом утилиту `focus:outline-none` — и был зелёным, пока на экране
  // по-прежнему рисовались два кольца: утилита в вёрстке стояла, но не действовала.
  // Проигрывала она не по специфичности, а по слоям: токены эталона импортировались
  // вне слоёв, а неслоёное правило по спецификации бьёт любое слоёное. Проверять
  // поэтому надо то, что получилось у браузера.
  test("кольцо одно: мягкое из эталона, без жёсткой обводки поверх", async ({
    page,
  }) => {
    await page.goto(LOGIN_PATH);
    const field = page.locator('input[type="password"]');
    await field.focus();

    const ring = await field.evaluate((node) => {
      const style = getComputedStyle(node);
      return { outline: style.outlineStyle, shadow: style.boxShadow };
    });

    expect(ring.outline).toBe("none");
    expect(ring.shadow).not.toBe("none");
  });
});
