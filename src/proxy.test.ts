import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { SESSION_COOKIE_NAME, createSessionToken } from "@/blocks/auth/session";
import { FILL_STATION_CODE_HEADER } from "@/blocks/fill/params";

import { config, proxy } from "./proxy";

const SECRET = "секрет-подписи-сессии-достаточной-длины-1234567890";
const ORIGIN = "http://localhost:3100";

function requestTo(path: string, cookie?: string): NextRequest {
  const headers = new Headers();
  if (cookie !== undefined) {
    headers.set("cookie", `${SESSION_COOKIE_NAME}=${cookie}`);
  }
  return new NextRequest(new URL(path, ORIGIN), { headers });
}

function validCookie(): string {
  return createSessionToken(SECRET, new Date());
}

beforeEach(() => {
  process.env["SESSION_SECRET"] = SECRET;
});

afterEach(() => {
  delete process.env["SESSION_SECRET"];
});

describe("охрана перед рендером", () => {
  test("сторожит весь /admin и, отдельной веткой, публичный /s", () => {
    // `/s/*` попал в matcher не ради охраны: этому маршруту выдаётся одноразовый
    // ключ политики безопасности (T071), а выдать его больше некому.
    expect(config.matcher).toEqual(["/admin/:path*", "/s/:path*"]);
  });

  test("публичный маршрут не заворачивается на вход и не читает сессию", () => {
    // Ни без куки, ни с подделанной: ветка публичного маршрута срабатывает первой
    // и до сессии не доходит вовсе.
    const forged = createSessionToken(
      "чужой-секрет-достаточной-длины-123456",
      new Date(),
    );
    for (const request of [
      requestTo("/s/abcdefghjk"),
      requestTo("/s/abcdefghjk", forged),
    ]) {
      const response = proxy(request);
      expect(response.status).toBe(200);
      expect(response.headers.get("location")).toBeNull();
    }
  });

  test("публичный маршрут получает свой ключ на каждый запрос", () => {
    // Постоянный ключ не защищает ни от чего: он так же известен, как его отсутствие.
    const first = proxy(requestTo("/s/abcdefghjk")).headers.get(
      "content-security-policy",
    );
    const second = proxy(requestTo("/s/abcdefghjk")).headers.get(
      "content-security-policy",
    );

    expect(first).toMatch(/script-src 'nonce-[^']+' 'strict-dynamic'/);
    expect(first).not.toContain("unsafe-inline'; style");
    expect(second).not.toBe(first);
  });

  test("без куки уводит на форму входа", () => {
    const response = proxy(requestTo("/admin"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`${ORIGIN}/admin/login`);
  });

  test("уводит и с вложенного адреса, и с несуществующего", () => {
    for (const path of ["/admin/checklists/17/edit", "/admin/такого-нет"]) {
      expect(proxy(requestTo(path)).status).toBe(307);
    }
  });

  test("с действующей сессией пропускает дальше", () => {
    const response = proxy(requestTo("/admin", validCookie()));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  test("с подделанной и с мусорной кукой уводит на форму входа", () => {
    const forged = createSessionToken(
      "секрет-подобранный-злоумышленником",
      new Date(),
    );

    expect(proxy(requestTo("/admin", forged)).status).toBe(307);
    // Мусор в куке пишется латиницей: заголовок HTTP не переносит символы за пределами
    // одного байта, и кириллица здесь падала бы на конструкторе запроса, а не на проверке.
    expect(proxy(requestTo("/admin", "not.a.cookie")).status).toBe(307);
  });

  test("форму входа пропускает без сессии — иначе она заворачивала бы сама себя", () => {
    expect(proxy(requestTo("/admin/login")).status).toBe(200);
    expect(proxy(requestTo("/admin/login/")).status).toBe(200);
  });

  test("запрошенный адрес не переезжает в ссылку на вход: открытому редиректу неоткуда взяться", () => {
    const response = proxy(
      requestTo("/admin/feed?next=https://чужой-сайт.example"),
    );

    expect(response.headers.get("location")).toBe(`${ORIGIN}/admin/login`);
  });

  test("без SESSION_SECRET не пускает: падает, а не считает куку годной", () => {
    delete process.env["SESSION_SECRET"];

    expect(() => proxy(requestTo("/admin", validCookie()))).toThrow(
      /SESSION_SECRET/,
    );
  });
});

/**
 * `NextResponse.next({ request: { headers } })` не подменяет сам объект запроса — тела
 * запроса на этом шаге ещё нет ни у кого. Next кладёт переписанные заголовки запроса на
 * ОТВЕТ, служебными заголовками: `x-middleware-override-headers` перечисляет имена того,
 * что посредник переписал, а значение каждого лежит в `x-middleware-request-<имя>`
 * (node_modules/next/dist/server/web/spec-extension/response.js, handleMiddlewareField —
 * его же читает сам Next перед тем, как отдать запрос корневой разметке). Тест читает тем
 * же путём.
 */
function rewrittenRequestHeader(
  response: ReturnType<typeof proxy>,
  header: string,
): string | null {
  const rewritten = response.headers.get("x-middleware-override-headers");
  if (rewritten === null || !rewritten.split(",").includes(header)) {
    return null;
  }
  return response.headers.get(`x-middleware-request-${header}`);
}

function requestWithHeader(path: string, header: string, value: string) {
  const headers = new Headers();
  headers.set(header, value);
  return new NextRequest(new URL(path, ORIGIN), { headers });
}

describe("код станции для корневой разметки", () => {
  /**
   * Дефект T270 целиком: разметка рендерится раньше страницы и код станции берёт не из
   * `params`, а из этого заголовка запроса. Не доедь код сюда — язык документа снова
   * считался бы по языку телефона, а текст на экране остался бы на языке пиццерии.
   */
  test("код из адреса доезжает до разметки в переписанном заголовке запроса", () => {
    const response = proxy(requestTo("/s/abcdefghjk"));

    expect(rewrittenRequestHeader(response, FILL_STATION_CODE_HEADER)).toBe(
      "abcdefghjk",
    );
  });

  test("значение, присланное клиентом, затирается кодом из адреса", () => {
    // Если бы посредник дописывал заголовок вместо того, чтобы его переставлять, любой
    // открывший ссылку решал бы, на каком языке видеть чужой экран заполнения.
    const response = proxy(
      requestWithHeader("/s/abcdefghjk", FILL_STATION_CODE_HEADER, "podlog"),
    );

    expect(rewrittenRequestHeader(response, FILL_STATION_CODE_HEADER)).toBe(
      "abcdefghjk",
    );
  });

  test("на адресе без кода заголовок до разметки не доезжает вовсе", () => {
    // `/s/abc/def` — не маршрут `s/[code]`. Заведомо чужое значение клиента обязано
    // пропасть вместе с тем, что посредник само не назвал: иначе разметка получила бы
    // код станции там, где странице заполнения взяться неоткуда.
    for (const request of [
      requestTo("/s/abc/def"),
      requestWithHeader("/s/abc/def", FILL_STATION_CODE_HEADER, "podlog"),
    ]) {
      const response = proxy(request);
      expect(
        response.headers.get("x-middleware-override-headers"),
      ).not.toContain(FILL_STATION_CODE_HEADER);
      expect(
        rewrittenRequestHeader(response, FILL_STATION_CODE_HEADER),
      ).toBeNull();
    }
  });

  test("на /admin посредник код станции не называет", () => {
    // Ветка кабинета к `publicFillResponse` не заходит — у неё нет причин что-либо знать
    // про пиццерию, и своего кода она не называет.
    //
    // ЧЕГО ЭТА ПРОВЕРКА НЕ УТВЕРЖДАЕТ: что заголовок не доедет до разметки вообще.
    // Запросы вне ветки публичного маршрута идут с заголовками клиента как есть, то есть
    // присланный клиентом заголовок до разметки доедет — и на адресах, которых в
    // `matcher` нет, тоже. Нового этим не получают: тот же запрос в базу открыт обычным
    // `GET /s/<код>`, а подделавший меняет язык страницы, которую сам же и смотрит.
    // Разобрано в `blocks/fill/params.ts` над самим заголовком.
    const response = proxy(
      requestWithHeader("/admin/login", FILL_STATION_CODE_HEADER, "podlog"),
    );

    expect(response.headers.get("x-middleware-override-headers")).toBeNull();
    expect(
      rewrittenRequestHeader(response, FILL_STATION_CODE_HEADER),
    ).toBeNull();
  });
});
