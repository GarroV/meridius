// Сид учёток открытого демо — на настоящей базе. Ошибка здесь не падает: либо на проде
// молча появляются учётки с входом без пароля, либо роль партнёра видит чужие страны.
import { randomUUID } from "node:crypto";

import { eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, test } from "vitest";

import { DEMO_ROLES, type DemoRole } from "@/blocks/core/demo";
import {
  accounts,
  countries,
  getDb,
  tenantCountries,
  tenants,
} from "@/blocks/data";

import { findLoginAccount, loadViewer } from "./accounts";
import { DemoAccountsRefused, seedDemoAccounts } from "./demo-accounts";

const CHEAP = { cost: 1024, blockSize: 8, parallelization: 1 } as const;
const SUFFIX = randomUUID().slice(0, 8);
const ROLES: readonly DemoRole[] = DEMO_ROLES.map((role) => ({
  ...role,
  login: `${role.login}-${SUFFIX}`,
}));
const COUNTRY = `Demoland ${SUFFIX}`;
const TENANT = `Demoland Partner ${SUFFIX}`;
const LOGINS = ROLES.map((role) => role.login);
const DEMO_ON = { DEMO_MODE: "1" };

function options() {
  return {
    roles: ROLES,
    countryName: COUNTRY,
    tenantName: TENANT,
    scrypt: CHEAP,
  };
}

async function accountRows() {
  return getDb()
    .select({
      id: accounts.id,
      login: accounts.login,
      hash: accounts.passwordHash,
    })
    .from(accounts)
    .where(inArray(accounts.login, LOGINS));
}

afterAll(async () => {
  const db = getDb();
  await db.delete(accounts).where(inArray(accounts.login, LOGINS));
  await db.delete(tenants).where(eq(tenants.name, TENANT));
  await db.delete(countries).where(eq(countries.name, COUNTRY));
});

describe("сид учёток демо", () => {
  test("без DEMO_MODE=1 отказывает и не заводит ничего", async () => {
    await getDb().insert(countries).values({ name: COUNTRY });

    for (const env of [{}, { DEMO_MODE: "true" }, { DEMO_MODE: "0" }]) {
      await expect(seedDemoAccounts(env, options())).rejects.toBeInstanceOf(
        DemoAccountsRefused,
      );
    }

    expect(await accountRows()).toHaveLength(0);
    const partnerTenants = await getDb()
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.name, TENANT));
    expect(partnerTenants).toHaveLength(0);
  });

  test("с флагом заводит УК и партнёра: партнёр привязан только к стране демо", async () => {
    await seedDemoAccounts(DEMO_ON, options());

    const rows = await accountRows();
    expect(rows.map((row) => row.login).sort()).toEqual([...LOGINS].sort());

    const hq = await findLoginAccount(ROLES[0]?.login ?? "");
    const partner = await findLoginAccount(ROLES[1]?.login ?? "");
    if (hq === null || partner === null) throw new Error("учётки не заведены");

    const hqViewer = await loadViewer({
      subject: hq.id,
      issuedAt: new Date(),
    });
    expect(hqViewer?.tenantKind).toBe("hq");

    const partnerViewer = await loadViewer({
      subject: partner.id,
      issuedAt: new Date(),
    });
    expect(partnerViewer?.tenantKind).toBe("partner");
    expect(partnerViewer?.tenantName).toBe(TENANT);
    const [country] = await getDb()
      .select({ id: countries.id })
      .from(countries)
      .where(eq(countries.name, COUNTRY));
    expect(partnerViewer?.countryIds).toEqual([country?.id]);
  });

  test("повторный прогон идемпотентен и не меняет пароли", async () => {
    const before = await accountRows();
    await seedDemoAccounts(DEMO_ON, options());
    const after = await accountRows();

    const key = (rows: typeof before) =>
      rows
        .map((row) => `${row.id}:${row.hash}`)
        .sort()
        .join("|");
    expect(after).toHaveLength(2);
    expect(key(after)).toBe(key(before));

    const tenantRows = await getDb()
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.name, TENANT));
    expect(tenantRows).toHaveLength(1);
    const links = await getDb()
      .select({ countryId: tenantCountries.countryId })
      .from(tenantCountries)
      .where(eq(tenantCountries.tenantId, tenantRows[0]?.id ?? ""));
    expect(links).toHaveLength(1);
  });

  test("пароль случаен: у двух учёток разные хэши, а сам пароль не возвращается", async () => {
    const rows = await accountRows();
    expect(new Set(rows.map((row) => row.hash)).size).toBe(rows.length);

    const result = await seedDemoAccounts(DEMO_ON, options());
    expect(JSON.stringify(result)).not.toMatch(/password|hash|scrypt/i);
  });
});

