// Кто вошёл и что он видит — проверяется на настоящей базе: весь смысл этих функций в
// том, какие строки они отдают, а подмена базы проверила бы саму подмену.
import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import {
  accounts,
  countries,
  getDb,
  tenantCountries,
  tenants,
} from "@/blocks/data";

import {
  ROOT_LOGIN,
  findLoginAccount,
  hqTenantId,
  loadViewer,
  normalizeLogin,
} from "./accounts";
import { ROOT_SUBJECT } from "./session";

const HASH = "scrypt.2.1.1.c29sdA.a2V5";

async function country(name: string): Promise<string> {
  const [row] = await getDb()
    .insert(countries)
    .values({ name })
    .returning({ id: countries.id });
  if (row === undefined) throw new Error("страна не вставилась");
  return row.id;
}

async function partnerWith(countryIds: readonly string[]): Promise<string> {
  const [row] = await getDb()
    .insert(tenants)
    .values({ kind: "partner", name: `Партнёр ${randomUUID().slice(0, 8)}` })
    .returning({ id: tenants.id });
  if (row === undefined) throw new Error("тенант не вставился");
  if (countryIds.length > 0) {
    await getDb()
      .insert(tenantCountries)
      .values(countryIds.map((countryId) => ({ tenantId: row.id, countryId })));
  }
  return row.id;
}

async function account(tenantId: string, disabled = false): Promise<string> {
  const [row] = await getDb()
    .insert(accounts)
    .values({
      tenantId,
      login: `p-${randomUUID().slice(0, 12)}`,
      passwordHash: HASH,
      disabledAt: disabled ? new Date() : null,
    })
    .returning({ id: accounts.id });
  if (row === undefined) throw new Error("учётка не вставилась");
  return row.id;
}

describe("loadViewer", () => {
  test("учётка УК из окружения — тенант УК из базы", async () => {
    const viewer = await loadViewer(ROOT_SUBJECT);
    expect(viewer?.tenantKind).toBe("hq");
    expect(viewer?.tenantId).toBe(await hqTenantId());
    expect(viewer?.accountId).toBeNull();
    expect(viewer?.login).toBe(ROOT_LOGIN);
  });

  test("учётка партнёра видит ровно страны своего тенанта", async () => {
    const mine = await country("Своя");
    await country("Чужая");
    const tenantId = await partnerWith([mine]);
    const viewer = await loadViewer(await account(tenantId));

    expect(viewer?.tenantKind).toBe("partner");
    expect(viewer?.tenantId).toBe(tenantId);
    expect(viewer?.countryIds).toEqual([mine]);
  });

  test("страны не протекают от соседнего партнёра", async () => {
    const mine = await country("Моя");
    const theirs = await country("Соседская");
    const tenantId = await partnerWith([mine]);
    await partnerWith([theirs]);
    const viewer = await loadViewer(await account(tenantId));

    expect(viewer?.countryIds).not.toContain(theirs);
  });

  test("снятая учётка не входит, даже с годной кукой", async () => {
    const tenantId = await partnerWith([]);
    expect(await loadViewer(await account(tenantId, true))).toBeNull();
  });

  test("несуществующая учётка — никто", async () => {
    expect(await loadViewer(randomUUID())).toBeNull();
  });

  test("отобранная страна пропадает сразу, без нового входа", async () => {
    const mine = await country("Отбираемая");
    const tenantId = await partnerWith([mine]);
    const id = await account(tenantId);
    await getDb()
      .delete(tenantCountries)
      .where(eq(tenantCountries.tenantId, tenantId));

    expect((await loadViewer(id))?.countryIds).toEqual([]);
  });
});

describe("findLoginAccount", () => {
  test("находит действующую учётку по логину", async () => {
    const tenantId = await partnerWith([]);
    const id = await account(tenantId);
    const [row] = await getDb()
      .select({ login: accounts.login })
      .from(accounts)
      .where(eq(accounts.id, id));
    expect((await findLoginAccount(row?.login ?? ""))?.id).toBe(id);
  });

  test("снятая учётка по логину не находится", async () => {
    const tenantId = await partnerWith([]);
    const id = await account(tenantId, true);
    const [row] = await getDb()
      .select({ login: accounts.login })
      .from(accounts)
      .where(eq(accounts.id, id));
    expect(await findLoginAccount(row?.login ?? "")).toBeNull();
  });

  test("неизвестный логин — null", async () => {
    expect(await findLoginAccount("nobody-here")).toBeNull();
  });
});

describe("normalizeLogin", () => {
  test("регистр и пробелы по краям не делают второй учётки", () => {
    expect(normalizeLogin("  KZ.Partner ")).toBe("kz.partner");
  });

  test("не того вида — null", () => {
    for (const raw of ["", "ab", "с кириллицей", "a b c", "x".repeat(65), 42]) {
      expect(normalizeLogin(raw)).toBeNull();
    }
  });
});
