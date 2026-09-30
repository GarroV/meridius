// Разбор ответа Google (D176): ошибка здесь не падает, а тихо пускает чужую почту.
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  authorizationUrl,
  exchangeCode,
  googleSettings,
  identityFromIdToken,
  newState,
} from "./google";

const CLIENT_ID = "meridius.apps.googleusercontent.com";
const NOW = new Date("2026-09-30T12:00:00Z");
const NOW_SECONDS = Math.floor(NOW.getTime() / 1000);

function part(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function token(claims: Record<string, unknown>): string {
  return `${part({ alg: "RS256" })}.${part(claims)}.подпись`;
}

const GOOD = {
  iss: "https://accounts.google.com",
  aud: CLIENT_ID,
  exp: NOW_SECONDS + 3600,
  email: "ivan@dodobrands.io",
  email_verified: true,
};

describe("id_token от Google", () => {
  test("годный токен отдаёт подтверждённую почту", () => {
    expect(identityFromIdToken(token(GOOD), CLIENT_ID, NOW)).toEqual({
      email: "ivan@dodobrands.io",
    });
  });

  test("издатель без https — тоже Google", () => {
    const claims = { ...GOOD, iss: "accounts.google.com" };
    expect(identityFromIdToken(token(claims), CLIENT_ID, NOW)).not.toBeNull();
  });

  test.each([
    ["чужой издатель", { iss: "https://evil.example" }],
    ["токен другого клиента", { aud: "someone-else" }],
    ["просрочен", { exp: NOW_SECONDS - 120 }],
    ["без срока", { exp: undefined }],
    ["почта не подтверждена", { email_verified: false }],
    ["подтверждённость строкой", { email_verified: "true" }],
    ["без почты", { email: undefined }],
  ])("%s — отказ", (_name, change) => {
    const claims = { ...GOOD, ...change };
    expect(identityFromIdToken(token(claims), CLIENT_ID, NOW)).toBeNull();
  });

  test("мусор вместо токена — отказ, а не исключение", () => {
    expect(identityFromIdToken("не-токен", CLIENT_ID, NOW)).toBeNull();
    expect(identityFromIdToken("a.bm90LWpzb24.c", CLIENT_ID, NOW)).toBeNull();
    // Разобранный JSON, но не объект с полями.
    expect(
      identityFromIdToken(`a.${part([GOOD])}.c`, CLIENT_ID, NOW),
    ).toBeNull();
  });
});

test("адрес Google несёт клиента, возврат, метку и выбор аккаунта", () => {
  const url = new URL(
    authorizationUrl(
      {
        clientId: CLIENT_ID,
        clientSecret: "секрет",
        redirectUri: "https://m.example/admin/login/google/callback",
      },
      "метка",
    ),
  );
  expect(url.origin).toBe("https://accounts.google.com");
  expect(Object.fromEntries(url.searchParams)).toEqual({
    client_id: CLIENT_ID,
    redirect_uri: "https://m.example/admin/login/google/callback",
    response_type: "code",
    scope: "openid email profile",
    state: "метка",
    prompt: "select_account",
  });
  // Секрет клиента в адрес браузера не уходит никогда.
  expect(url.toString()).not.toContain("секрет");
});

const SETTINGS = {
  clientId: CLIENT_ID,
  clientSecret: "секрет-клиента",
  redirectUri: "https://m.example/admin/login/google/callback",
};

function answer(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("обмен кода на id_token", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test("код уходит POST-ом вместе с секретом, в ответ — id_token", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(answer(200, { id_token: "токен" })),
    );
    vi.stubGlobal("fetch", fetchMock);

    expect(await exchangeCode(SETTINGS, "код")).toBe("токен");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://oauth2.googleapis.com/token");
    expect(init.method).toBe("POST");
    expect(
      Object.fromEntries(new URLSearchParams(init.body as string)),
    ).toEqual({
      code: "код",
      client_id: CLIENT_ID,
      client_secret: "секрет-клиента",
      redirect_uri: SETTINGS.redirectUri,
      grant_type: "authorization_code",
    });
  });

  test("отказ Google — null, в журнал уходит статус, а не тело", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve(answer(400, { error: "invalid_grant", secret: "тело" })),
    );
    const log = vi.spyOn(console, "error").mockImplementation(vi.fn());

    expect(await exchangeCode(SETTINGS, "код")).toBeNull();
    expect(JSON.stringify(log.mock.calls)).toContain("400");
    expect(JSON.stringify(log.mock.calls)).not.toContain("тело");
  });

  test.each([
    ["без id_token", { access_token: "x" }],
    ["id_token не строкой", { id_token: 42 }],
    ["не объект", "строка"],
  ])("ответ %s — null", async (_name, body) => {
    vi.stubGlobal("fetch", () => Promise.resolve(answer(200, body)));
    expect(await exchangeCode(SETTINGS, "код")).toBeNull();
  });
});

describe("реквизиты клиента из окружения", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("все три заданы — вход через Google включён", () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", ` ${CLIENT_ID} `);
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "секрет");
    vi.stubEnv("GOOGLE_REDIRECT_URI", SETTINGS.redirectUri);
    expect(googleSettings()).toEqual({
      clientId: CLIENT_ID,
      clientSecret: "секрет",
      redirectUri: SETTINGS.redirectUri,
    });
  });

  test.each([
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "GOOGLE_REDIRECT_URI",
  ])("пустой %s — вход через Google выключен целиком", (name) => {
    vi.stubEnv("GOOGLE_CLIENT_ID", CLIENT_ID);
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "секрет");
    vi.stubEnv("GOOGLE_REDIRECT_URI", SETTINGS.redirectUri);
    vi.stubEnv(name, "  ");
    expect(googleSettings()).toBeNull();
  });
});

function withClient(): void {
  vi.stubEnv("GOOGLE_CLIENT_ID", CLIENT_ID);
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "секрет");
  vi.stubEnv("GOOGLE_REDIRECT_URI", SETTINGS.redirectUri);
}

describe("адрес возврата для фронта Cloudflare", () => {
  const FRONT = "https://meridius.front.example/admin/login/google/callback";

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("пришедшему через фронт — адрес фронта", () => {
    withClient();
    vi.stubEnv("GOOGLE_FRONT_REDIRECT_URI", FRONT);
    expect(googleSettings(true)?.redirectUri).toBe(FRONT);
  });

  test("прямому запросу — прямой адрес, даже если адрес фронта задан", () => {
    withClient();
    vi.stubEnv("GOOGLE_FRONT_REDIRECT_URI", FRONT);
    expect(googleSettings(false)?.redirectUri).toBe(SETTINGS.redirectUri);
  });

  test("адреса фронта нет — и через фронт прямой адрес", () => {
    withClient();
    vi.stubEnv("GOOGLE_FRONT_REDIRECT_URI", "");
    expect(googleSettings(true)?.redirectUri).toBe(SETTINGS.redirectUri);
  });
});

test("метка похода к Google каждый раз новая и не короче 32 байт", () => {
  const first = newState();
  expect(first).not.toBe(newState());
  expect(Buffer.from(first, "base64url").length).toBe(32);
});
