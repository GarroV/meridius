/**
 * Учётные записи и тенанты: кто вошёл и какие страны ему видны (D145). Ядро — отказ,
 * который не сработал, неотличим от успеха.
 *
 * Тенант и страны читаются из базы на каждый запрос, а не кладутся в куку: снятая учётка
 * и отобранная страна должны действовать сразу, а не через 30 дней, когда кука истечёт.
 */
import { and, eq, isNull } from "drizzle-orm";

import { accounts, getDb, tenantCountries, tenants } from "@/blocks/data";

import type { Viewer } from "./scope";
import { ROOT_SUBJECT } from "./session";

/**
 * Логин учётки УК из окружения площадки. Строки в базе у неё нет, и в базе этот логин
 * запрещён ограничением `accounts_login_not_root`: один логин не открывает двух учёток.
 */
export const ROOT_LOGIN = "admin";

const LOGIN_SHAPE = /^[a-z0-9._-]{3,64}$/;

/** Логин, как его хранит база: без пробелов по краям и в нижнем регистре; иначе null. */
export function normalizeLogin(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const login = raw.trim().toLowerCase();
  return LOGIN_SHAPE.test(login) ? login : null;
}

/** Идентификатор тенанта УК. Его строку заводит миграция 0016, и она ровно одна. */
export async function hqTenantId(): Promise<string> {
  const [row] = await getDb()
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.kind, "hq"));
  if (row === undefined) {
    throw new Error("В базе нет тенанта УК: миграция 0016 не накатана");
  }
  return row.id;
}

async function countriesOf(tenantId: string): Promise<string[]> {
  const rows = await getDb()
    .select({ countryId: tenantCountries.countryId })
    .from(tenantCountries)
    .where(eq(tenantCountries.tenantId, tenantId));
  return rows.map((row) => row.countryId).sort();
}

async function rootViewer(): Promise<Viewer> {
  const [row] = await getDb()
    .select({ id: tenants.id, name: tenants.name })
    .from(tenants)
    .where(eq(tenants.kind, "hq"));
  if (row === undefined) {
    throw new Error("В базе нет тенанта УК: миграция 0016 не накатана");
  }
  return {
    accountId: null,
    login: ROOT_LOGIN,
    tenantId: row.id,
    tenantKind: "hq",
    tenantName: row.name,
    countryIds: [],
  };
}

/**
 * Кто стоит за сессией. null — учётки нет или она снята: такой сессией не входят, даже
 * если подпись куки верна.
 */
export async function loadViewer(subject: string): Promise<Viewer | null> {
  if (subject === ROOT_SUBJECT) return rootViewer();

  const [row] = await getDb()
    .select({
      accountId: accounts.id,
      login: accounts.login,
      tenantId: tenants.id,
      tenantKind: tenants.kind,
      tenantName: tenants.name,
    })
    .from(accounts)
    .innerJoin(tenants, eq(tenants.id, accounts.tenantId))
    .where(and(eq(accounts.id, subject), isNull(accounts.disabledAt)));
  if (row === undefined) return null;

  return {
    ...row,
    countryIds: row.tenantKind === "hq" ? [] : await countriesOf(row.tenantId),
  };
}

/** Действующая учётка для входа по логину. Снятая не находится. */
export async function findLoginAccount(
  login: string,
): Promise<{ readonly id: string; readonly passwordHash: string } | null> {
  const [row] = await getDb()
    .select({ id: accounts.id, passwordHash: accounts.passwordHash })
    .from(accounts)
    .where(and(eq(accounts.login, login), isNull(accounts.disabledAt)));
  return row ?? null;
}
