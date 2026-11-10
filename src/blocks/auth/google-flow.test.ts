// Возврат от Google (D176, #238): человеку отказ один на все причины, а в журнале у
// каждой причины свой код. Без кода причины отказ в журнале — «что-то не сошлось», и
// по жалобе «Google не пускает» не понять, где именно (метка, обмен, почта).
//
// Проверяются два обещания: код причины в журнале на каждом пути отказа, и ни почты,
// ни кода, ни токена в строке журнала.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const SETTINGS = {
  clientId: "meridius.apps.googleusercontent.com",
  clientSecret: "секрет-клиента",
  redirectUri: "https://meridius.example/admin/login/google/callback",
};
const STATE = "метка-входа-1234567890";
const CODE = "код-возврата-от-google";
const ID_TOKEN = "заголовок.содержимое.подпись";
const EMAIL = "ivan@dodobrands.io";

const mocks = vi.hoisted(() => ({
  cookieValue: undefined as string | undefined,
  exchangeCode: vi.fn(),
  identityFromIdToken: vi.fn(),
  findEmailAccount: vi.fn(),
  setSessionCookie: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve({ get: () => null }),
  cookies: () =>
    Promise.resolve({
      get: () =>
        mocks.cookieValue === undefined
          ? undefined
          : { value: mocks.cookieValue },
      delete: () => undefined,
      set: () => undefined,
    }),
}));
vi.mock("./config", () => ({ sessionSecret: () => "x".repeat(40) }));
vi.mock("./emails", () => ({ findEmailAccount: mocks.findEmailAccount }));
vi.mock("./session-cookie", () => ({
  setSessionCookie: mocks.setSessionCookie,
}));
vi.mock("./google", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./google")>()),
  googleSettings: () => SETTINGS,
  exchangeCode: mocks.exchangeCode,
  identityFromIdToken: mocks.identityFromIdToken,
}));

import { finishGoogleSignIn } from "./google-flow";

function returnUrl(params: Record<string, string>): URL {
  const url = new URL("https://meridius.example/admin/login/google/callback");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url;
}

let warn: ReturnType<typeof vi.spyOn>;
let error: ReturnType<typeof vi.spyOn>;

/** Всё, что flow написал в журнал, одной строкой: по ней ищем утечки. */
function logged(): string {
  return [...warn.mock.calls, ...error.mock.calls]
    .flat()
    .map(String)
    .join(" | ");
}

function warnedLines(): string[] {
  return warn.mock.calls.map((call) => call.map(String).join(" "));
}

function isRefusal(response: Response): boolean {
  return (
    response.status === 303 &&
    response.headers.get("location") === "/admin/login?google=failed"
  );
}

