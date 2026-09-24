import { afterEach, describe, expect, it } from "vitest";

import { formActionPath, redirectPath } from "./base-path";

const previous = process.env["BASE_PATH"];

afterEach(() => {
  if (previous === undefined) delete process.env["BASE_PATH"];
  else process.env["BASE_PATH"] = previous;
});

describe("путь перенаправления при опубликованном базовом пути", () => {
  it("на обычной площадке путь не меняется", () => {
    delete process.env["BASE_PATH"];
    expect(redirectPath("/admin")).toBe("/admin");
  });

  it("приставляет базовый путь площадки", () => {
    // Иначе вход срабатывает, а человек оказывается на корне адреса —
    // на площадке там живёт соседний сервис (D045).
    process.env["BASE_PATH"] = "/qr";
    expect(redirectPath("/admin")).toBe("/qr/admin");
    expect(redirectPath("/admin/login")).toBe("/qr/admin/login");
  });

  it("не двоит косые, как бы путь ни записали в окружении", () => {
    process.env["BASE_PATH"] = "qr/";
    expect(redirectPath("/admin")).toBe("/qr/admin");
  });
});

describe("адрес отправки обычной формы при опубликованном базовом пути", () => {
  it("на обычной площадке путь не меняется", () => {
    delete process.env["BASE_PATH"];
    expect(formActionPath("/admin/feed")).toBe("/admin/feed");
  });

  it("приставляет базовый путь площадки", () => {
    // Браузер отправляет GET-форму ровно по тому адресу, что написан в `action`:
    // Next приставляет базовый путь `<Link>` и роутеру, но нативный атрибут формы
    // не трогает. Без этой приставки фильтр по стране уводил на `/admin/feed`,
    // где на площадке с базовым путём живёт «Такой страницы нет» (проверено на
    // стенде 24.09.2026: выбор страны в ленте и в списке чек-листов).
    process.env["BASE_PATH"] = "/qr";
    expect(formActionPath("/admin/feed")).toBe("/qr/admin/feed");
    expect(formActionPath("/admin/checklists")).toBe("/qr/admin/checklists");
  });

  it("не двоит косые, как бы путь ни записали в окружении", () => {
    process.env["BASE_PATH"] = "qr/";
    expect(formActionPath("/admin/feed")).toBe("/qr/admin/feed");
  });
});
