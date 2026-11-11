/**
 * Учётки открытого демо (D194): по одной на роль из `core/demo.ts`. Ядро — ошибка здесь
 * не падает: либо на проде молча появляется учётка, у которой вход открыт без пароля,
 * либо роль партнёра видит чужую страну.
 *
 * Правила:
 * - только при `DEMO_MODE=1`: сид Demoland гоняется и на проде, а учёток `demo-*` там
 *   быть не должно. Проверка стоит здесь, а не только в скрипте — функцию позовут и из
 *   другого места;
 * - пароль случайный и нигде не печатается и не возвращается: войти в демо можно только
 *   через `/demo`, а подбирать нечего;
 * - повторный прогон ничего не меняет: существующая учётка остаётся как есть, а чужая
 *   под тем же логином (другой тенант) — отказ, а не тихий переезд;
 * - всё в одной транзакции: отказ на любом шаге не оставляет половины демо.
 */
import { randomBytes } from "node:crypto";

import { and, eq } from "drizzle-orm";

import {
  DEMO_COUNTRY_NAME,
  DEMO_PARTNER_TENANT_NAME,
  DEMO_ROLES,
  type DemoRole,
} from "@/blocks/core/demo";
import {
  accounts,
  countries,
  getDb,
  tenantCountries,
  tenants,
} from "@/blocks/data";

import { isDemoMode } from "./config";
import { hashPassword, type ScryptParams } from "./password";

const PASSWORD_BYTES = 32;

/** Отказ сида словами: печатает скрипт. */
export class DemoAccountsRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DemoAccountsRefused";
  }
}

export interface DemoAccountsOptions {
  /** Роли, названия и параметры scrypt переопределяются только в проверках. */
  readonly roles?: readonly DemoRole[];
  readonly countryName?: string;
  readonly tenantName?: string;
  readonly scrypt?: ScryptParams;
}

export interface DemoAccountsSummary {
  readonly created: readonly string[];
  readonly kept: readonly string[];
}

function randomPassword(): string {
  return randomBytes(PASSWORD_BYTES).toString("base64url");
}

type Transaction = Parameters<
  Parameters<ReturnType<typeof getDb>["transaction"]>[0]
>[0];

async function partnerTenantId(
  tx: Transaction,
  tenantName: string,
  countryName: string,
): Promise<string> {
  const [country] = await tx
    .select({ id: countries.id })
    .from(countries)
    .where(eq(countries.name, countryName));
  if (country === undefined) {
    throw new DemoAccountsRefused(
      `Страны «${countryName}» в базе нет: сначала сид контура (seedDemo), потом учётки`,
    );
  }

  const [existing] = await tx
    .select({ id: tenants.id })
    .from(tenants)
    .where(and(eq(tenants.kind, "partner"), eq(tenants.name, tenantName)));
  const tenantId =
    existing?.id ??
    (
      await tx
        .insert(tenants)
        .values({ kind: "partner", name: tenantName })
        .returning({ id: tenants.id })
    )[0]?.id;
  if (tenantId === undefined) throw new Error("тенант демо не вставился");

  await tx
    .insert(tenantCountries)
    .values({ tenantId, countryId: country.id })
    .onConflictDoNothing();
  return tenantId;
}

export async function seedDemoAccounts(
  env: Record<string, string | undefined> = process.env,
  options: DemoAccountsOptions = {},
): Promise<DemoAccountsSummary> {
  if (!isDemoMode(env)) {
    throw new DemoAccountsRefused(
      "DEMO_MODE=1 не задан: учётки демо заводятся только на стенде демо — на проде вход без пароля недопустим",
    );
  }
  const roles = options.roles ?? DEMO_ROLES;
  const tenantName = options.tenantName ?? DEMO_PARTNER_TENANT_NAME;
  const countryName = options.countryName ?? DEMO_COUNTRY_NAME;

  // Хэши считаются до транзакции: scrypt долгий, держать на нём соединение незачем.
  const hashes = new Map<string, string>();
  for (const role of roles) {
    hashes.set(
      role.login,
      await hashPassword(randomPassword(), options.scrypt),
    );
  }

  return getDb().transaction(async (tx) => {
    const [hq] = await tx
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.kind, "hq"));
    if (hq === undefined) {
      throw new Error("В базе нет тенанта УК: миграция 0016 не накатана");
    }
    const partnerId = roles.some((role) => role.tenant === "partner")
      ? await partnerTenantId(tx, tenantName, countryName)
      : null;

    const created: string[] = [];
    const kept: string[] = [];
    for (const role of roles) {
      const tenantId = role.tenant === "hq" ? hq.id : partnerId;
      const passwordHash = hashes.get(role.login);
      if (tenantId === null || passwordHash === undefined) {
        throw new Error(`демо-роль ${role.key}: нет тенанта или хэша`);
      }

      const [existing] = await tx
        .select({ id: accounts.id, tenantId: accounts.tenantId })
        .from(accounts)
        .where(eq(accounts.login, role.login));
      if (existing === undefined) {
        await tx.insert(accounts).values({
          tenantId,
          login: role.login,
          passwordHash,
        });
        created.push(role.login);
      } else if (existing.tenantId === tenantId) {
        kept.push(role.login);
      } else {
        throw new DemoAccountsRefused(
          `Логин ${role.login} уже занят учёткой другого тенанта: демо её не перезаписывает`,
        );
      }
    }
    return { created, kept };
  });
}
