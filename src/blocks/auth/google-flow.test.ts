// Возврат от Google: причина отказа остаётся в журнале сервера (issue #238),
// а человеку отказ по-прежнему один и тот же.
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
  vi,
  type MockInstance,
} from "vitest";

import { finishGoogleSignIn } from "./google-flow";

const { cookieStore, exchangeCode, identityFromIdToken, findEmailAccount } =
  vi.hoisted(() => ({
    cookieStore: { get: vi.fn(), delete: vi.fn(), set: vi.fn() },
    exchangeCode: vi.fn(),
    identityFromIdToken: vi.fn(),
    findEmailAccount: vi.fn(),
  }));

vi.mock("next/headers", () => ({
  cookies: () => Promise.resolve(cookieStore),
  headers: () => Promise.resolve(new Headers()),
}));
vi.mock("./config", () => ({ sessionSecret: () => "secret" }));
vi.mock("./emails", () => ({ findEmailAccount }));
vi.mock("./session-cookie", () => ({ setSessionCookie: vi.fn() }));
vi.mock("./google", () => ({
  FRONT_MARKER_HEADER: "x-front",
  authorizationUrl: vi.fn(),
  newState: vi.fn(),
  googleSettings: () => ({
    clientId: "client",
    clientSecret: "s",
    redirectUri: "r",
  }),
  exchangeCode,
  identityFromIdToken,
}));

const ADDRESS = "someone@example.test";

function back(query: string): URL {
  return new URL(`https://app.test/admin/login/google/callback?${query}`);
}

describe("причина отказа Google в журнале", () => {
  let warn: MockInstance<typeof console.warn>;

  beforeEach(() => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => {
      /* журнал не засоряем */
    });
    cookieStore.get.mockReturnValue({ value: "abc" });
    exchangeCode.mockResolvedValue("jwt");
    identityFromIdToken.mockReturnValue({ email: ADDRESS });
    findEmailAccount.mockResolvedValue({ id: "u1" });
  });
  afterEach(() => vi.restoreAllMocks());

  async function reasonOf(query: string): Promise<string> {
    const response = await finishGoogleSignIn(back(query));
    expect(response.headers.get("location")).toContain("google=failed");
    const line = warn.mock.calls.at(-1);
    const text = JSON.stringify(line);
    expect(text).not.toContain(ADDRESS);
    return String(line?.[1]);
  }

  test("не та метка", async () => {
    expect(await reasonOf("code=c&state=other")).toBe("state-mismatch");
  });
  test("нет кода", async () => {
    expect(await reasonOf("state=abc")).toBe("no-code");
  });
  test("Google не отдал id_token", async () => {
    exchangeCode.mockResolvedValue(null);
    expect(await reasonOf("code=c&state=abc")).toBe("no-id-token");
  });
  test("токен не прошёл проверку", async () => {
    identityFromIdToken.mockReturnValue(null);
    expect(await reasonOf("code=c&state=abc")).toBe("bad-id-token");
  });
  test("почта не привязана или учётка снята", async () => {
    findEmailAccount.mockResolvedValue(null);
    expect(await reasonOf("code=c&state=abc")).toBe("email-unbound");
  });
  test("успешный вход ничего не пишет в журнал отказов", async () => {
    const response = await finishGoogleSignIn(back("code=c&state=abc"));
    expect(response.headers.get("location")).not.toContain("google=failed");
    expect(warn).not.toHaveBeenCalled();
  });
});
