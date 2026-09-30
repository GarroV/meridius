// Заведение партнёра — на настоящей базе: ошибка здесь не падает, а тихо отдаёт
// партнёру чужую страну или пускает второй учёткой под чужим тенантом.
import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { accounts, countries, getDb, tenantCountries } from "@/blocks/data";

import { findLoginAccount, loadViewer } from "./accounts";
import { verifyPassword } from "./password";
import { provisionPartner, type PartnerInput } from "./provision";

const CHEAP = { cost: 1024, blockSize: 8, parallelization: 1 } as const;
const PASSWORD = "длинный-пароль-партнёра";

async function country(): Promise<{ id: string; name: string }> {
  const name = `Страна ${randomUUID().slice(0, 8)}`;
  const [row] = await getDb()
    .insert(countries)
    .values({ name })
    .returning({ id: countries.id });
  if (row === undefined) throw new Error("страна не вставилась");
  return { id: row.id, name };
}

function input(overrides: Partial<PartnerInput>): PartnerInput {
  return {
    tenantName: `Партнёр ${randomUUID().slice(0, 8)}`,
    countryNames: [],
    login: `p-${randomUUID().slice(0, 8)}`,
    password: PASSWORD,
    ...overrides,
  };
}

describe("provisionPartner", () => {
  test("заводит тенант со странами и учётку, которая видит ровно их", async () => {
    const mine = await country();
    await country(); // чужая: не должна попасть в область

    const result = await provisionPartner(
      input({ countryNames: [mine.name], login: "  Partner.One-X " }),
      CHEAP,
    );
    expect(result).toMatchObject({ ok: true, tenantCreated: true });
    if (!result.ok) return;

    const account = await findLoginAccount("partner.one-x");
    expect(account?.id).toBe(result.accountId);
    expect(await verifyPassword(PASSWORD, account?.passwordHash ?? "")).toBe(
      true,
    );
    const viewer = await loadViewer({
      subject: result.accountId,
      issuedAt: new Date(),
    });
    expect(viewer).toMatchObject({
      tenantKind: "partner",
      tenantId: result.tenantId,
      countryIds: [mine.id],
    });
  });

  test("второй вызов с тем же тенантом добавляет страны и учётку, старое не снимает", async () => {
    const first = await country();
    const second = await country();
    const tenantName = `Партнёр ${randomUUID().slice(0, 8)}`;

    const a = await provisionPartner(
      input({ tenantName, countryNames: [first.name] }),
      CHEAP,
    );
    const b = await provisionPartner(
      input({ tenantName, countryNames: [second.name, first.name] }),
      CHEAP,
    );
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(b.tenantCreated).toBe(false);
    expect(b.tenantId).toBe(a.tenantId);

    const rows = await getDb()
      .select({ countryId: tenantCountries.countryId })
      .from(tenantCountries)
      .where(eq(tenantCountries.tenantId, a.tenantId));
    expect(rows.map((row) => row.countryId).sort()).toEqual(
      [first.id, second.id].sort(),
    );
  });

  test("неизвестная страна — отказ, и в базе не остаётся ни тенанта, ни учётки", async () => {
    const known = await country();
    const login = `p-${randomUUID().slice(0, 8)}`;
    const result = await provisionPartner(
      input({ login, countryNames: [known.name, "Нет такой страны"] }),
      CHEAP,
    );
    expect(result).toEqual({
      ok: false,
      reason: "unknown-country",
      detail: "Нет такой страны",
    });
    expect(await findLoginAccount(login)).toBeNull();
  });

  test.each([
    ["root-login", { login: "admin" }],
    ["login-shape", { login: "плохой логин" }],
    ["short-password", { password: "короткий" }],
    ["tenant-name", { tenantName: "  " }],
    ["no-countries", { countryNames: [] }],
    ["hq-tenant", { tenantName: "УК" }],
  ] as const)("отказ %s", async (reason, overrides) => {
    const somewhere = await country();
    const result = await provisionPartner(
      input({ countryNames: [somewhere.name], ...overrides }),
      CHEAP,
    );
    expect(result).toMatchObject({ ok: false, reason });
  });

  test("занятый логин — отказ, чужая учётка не переезжает в другой тенант", async () => {
    const somewhere = await country();
    const login = `p-${randomUUID().slice(0, 8)}`;
    const first = await provisionPartner(
      input({ login, countryNames: [somewhere.name] }),
      CHEAP,
    );
    const again = await provisionPartner(
      input({ login, countryNames: [somewhere.name] }),
      CHEAP,
    );
    expect(again).toEqual({ ok: false, reason: "login-taken" });
    if (!first.ok) throw new Error("первое заведение не прошло");
    const [row] = await getDb()
      .select({ tenantId: accounts.tenantId })
      .from(accounts)
      .where(eq(accounts.login, login));
    expect(row?.tenantId).toBe(first.tenantId);
  });
});
