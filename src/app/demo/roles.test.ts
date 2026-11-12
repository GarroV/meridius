// Демо-режим на настоящей базе: посев идемпотентен, а роль с экрана `/demo` открывает
// ровно ту область, что обещает карточка (D193). Ядро: ошибка здесь — партнёр, который
// видит чужую страну, или УК без сети, и выглядит это как исправный экран.
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadViewer } from "@/blocks/auth/accounts";
import { canSeeCountry, scopeOf } from "@/blocks/auth/scope";
import {
  accounts,
  checklists,
  countries,
  stations,
  stores,
  submissions,
} from "@/blocks/data";
import { closeTestDb, getTestDb } from "@/blocks/data/testing/db";
import {
  COUNTRY_DEMOLAND_ID,
  COUNTRY_FREEDONIA_ID,
  COUNTRY_RURITANIA_ID,
  DEMO_ACCOUNTS,
  DEMO_ROLES,
  TENANT_FREEDONIA_ID,
  findDemoRole,
  seedDemo,
} from "@/blocks/demo";
import type { DemoDataset } from "@/blocks/demo/model";
import { showcaseDatasets } from "@/blocks/demo/showcase";

const NOW = new Date("2026-11-10T12:00:00.000Z");
const COUNTRY_IDS = [
  COUNTRY_DEMOLAND_ID,
  COUNTRY_FREEDONIA_ID,
  COUNTRY_RURITANIA_ID,
];
const PARTNER_COUNTRY_IDS = [COUNTRY_FREEDONIA_ID, COUNTRY_RURITANIA_ID];
const db = getTestDb();

// Демоland здесь НЕ сажается: его строки делят с `seed.test.ts` и `smoke.test.ts` общую
// тестовую базу, а файлы тестов идут параллельно — чужой пересев посреди их сверки дал бы
// ложное падение. Страны партнёров принадлежат только демо-режиму, их можно сажать свободно.
// Учётка УК лежит в описании Demoland, поэтому пристёгивается ко второму описанию.
const [, freedonia, ruritania] = showcaseDatasets();
if (freedonia === undefined || ruritania === undefined) {
  throw new Error("В демо-режиме нет двух стран партнёров");
}
const partnerCountries: readonly DemoDataset[] = [
  {
    ...freedonia,
    accounts: [
      ...DEMO_ACCOUNTS.filter((account) => account.tenantId === undefined),
      ...(freedonia.accounts ?? []),
    ],
  },
  ruritania,
];

async function seedPartnerCountries(): Promise<void> {
  for (const dataset of partnerCountries) {
    await seedDemo({ now: NOW, dataset });
  }
}

async function snapshot() {
  return {
    countries: await db
      .select({ id: countries.id })
      .from(countries)
      .where(inArray(countries.id, PARTNER_COUNTRY_IDS))
      .then((rows) => rows.length),
    stores: await db
      .select({ id: stores.id })
      .from(stores)
      .where(inArray(stores.countryId, PARTNER_COUNTRY_IDS))
      .then((rows) => rows.length),
    submissions: await db
      .select({ id: submissions.id })
      .from(submissions)
      .innerJoin(stations, eq(stations.id, submissions.stationId))
      .innerJoin(stores, eq(stores.id, stations.storeId))
      .where(inArray(stores.countryId, PARTNER_COUNTRY_IDS))
      .then((rows) => rows.length),
    accounts: await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(
        inArray(
          accounts.id,
          DEMO_ACCOUNTS.map((a) => a.id),
        ),
      )
      .then((rows) => rows.map((r) => r.id).sort()),
  };
}

describe("демо-режим: посев и роли", () => {
  beforeAll(async () => {
    await seedPartnerCountries();
  });
  afterAll(async () => {
    await closeTestDb();
  });

  it("повторный посев возвращает то же самое: без дублей, учётки на месте", async () => {
    const first = await snapshot();
    await seedPartnerCountries();
    expect(await snapshot()).toEqual(first);
    expect(first.countries).toBe(2);
    expect(first.stores).toBe(5);
    expect(first.submissions).toBeGreaterThan(300);
    expect(first.accounts).toHaveLength(3);
  });

  it("УК, зашедшая с экрана выбора, видит всю сеть", async () => {
    const role = findDemoRole("hq");
    expect(role).toBeDefined();
    const viewer = await loadViewer({
      subject: role?.accountId ?? "",
      issuedAt: new Date(),
    });
    expect(viewer?.tenantKind).toBe("hq");
    if (viewer === null) throw new Error("УК не вошла");
    for (const id of COUNTRY_IDS) {
      expect(canSeeCountry(scopeOf(viewer), id)).toBe(true);
    }
  });

  it("каждый партнёр видит только свою страну", async () => {
    const partners = DEMO_ROLES.filter((role) => role.kind === "partner");
    expect(partners).toHaveLength(2);
    for (const role of partners) {
      const viewer = await loadViewer({
        subject: role.accountId,
        issuedAt: new Date(),
      });
      expect(viewer?.tenantKind).toBe("partner");
      if (viewer === null) throw new Error("партнёр не вошёл");
      const visible = COUNTRY_IDS.filter((id) =>
        canSeeCountry(scopeOf(viewer), id),
      );
      expect(visible).toHaveLength(1);
      expect(visible[0]).not.toBe(COUNTRY_DEMOLAND_ID);
      expect(viewer.countryIds).toEqual(visible);
    }
  });

  it("чек-листы страны партнёра принадлежат партнёру", async () => {
    const owned = await db
      .select({ id: checklists.id })
      .from(checklists)
      .where(eq(checklists.tenantId, TENANT_FREEDONIA_ID));
    expect(owned.length).toBeGreaterThan(0);
  });

  it("посев возвращает в строй снятую учётку: демо не остаётся запертым", async () => {
    const role = findDemoRole("partner-sunrise");
    await db
      .update(accounts)
      .set({ disabledAt: new Date() })
      .where(eq(accounts.id, role?.accountId ?? ""));
    expect(
      await loadViewer({
        subject: role?.accountId ?? "",
        issuedAt: new Date(),
      }),
    ).toBeNull();

    await seedPartnerCountries();
    expect(
      await loadViewer({
        subject: role?.accountId ?? "",
        issuedAt: new Date(),
      }),
    ).not.toBeNull();
  });

  it("чужой ключ роли не находится", () => {
    expect(findDemoRole("admin")).toBeUndefined();
    expect(findDemoRole(undefined)).toBeUndefined();
  });
});
