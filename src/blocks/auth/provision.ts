/**
 * Заведение партнёра оператором: тенант, его страны и учётка входа (D145). Ядро — ошибка
 * здесь не падает, а тихо даёт партнёру чужую страну.
 *
 * Здесь только однозначная часть: кто и где заводит партнёров в продукте (экран УК,
 * самостоятельная регистрация, выгрузка из внешней системы) — не решено, и этот модуль
 * не выбирает. Скрипт `scripts/create-partner.mjs` — тонкая обёртка над ним.
 *
 * Правила:
 * - страны опознаются по названию и обязаны уже быть в справочнике — опечатка не
 *   заводит пустую страну и не выдаёт партнёру «ничего» молча;
 * - повторный вызов с тем же тенантом ДОБАВЛЯЕТ страны и учётку и ничего не снимает:
 *   отбор страны — отдельное осознанное действие, а не побочный эффект опечатки;
 * - логин не переиспользуется: занятый логин — отказ, учётка не переезжает к другому
 *   тенанту;
 * - всё в одной транзакции: отказ на любом шаге не оставляет в базе половины партнёра.
 */
import { and, eq, inArray } from "drizzle-orm";

import {
  accounts,
  countries,
  getDb,
  tenantCountries,
  tenants,
} from "@/blocks/data";

import { ROOT_LOGIN, normalizeLogin } from "./accounts";
import { hashPassword, type ScryptParams } from "./password";

/** Пароль короче не принимается — тот же порог, что у пароля УК (`hash-admin-password`). */
export const MIN_PARTNER_PASSWORD_LENGTH = 12;
const MAX_TENANT_NAME_LENGTH = 120;

export interface PartnerInput {
  readonly tenantName: string;
  readonly countryNames: readonly string[];
  readonly login: string;
  readonly password: string;
}

type ProvisionRefusal =
  | "tenant-name"
  | "hq-tenant"
  | "no-countries"
  | "unknown-country"
  | "root-login"
  | "login-shape"
  | "login-taken"
  | "short-password";

export type ProvisionResult =
  | {
      readonly ok: true;
      readonly tenantId: string;
      readonly accountId: string;
      readonly tenantCreated: boolean;
    }
  | {
      readonly ok: false;
      readonly reason: ProvisionRefusal;
      readonly detail?: string;
    };

type Refusal = Extract<ProvisionResult, { ok: false }>;

/** Отказы, которые видны без базы: форма ввода. */
function shapeRefusal(input: PartnerInput): Refusal | null {
  const name = input.tenantName.trim();
  if (name.length === 0 || name.length > MAX_TENANT_NAME_LENGTH) {
    return { ok: false, reason: "tenant-name" };
  }
  if (input.countryNames.length === 0) {
    return { ok: false, reason: "no-countries" };
  }
  if (input.login.trim().toLowerCase() === ROOT_LOGIN) {
    return { ok: false, reason: "root-login" };
  }
  if (normalizeLogin(input.login) === null) {
    return { ok: false, reason: "login-shape" };
  }
  if (input.password.length < MIN_PARTNER_PASSWORD_LENGTH) {
    return { ok: false, reason: "short-password" };
  }
  return null;
}

/** Отказ внутри транзакции: бросается, чтобы откатить всё, и ловится снаружи. */
class RefusedInside extends Error {
  // Поле объявлено явно, а не параметром конструктора: скрипты грузят этот файл
  // встроенным в node снятием типов, а оно параметров-полей не понимает.
  readonly refusal: Refusal;

  constructor(refusal: Refusal) {
    super(refusal.reason);
    this.refusal = refusal;
  }
}

export async function provisionPartner(
  input: PartnerInput,
  scrypt?: ScryptParams,
): Promise<ProvisionResult> {
  const refused = shapeRefusal(input);
  if (refused !== null) return refused;

  const tenantName = input.tenantName.trim();
  const login = normalizeLogin(input.login) ?? "";
  const countryNames = [...new Set(input.countryNames.map((n) => n.trim()))];
  // Хэш считается до транзакции: scrypt долгий, держать на нём соединение незачем.
  const passwordHash = await hashPassword(input.password, scrypt);

  try {
    return await getDb().transaction(async (tx) => {
      const [hq] = await tx
        .select({ name: tenants.name })
        .from(tenants)
        .where(eq(tenants.kind, "hq"));
      if (hq?.name === tenantName) {
        throw new RefusedInside({ ok: false, reason: "hq-tenant" });
      }

      const found = await tx
        .select({ id: countries.id, name: countries.name })
        .from(countries)
        .where(inArray(countries.name, countryNames));
      const missing = countryNames.find(
        (name) => !found.some((row) => row.name === name),
      );
      if (missing !== undefined) {
        throw new RefusedInside({
          ok: false,
          reason: "unknown-country",
          detail: missing,
        });
      }

      const [taken] = await tx
        .select({ id: accounts.id })
        .from(accounts)
        .where(eq(accounts.login, login));
      if (taken !== undefined) {
        throw new RefusedInside({ ok: false, reason: "login-taken" });
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
      if (tenantId === undefined) throw new Error("тенант не вставился");

      await tx
        .insert(tenantCountries)
        .values(found.map((row) => ({ tenantId, countryId: row.id })))
        .onConflictDoNothing();

      const [account] = await tx
        .insert(accounts)
        .values({ tenantId, login, passwordHash })
        .returning({ id: accounts.id });
      if (account === undefined) throw new Error("учётка не вставилась");

      return {
        ok: true,
        tenantId,
        accountId: account.id,
        tenantCreated: existing === undefined,
      } as const;
    });
  } catch (error) {
    if (error instanceof RefusedInside) return error.refusal;
    throw error;
  }
}