describe("сид отказывает, когда под именем демо лежит чужое", () => {
  const SUFFIX2 = randomUUID().slice(0, 8);
  const TENANT2 = `Demoland Partner ${SUFFIX2}`;
  const COUNTRY2 = `Demoland ${SUFFIX2}`;
  const OTHER_COUNTRY = `Other ${SUFFIX2}`;
  const login2 = `demo-partner-${SUFFIX2}`;
  const roles2: readonly DemoRole[] = [
    { key: "partner", login: login2, tenant: "partner" },
  ];
  const opts = {
    roles: roles2,
    countryName: COUNTRY2,
    tenantName: TENANT2,
    scrypt: CHEAP,
  };

  afterAll(async () => {
    const db = getDb();
    await db.delete(accounts).where(eq(accounts.login, login2));
    await db.delete(tenants).where(eq(tenants.name, TENANT2));
    await db
      .delete(countries)
      .where(inArray(countries.name, [COUNTRY2, OTHER_COUNTRY]));
  });

  test("у найденного тенанта есть страна, кроме демо-страны", async () => {
    const db = getDb();
    const [demo] = await db
      .insert(countries)
      .values({ name: COUNTRY2 })
      .returning({ id: countries.id });
    const [other] = await db
      .insert(countries)
      .values({ name: OTHER_COUNTRY })
      .returning({ id: countries.id });
    const [tenant] = await db
      .insert(tenants)
      .values({ kind: "partner", name: TENANT2 })
      .returning({ id: tenants.id });
    if (!demo || !other || !tenant) throw new Error("подготовка не удалась");
    await db.insert(tenantCountries).values([
      { tenantId: tenant.id, countryId: demo.id },
      { tenantId: tenant.id, countryId: other.id },
    ]);

    await expect(seedDemoAccounts(DEMO_ON, opts)).rejects.toThrow(
      /кроме демо-страны|чужие страны/,
    );
    const made = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.login, login2));
    expect(made).toHaveLength(0);
  });

  test("тенантов с таким именем больше одного", async () => {
    const db = getDb();
    await db.delete(tenants).where(eq(tenants.name, TENANT2));
    await db.insert(tenants).values([
      { kind: "partner", name: TENANT2 },
      { kind: "partner", name: TENANT2 },
    ]);
    await expect(seedDemoAccounts(DEMO_ON, opts)).rejects.toThrow(
      /больше одного/,
    );
  });

  test("учётка с привязанной почтой не принимается", async () => {
    const db = getDb();
    await db.delete(tenants).where(eq(tenants.name, TENANT2));
    await seedDemoAccounts(DEMO_ON, opts);
    await db
      .update(accounts)
      .set({ email: `x-${SUFFIX2}@example.com` })
      .where(eq(accounts.login, login2));
    await expect(seedDemoAccounts(DEMO_ON, opts)).rejects.toThrow(/почт/);
  });

  test("учётка чужого тенанта не принимается", async () => {
    const db = getDb();
    await db
      .update(accounts)
      .set({ email: null })
      .where(eq(accounts.login, login2));
    const [stranger] = await db
      .insert(tenants)
      .values({ kind: "partner", name: `Stranger ${SUFFIX2}` })
      .returning({ id: tenants.id });
    if (!stranger) throw new Error("подготовка не удалась");
    await db
      .update(accounts)
      .set({ tenantId: stranger.id })
      .where(eq(accounts.login, login2));
    await expect(seedDemoAccounts(DEMO_ON, opts)).rejects.toThrow(
      /другого тенанта/,
    );
    await db.delete(accounts).where(eq(accounts.login, login2));
    await db.delete(tenants).where(eq(tenants.id, stranger.id));
  });
});
