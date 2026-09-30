// Почта учётки для входа через Google — на настоящей базе (D176): ошибка здесь не
// падает, а пускает человека не в ту учётку или в снятую.
import { randomUUID } from "node:crypto";

import { describe, expect, test } from "vitest";

import { countries, getDb } from "@/blocks/data";

import { loadViewer } from "./accounts";
import {
  bindAccountEmail,
  findEmailAccount,
  isUniqueViolation,
  normalizeEmail,
} from "./emails";
import { provisionHqMember } from "./hq-members";
import { disablePartnerAccount } from "./partners";
import { provisionPartner } from "./provision";

const CHEAP = { cost: 1024, blockSize: 8, parallelization: 1 } as const;
const MISSING_ID = "9d3f6f2a-0f1e-4a8b-8c2d-1f2b3c4d5e6f";

function unique(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

async function partnerAccount(): Promise<string> {
  const countryName = unique("Страна");
  await getDb().insert(countries).values({ name: countryName });
  const result = await provisionPartner(
    {
      tenantName: unique("Партнёр"),
      countryNames: [countryName],
      login: unique("p"),
      password: "длинный-пароль-партнёра",
    },
    CHEAP,
  );
  if (!result.ok) throw new Error(`партнёр не заведён: ${result.reason}`);
  return result.accountId;
}

describe("приведение почты", () => {
  test("пробелы и регистр не делают почту другой", () => {
    expect(normalizeEmail("  Ivan@DodoBrands.io ")).toBe("ivan@dodobrands.io");
  });

  test.each(["", "ivan", "ivan@", "@dodobrands.io", "ivan@host", 42])(
    "%s — не почта",
    (raw) => {
      expect(normalizeEmail(raw)).toBeNull();
    },
  );
});

describe("привязка почты и вход по ней", () => {
  test("привязанная почта находит свою учётку, в любом регистре", async () => {
    const accountId = await partnerAccount();
    const email = `${unique("ivan")}@partner.example`;

    expect(await bindAccountEmail(accountId, email.toUpperCase())).toEqual({
      ok: true,
      email,
    });
    expect(await findEmailAccount(` ${email.toUpperCase()} `)).toEqual({
      id: accountId,
    });
  });

  test("неизвестная почта учётку не находит и не заводит", async () => {
    expect(
      await findEmailAccount(`${unique("nobody")}@dodobrands.io`),
    ).toBeNull();
  });

  test("одна почта не открывает двух учёток", async () => {
    const first = await partnerAccount();
    const second = await partnerAccount();
    const email = `${unique("shared")}@partner.example`;

    await bindAccountEmail(first, email);
    expect(await bindAccountEmail(second, email)).toEqual({
      ok: false,
      reason: "email-taken",
    });
    expect(await findEmailAccount(email)).toEqual({ id: first });
  });

  test("пустое поле отвязывает: по почте больше не входят", async () => {
    const accountId = await partnerAccount();
    const email = `${unique("gone")}@partner.example`;
    await bindAccountEmail(accountId, email);

    expect(await bindAccountEmail(accountId, "  ")).toEqual({
      ok: true,
      email: null,
    });
    expect(await findEmailAccount(email)).toBeNull();
  });

  test("снятая учётка по почте не находится, и почту ей не привязать", async () => {
    const accountId = await partnerAccount();
    const email = `${unique("removed")}@partner.example`;
    await bindAccountEmail(accountId, email);
    await disablePartnerAccount(accountId);

    expect(await findEmailAccount(email)).toBeNull();
    expect(
      await bindAccountEmail(accountId, `${unique("x")}@partner.example`),
    ).toEqual({ ok: false, reason: "removed" });
  });

  test("не почта и несуществующая учётка — отказ с причиной", async () => {
    const accountId = await partnerAccount();
    expect(await bindAccountEmail(accountId, "не-почта")).toEqual({
      ok: false,
      reason: "email-shape",
    });
    expect(
      await bindAccountEmail(MISSING_ID, `${unique("y")}@partner.example`),
    ).toEqual({ ok: false, reason: "not-found" });
  });
});

describe("сотрудник УК", () => {
  test("входит по почте и видит всю сеть, а не страны партнёра", async () => {
    const email = `${unique("hq")}@dodobrands.io`;
    const result = await provisionHqMember(
      { login: unique("hq"), email },
      CHEAP,
    );
    if (!result.ok) throw new Error(result.reason);

    const found = await findEmailAccount(email);
    expect(found).toEqual({ id: result.accountId });
    const viewer = await loadViewer({
      subject: result.accountId,
      issuedAt: new Date(),
    });
    expect(viewer?.tenantKind).toBe("hq");
    expect(viewer?.countryIds).toEqual([]);
  });

  test("без почты, с логином admin и с занятым логином или почтой — отказ", async () => {
    const login = unique("hq");
    const email = `${unique("hq")}@dodobrands.io`;
    await provisionHqMember({ login, email }, CHEAP);

    expect(
      await provisionHqMember({ login: unique("hq"), email: "" }, CHEAP),
    ).toEqual({ ok: false, reason: "email-shape" });
    expect(
      await provisionHqMember(
        { login: "Admin", email: `${unique("a")}@x.io` },
        CHEAP,
      ),
    ).toEqual({ ok: false, reason: "root-login" });
    expect(
      await provisionHqMember(
        { login: "Не Логин", email: `${unique("c")}@x.io` },
        CHEAP,
      ),
    ).toEqual({ ok: false, reason: "login-shape" });
    expect(
      await provisionHqMember({ login, email: `${unique("b")}@x.io` }, CHEAP),
    ).toEqual({ ok: false, reason: "login-taken" });
    expect(
      await provisionHqMember({ login: unique("hq"), email }, CHEAP),
    ).toEqual({ ok: false, reason: "email-taken" });
  });
});

test("сбой базы, не связанный с уникальностью, не выдаётся за «почта занята»", async () => {
  await expect(
    bindAccountEmail("не-uuid", `${unique("z")}@partner.example`),
  ).rejects.toThrow();
});

describe("узнаём нарушение уникальности", () => {
  test.each([
    ["код на самой ошибке", { code: "23505" }, true],
    ["код в cause (обёртка Drizzle)", { cause: { code: "23505" } }, true],
    ["другая ошибка базы", { code: "23503" }, false],
    ["не объект", "строка", false],
    ["null", null, false],
  ])("%s", (_name, error, expected) => {
    expect(isUniqueViolation(error)).toBe(expected);
  });
});
