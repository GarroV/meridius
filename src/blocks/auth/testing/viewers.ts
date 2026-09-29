// Вошедшие для проверок других блоков: УК (вся сеть) и партнёр со своими странами.
// Партнёр заводится настоящими строками в базе прогона — проверка области видимости на
// выдуманном тенанте проверила бы выдумку.
import { randomUUID } from "node:crypto";

import { getDb, tenantCountries, tenants } from "@/blocks/data";

import { hqTenantId } from "../accounts";
import type { Viewer } from "../scope";

export async function hqViewer(): Promise<Viewer> {
  return {
    accountId: null,
    login: "admin",
    tenantId: await hqTenantId(),
    tenantKind: "hq",
    tenantName: "УК",
    countryIds: [],
  };
}

export async function partnerViewer(
  countryIds: readonly string[],
): Promise<Viewer> {
  const name = `Партнёр ${randomUUID().slice(0, 8)}`;
  const [row] = await getDb()
    .insert(tenants)
    .values({ kind: "partner", name })
    .returning({ id: tenants.id });
  if (row === undefined) throw new Error("тенант не вставился");
  if (countryIds.length > 0) {
    await getDb()
      .insert(tenantCountries)
      .values(countryIds.map((countryId) => ({ tenantId: row.id, countryId })));
  }
  return {
    accountId: randomUUID(),
    login: "partner",
    tenantId: row.id,
    tenantKind: "partner",
    tenantName: name,
    countryIds,
  };
}
