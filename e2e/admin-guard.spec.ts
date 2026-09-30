import { expect, test } from "@playwright/test";

import { adminRoutes } from "./admin-routes";

const LOGIN_PATH = "/admin/login";
// Метка стоит на самом экране входа и потому видна и в разметке, и в ответе клиентской
// навигации: по ней понятно, что пришёл именно вход, а не экран админки и не пустой редирект.
const LOGIN_SCREEN_MARKER = "login-screen";
const ROUTES = adminRoutes();

test.describe("админка закрыта: без сессии ни один её маршрут не отдаёт данные", () => {
  test("маршруты админки вообще нашлись", () => {
    // Пустой перебор молча превратил бы весь набор ниже в ноль проверок.
    expect(ROUTES.length).toBeGreaterThan(0);
    expect(ROUTES.map((route) => route.url)).toContain("/admin");
  });

  for (const route of ROUTES) {
    test(`${route.kind === "page" ? "экран" : "обработчик"} ${route.url} (${route.file})`, async ({
      request,
    }) => {
      const response = await request.get(route.url, { maxRedirects: 0 });

      if (route.kind === "handler") {
        // Обработчик `route.ts` выполняется мимо разметки, значит охрана в layout.tsx его
        // не закрывает: он обязан звать requireAdmin() сам. Ответ 2xx без сессии — дыра.
        const succeeded = response.status() >= 200 && response.status() < 300;
        expect(
          succeeded,
          `${route.file}: обработчик без сессии ответил успехом — не хватает requireAdmin()`,
        ).toBe(false);
        return;
      }

      expect(
        [307, 308],
        `${route.file}: экран без сессии обязан уводить на форму входа`,
      ).toContain(response.status());
      expect(response.headers()["location"]).toContain(LOGIN_PATH);

      // Тот же экран, но запросом клиентской навигации (RSC). Разметка и страница
      // рендерятся параллельно, поэтому один redirect() из layout.tsx не мешает странице
      // отрендериться и уехать в теле ответа — проверяется именно тело.
      const rsc = await request.get(route.url, { headers: { RSC: "1" } });
      expect(
        await rsc.text(),
        `${route.file}: запрос клиентской навигации без сессии обязан приводить к форме входа`,
      ).toContain(LOGIN_SCREEN_MARKER);
    });
  }

  test("экран админки без сессии показывает форму входа, а не свои данные", async ({
    page,
  }) => {
    await page.goto("/admin");

    await expect(page).toHaveURL(new RegExp(`${LOGIN_PATH}$`));
    await expect(page.getByTestId("login-submit")).toBeVisible();
    await expect(page.getByTestId("admin-home")).toHaveCount(0);
    expect(await page.content()).not.toContain("Мои чек-листы");
  });

  test("запрос клиентской навигации не увозит разметку админки", async ({
    request,
  }) => {
    // Находка ревью безопасности: охрана в разметке бросала redirect, но страница успевала
    // отрендериться, и её содержимое уезжало в теле RSC-ответа вместе с редиректом.
    const body = await (
      await request.get("/admin", { headers: { RSC: "1" } })
    ).text();

    expect(body).not.toContain("admin-home");
    expect(body).not.toContain("My checklists");
    expect(body).not.toContain("Мои чек-листы");
  });

  test("предзагрузка ссылки роутером тоже не увозит разметку админки", async ({
    request,
  }) => {
    const body = await (
      await request.get("/admin", {
        headers: { RSC: "1", "Next-Router-Prefetch": "1" },
      })
    ).text();

    expect(body).not.toContain("admin-home");
    expect(body).not.toContain("My checklists");
  });

  test("HEAD-запрос экрана админки уводит на вход", async ({ request }) => {
    const response = await request.head("/admin", { maxRedirects: 0 });

    expect([307, 308]).toContain(response.status());
    expect(response.headers()["location"]).toContain(LOGIN_PATH);
  });

  test("несуществующий экран админки тоже не отдаётся без сессии", async ({
    request,
  }) => {
    // Отказ приходит от охраны раньше, чем Next успевает сказать «нет такой страницы»:
    // перебор адресов админки не подсказывает, какие разделы в ней есть.
    const response = await request.get("/admin/такого-раздела-нет", {
      maxRedirects: 0,
    });

    expect([307, 308]).toContain(response.status());
    expect(response.headers()["location"]).toContain(LOGIN_PATH);
  });

  test("публичный маршрут заполнения вход не спрашивает", async ({
    request,
  }) => {
    // Маршрут заполнения существует (блок fill) и на вход не заворачивается: он о сессии
    // не знает вовсе. Границу на уровне импортов держит .dependency-cruiser.cjs.
    // Код станции заведомо несуществующий — отвечать он должен отказом экрана, а не
    // редиректом и не подсказкой о том, есть такая станция или нет.
    const response = await request.get("/s/ABCDEFGHJK", { maxRedirects: 0 });

    expect(response.status()).toBe(200);
    expect(response.headers()["location"]).toBeUndefined();
    expect(await response.text()).toContain('data-testid="fill-invalid"');
  });
});
