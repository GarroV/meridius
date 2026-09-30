// Учётки партнёров с экрана УК — на настоящей базе: ошибка здесь не падает, а тихо
// оставляет снятую учётку живой или меняет пароль не той учётке (T337, D169).
import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { accounts, countries, getDb, tenants } from "@/blocks/data";

import { findLoginAccount } from "./accounts";
import {
  changePartnerPassword,
  disablePartnerAccount,
  generatePartnerPassword,
  listPartnerAccounts,
  listPartnerTenantNames,
  resetPartnerPassword,
} from "./partners";
import { verifyPassword } from "./password";
import { MIN_PARTNER_PASSWORD_LENGTH, provisionPartner } from "./provision";

const CHEAP = { cost: 1024, blockSize: 8, parallelization: 1 } as const;
const PASSWORD = "длинный-пароль-партнёра";
const NEW_PASSWORD = "новый-длинный-пароль";
const MISSING_ID = "9d3f6f2a-0f1e-4a8b-8c2d-1f2b3c4d5e6f";

async function country(): Promise<string> {
  const name = `Страна ${randomUUID().slice(0, 8)}`;
  await getDb().insert(countries).values({ name });
  return name;
}

async function partner(): Promise<{
  accountId: string;
  login: string;
  tenantName: string;
  countryName: string;
}> {
  const countryName = await country();
  const tenantName = `Партнёр ${randomUUID().slice(0, 8)}`;
  const login = `p-${randomUUID().slice(0, 8)}`;
  const result = await provisionPartner(
    { tenantName, countryNames: [countryName], login, password: PASSWORD },
    CHEAP,
  );
  if (!result.ok) throw new Error(`партнёр не заведён: ${result.reason}`);
  return { accountId: result.accountId, login, tenantName, countryName };
}

async function storedHash(accountId: string): Promise<string> {
  const [row] = await getDb()
    .select({ hash: accounts.passwordHash })
    .from(accounts)
    .where(eq(accounts.id, accountId));
  if (row === undefined) throw new Error("учётки нет");
  return row.hash;
}

describe("listPartnerAccounts", () => {
  test("отдаёт учётку с её партнёром и странами, снятую — со сроком снятия", async () => {
    const live = await partner();
    const gone = await partner();
    await disablePartnerAccount(gone.accountId);

    const rows = await listPartnerAccounts();

    const liveRow = rows.find((row) => row.accountId === live.accountId);
    expect(liveRow).toMatchObject({
      login: live.login,
      tenantName: live.tenantName,
      countryNames: [live.countryName],
      disabledAt: null,
    });
    const goneRow = rows.find((row) => row.accountId === gone.accountId);
    expect(goneRow?.disabledAt).toBeInstanceOf(Date);
  });

  test("в хэши паролей не заглядывает: их в строке нет", async () => {
    const { accountId } = await partner();

    const row = (await listPartnerAccounts()).find(
      (r) => r.accountId === accountId,
    );

    expect(JSON.stringify(row)).not.toContain("scrypt");
  });
});

