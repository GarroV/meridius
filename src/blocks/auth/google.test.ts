// Разбор ответа Google (D176): ошибка здесь не падает, а тихо пускает чужую почту.
import { describe, expect, test } from "vitest";

import { authorizationUrl, identityFromIdToken } from "./google";

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