beforeEach(() => {
  mocks.cookieValue = STATE;
  mocks.exchangeCode.mockReset().mockResolvedValue(ID_TOKEN);
  mocks.identityFromIdToken.mockReset().mockReturnValue({ email: EMAIL });
  mocks.findEmailAccount.mockReset().mockResolvedValue({ id: "учётка-1" });
  mocks.setSessionCookie.mockReset().mockResolvedValue(undefined);
  warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  error = vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("причина отказа в журнале", () => {
  const cases: ReadonlyArray<{
    name: string;
    reason: string;
    arrange: () => URL;
  }> = [
    {
      name: "метка не та",
      reason: "state-mismatch",
      arrange: () => returnUrl({ code: CODE, state: "чужая-метка" }),
    },
    {
      name: "куки с меткой нет",
      reason: "state-mismatch",
      arrange: () => {
        mocks.cookieValue = undefined;
        return returnUrl({ code: CODE, state: STATE });
      },
    },
    {
      name: "кода в адресе нет",
      reason: "no-code",
      arrange: () => returnUrl({ state: STATE }),
    },
    {
      name: "Google вернул error=",
      reason: "google-error",
      arrange: () => returnUrl({ error: "access_denied", state: STATE }),
    },
    {
      name: "обмен кода упал",
      reason: "exchange-failed",
      arrange: () => {
        mocks.exchangeCode.mockRejectedValue(new Error("сеть легла"));
        return returnUrl({ code: CODE, state: STATE });
      },
    },
    {
      name: "Google не дал id_token",
      reason: "no-id-token",
      arrange: () => {
        mocks.exchangeCode.mockResolvedValue(null);
        return returnUrl({ code: CODE, state: STATE });
      },
    },
    {
      name: "id_token не разобрался",
      reason: "bad-id-token",
      arrange: () => {
        mocks.identityFromIdToken.mockReturnValue(null);
        return returnUrl({ code: CODE, state: STATE });
      },
    },
    {
      name: "почта ни к чему не привязана",
      reason: "email-unbound",
      arrange: () => {
        mocks.findEmailAccount.mockResolvedValue(null);
        return returnUrl({ code: CODE, state: STATE });
      },
    },
  ];

  test.each(cases)(
    "$name: код $reason в журнале, человеку единый отказ",
    async ({ reason, arrange }) => {
      const response = await finishGoogleSignIn(arrange());

      expect(isRefusal(response)).toBe(true);
      expect(warnedLines().some((line) => line.includes(reason))).toBe(true);
      expect(mocks.setSessionCookie).not.toHaveBeenCalled();
    },
  );

  test("в журнале нет ни почты, ни кода, ни токена, ни метки, ни ответа Google", async () => {
    mocks.findEmailAccount.mockResolvedValue(null);
    await finishGoogleSignIn(returnUrl({ code: CODE, state: STATE }));
    mocks.exchangeCode.mockRejectedValue(
      new Error(`${CODE} ${ID_TOKEN} ${EMAIL}`),
    );
    await finishGoogleSignIn(returnUrl({ code: CODE, state: STATE }));
    await finishGoogleSignIn(
      returnUrl({ error: `access_denied ${EMAIL}`, state: STATE }),
    );

    const text = logged();
    expect(text).not.toBe("");
    for (const secret of [EMAIL, CODE, ID_TOKEN, STATE, "access_denied"]) {
      expect(text).not.toContain(secret);
    }
  });

  test("успешный вход ничего не пишет как отказ", async () => {
    const response = await finishGoogleSignIn(
      returnUrl({ code: CODE, state: STATE }),
    );

    expect(response.headers.get("location")).toBe("/admin");
    expect(warn).not.toHaveBeenCalled();
    expect(mocks.setSessionCookie).toHaveBeenCalledOnce();
  });
});

describe("повтор обмена кода", () => {
  function timeout(): Error {
    return new DOMException("The operation timed out.", "TimeoutError");
  }

  test("тайм-аут с первого раза и успех со второго — вход проходит", async () => {
    mocks.exchangeCode
      .mockRejectedValueOnce(timeout())
      .mockResolvedValueOnce(ID_TOKEN);

    const response = await finishGoogleSignIn(
      returnUrl({ code: CODE, state: STATE }),
    );

    expect(mocks.exchangeCode).toHaveBeenCalledTimes(2);
    expect(response.headers.get("location")).toBe("/admin");
  });

  test("сетевая ошибка (TypeError fetch) тоже повторяется один раз", async () => {
    mocks.exchangeCode
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(ID_TOKEN);

    const response = await finishGoogleSignIn(
      returnUrl({ code: CODE, state: STATE }),
    );

    expect(mocks.exchangeCode).toHaveBeenCalledTimes(2);
    expect(response.headers.get("location")).toBe("/admin");
  });

  test("два тайм-аута подряд — отказ как раньше, не больше двух попыток", async () => {
    mocks.exchangeCode.mockRejectedValue(timeout());

    const response = await finishGoogleSignIn(
      returnUrl({ code: CODE, state: STATE }),
    );

    expect(mocks.exchangeCode).toHaveBeenCalledTimes(2);
    expect(isRefusal(response)).toBe(true);
    expect(warnedLines().some((line) => line.includes("exchange-failed"))).toBe(
      true,
    );
  });

  test("не сетевой сбой не повторяется: код одноразовый, повтор ничего не даст", async () => {
    mocks.exchangeCode.mockRejectedValue(new SyntaxError("не json"));

    const response = await finishGoogleSignIn(
      returnUrl({ code: CODE, state: STATE }),
    );

    expect(mocks.exchangeCode).toHaveBeenCalledTimes(1);
    expect(isRefusal(response)).toBe(true);
  });

  test("отказ Google (null) не повторяется", async () => {
    mocks.exchangeCode.mockResolvedValue(null);

    await finishGoogleSignIn(returnUrl({ code: CODE, state: STATE }));

    expect(mocks.exchangeCode).toHaveBeenCalledTimes(1);
  });
});