describe("changePartnerPassword", () => {
  test("новый пароль входит, прежний — нет, соседняя учётка не тронута", async () => {
    const target = await partner();
    const neighbour = await partner();
    const neighbourHash = await storedHash(neighbour.accountId);

    const result = await changePartnerPassword(
      target.accountId,
      NEW_PASSWORD,
      CHEAP,
    );

    expect(result).toEqual({ ok: true });
    const hash = await storedHash(target.accountId);
    await expect(verifyPassword(NEW_PASSWORD, hash)).resolves.toBe(true);
    await expect(verifyPassword(PASSWORD, hash)).resolves.toBe(false);
    expect(await storedHash(neighbour.accountId)).toBe(neighbourHash);
  });

  test("короткий пароль — отказ, прежний хэш на месте", async () => {
    const target = await partner();
    const before = await storedHash(target.accountId);

    const result = await changePartnerPassword(
      target.accountId,
      "x".repeat(MIN_PARTNER_PASSWORD_LENGTH - 1),
      CHEAP,
    );

    expect(result).toEqual({ ok: false, reason: "short-password" });
    expect(await storedHash(target.accountId)).toBe(before);
  });

  test("несуществующая учётка — отказ, а не молчаливый успех", async () => {
    await expect(
      changePartnerPassword(MISSING_ID, NEW_PASSWORD, CHEAP),
    ).resolves.toEqual({ ok: false, reason: "not-found" });
  });

  test("снятой учётке пароль не меняется: она не вернётся в строй сменой пароля", async () => {
    const target = await partner();
    await disablePartnerAccount(target.accountId);
    const before = await storedHash(target.accountId);

    const result = await changePartnerPassword(
      target.accountId,
      NEW_PASSWORD,
      CHEAP,
    );

    expect(result).toEqual({ ok: false, reason: "removed" });
    expect(await storedHash(target.accountId)).toBe(before);
  });
});

describe("resetPartnerPassword", () => {
  test("выдаёт новый пароль, и именно он входит", async () => {
    const target = await partner();

    const result = await resetPartnerPassword(target.accountId, CHEAP);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.password.length).toBeGreaterThanOrEqual(
      MIN_PARTNER_PASSWORD_LENGTH,
    );
    const hash = await storedHash(target.accountId);
    await expect(verifyPassword(result.password, hash)).resolves.toBe(true);
    await expect(verifyPassword(PASSWORD, hash)).resolves.toBe(false);
  });

  test("несуществующая учётка — отказ", async () => {
    await expect(resetPartnerPassword(MISSING_ID, CHEAP)).resolves.toEqual({
      ok: false,
      reason: "not-found",
    });
  });
});

describe("generatePartnerPassword", () => {
  test("не короче порога и каждый раз другой", () => {
    const seen = new Set(
      Array.from({ length: 50 }, () => generatePartnerPassword()),
    );

    expect(seen.size).toBe(50);
    for (const password of seen) {
      expect(password.length).toBeGreaterThanOrEqual(
        MIN_PARTNER_PASSWORD_LENGTH,
      );
    }
  });
});

describe("disablePartnerAccount", () => {
  test("снятая учётка больше не находится для входа", async () => {
    const target = await partner();

    await expect(disablePartnerAccount(target.accountId)).resolves.toEqual({
      ok: true,
    });

    await expect(findLoginAccount(target.login)).resolves.toBeNull();
  });

  test("повторное снятие не сдвигает срок снятия", async () => {
    const target = await partner();
    await disablePartnerAccount(target.accountId);
    const first = (await listPartnerAccounts()).find(
      (row) => row.accountId === target.accountId,
    )?.disabledAt;

    await expect(disablePartnerAccount(target.accountId)).resolves.toEqual({
      ok: true,
    });

    const second = (await listPartnerAccounts()).find(
      (row) => row.accountId === target.accountId,
    )?.disabledAt;
    expect(second?.getTime()).toBe(first?.getTime());
  });

  test("несуществующая учётка — отказ", async () => {
    await expect(disablePartnerAccount(MISSING_ID)).resolves.toEqual({
      ok: false,
      reason: "not-found",
    });
  });

  test("снимает только свою учётку", async () => {
    const target = await partner();
    const neighbour = await partner();

    await disablePartnerAccount(target.accountId);

    await expect(findLoginAccount(neighbour.login)).resolves.not.toBeNull();
  });
});

describe("listPartnerTenantNames", () => {
  test("подсказывает только партнёров: УК в списке двойников не появляется никогда", async () => {
    const { tenantName } = await partner();
    const hq = await getDb()
      .select({ name: tenants.name })
      .from(tenants)
      .where(eq(tenants.kind, "hq"));

    const names = await listPartnerTenantNames();

    expect(names).toContain(tenantName);
    expect(hq.length).toBeGreaterThan(0);
    for (const { name } of hq) expect(names).not.toContain(name);
  });
});
