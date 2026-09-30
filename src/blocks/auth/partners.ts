/**
 * Учётки партнёров, которыми УК управляет с экрана «Партнёры» (T337, D169): список,
 * смена и сброс пароля, снятие. Заведение — `provision.ts`, тем же экраном.
 *
 * Ядро: ошибка здесь не падает, а тихо оставляет снятую учётку живой или меняет пароль
 * не той учётке. Поэтому каждое изменение адресует ровно одну строку по id и говорит,
 * нашлась ли она: «успех» на несуществующей учётке УК прочла бы как сделанное.
 *
 * Кто вправе звать эти функции — не их дело: экран и его действия пускают только УК
 * (`requireHq`), а здесь проверок вошедшего нет, как нет их и в `provision.ts`.
 */
import { randomInt } from "node:crypto";

import { and, asc, eq, isNull } from "drizzle-orm";

import {
  accounts,
  countries,
  getDb,
  tenantCountries,
  tenants,
} from "@/blocks/data";

import { hashPassword, type ScryptParams } from "./password";
import { MIN_PARTNER_PASSWORD_LENGTH } from "./provision";

/** Строка списка учёток. Хэша пароля в ней нет и быть не должно. */
export interface PartnerAccountRow {
  readonly accountId: string;
  readonly login: string;
  readonly tenantName: string;
  readonly countryNames: readonly string[];
  readonly createdAt: Date;
  /** Когда учётку сняли; `null` — учётка действует. */
  readonly disabledAt: Date | null;
}

export type AccountChange =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason: "not-found" | "removed" | "short-password";
    };

export type PasswordReset =
  | { readonly ok: true; readonly password: string }
  | { readonly ok: false; readonly reason: "not-found" | "removed" };

/**
 * Все учётки партнёров, действующие и снятые: снятая остаётся в списке, чтобы УК видела,
 * что логин занят и почему по нему не входят.
 */
export async function listPartnerAccounts(): Promise<PartnerAccountRow[]> {
  const rows = await getDb()
    .select({
      accountId: accounts.id,
      login: accounts.login,
      tenantId: tenants.id,
      tenantName: tenants.name,
      createdAt: accounts.createdAt,
      disabledAt: accounts.disabledAt,
    })
    .from(accounts)
    .innerJoin(tenants, eq(tenants.id, accounts.tenantId))
    .orderBy(asc(tenants.name), asc(accounts.login));

  const owned = await getDb()
    .select({ tenantId: tenantCountries.tenantId, name: countries.name })
    .from(tenantCountries)
    .innerJoin(countries, eq(countries.id, tenantCountries.countryId))
    .orderBy(asc(countries.name));

  return rows.map(({ tenantId, ...row }) => ({
    ...row,
    countryNames: owned
      .filter((country) => country.tenantId === tenantId)
      .map((country) => country.name),
  }));
}

/** Названия партнёров, уже заведённых: форма подсказывает их, чтобы не плодить двойников. */
export async function listPartnerTenantNames(): Promise<string[]> {
  const rows = await getDb()
    .select({ name: tenants.name })
    .from(tenants)
    .where(eq(tenants.kind, "partner"))
    .orderBy(asc(tenants.name));
  return rows.map((row) => row.name);
}

/** Страны справочника: из них УК выбирает страны партнёра. */
export async function listCountryNames(): Promise<string[]> {
  const rows = await getDb()
    .select({ name: countries.name })
    .from(countries)
    .orderBy(asc(countries.name));
  return rows.map((row) => row.name);
}

type AccountState = "active" | "disabled" | "missing";

async function stateOf(accountId: string): Promise<AccountState> {
  const [row] = await getDb()
    .select({ disabledAt: accounts.disabledAt })
    .from(accounts)
    .where(eq(accounts.id, accountId));
  if (row === undefined) return "missing";
  return row.disabledAt === null ? "active" : "disabled";
}

/**
 * Записать хэш действующей учётке и отметить смену пароля: сессии, открытые до неё,
 * больше не принимаются (`accounts.ts`). Условие «не снята» стоит в самом запросе, а не
 * только в проверке перед ним: снятие, успевшее между ними, не должно отменяться сменой
 * пароля.
 */
async function storeHash(
  accountId: string,
  passwordHash: string,
): Promise<AccountChange> {
  const updated = await getDb()
    .update(accounts)
    // Отметка смены — тем же запросом, что и хэш: новый пароль без неё оставил бы
    // живой сессию, ради закрытия которой пароль и сбрасывают (#198).
    .set({ passwordHash, passwordChangedAt: new Date() })
    .where(and(eq(accounts.id, accountId), isNull(accounts.disabledAt)))
    .returning({ id: accounts.id });
  if (updated.length > 0) return { ok: true };
  const state = await stateOf(accountId);
  return { ok: false, reason: state === "missing" ? "not-found" : "removed" };
}

/**
 * Сменить пароль учётке. Снятой — отказ: смена пароля не возвращает учётку в строй, и
 * новый пароль на снятой выглядел бы для УК как «теперь войдёт».
 */
export async function changePartnerPassword(
  accountId: string,
  password: string,
  scrypt?: ScryptParams,
): Promise<AccountChange> {
  if (password.length < MIN_PARTNER_PASSWORD_LENGTH) {
    return { ok: false, reason: "short-password" };
  }
  return storeHash(accountId, await hashPassword(password, scrypt));
}

/**
 * Буквы нового пароля: без похожих друг на друга (0/O, 1/l/I), потому что сброшенный
 * пароль УК передаёт партнёру глазами — с экрана, голосом, в сообщении.
 */
const GENERATED_ALPHABET =
  "23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
/** 16 знаков из 55 — около 92 бит: подбор упирается в предел входа задолго до этого. */
const GENERATED_LENGTH = 16;

/** Случайный пароль для сброса — криптографическим генератором, не `Math.random`. */
export function generatePartnerPassword(): string {
  return Array.from(
    { length: GENERATED_LENGTH },
    () => GENERATED_ALPHABET[randomInt(GENERATED_ALPHABET.length)] ?? "",
  ).join("");
}

/**
 * Сбросить пароль: учётке выдаётся новый случайный, и он возвращается ровно один раз —
 * в базе лежит только его хэш, показать его второй раз нечем.
 */
export async function resetPartnerPassword(
  accountId: string,
  scrypt?: ScryptParams,
): Promise<PasswordReset> {
  const password = generatePartnerPassword();
  const stored = await storeHash(
    accountId,
    await hashPassword(password, scrypt),
  );
  if (stored.ok) return { ok: true, password };
  return {
    ok: false,
    reason: stored.reason === "not-found" ? "not-found" : "removed",
  };
}

/**
 * Снять учётку: вход ею отказывает сразу, открытые сессии гаснут на следующем запросе —
 * вошедший читается из базы на каждый запрос (`accounts.ts`). Повторное снятие срок
 * снятия не сдвигает: он — когда учётку сняли впервые.
 */
export async function disablePartnerAccount(
  accountId: string,
): Promise<AccountChange> {
  await getDb()
    .update(accounts)
    .set({ disabledAt: new Date() })
    .where(and(eq(accounts.id, accountId), isNull(accounts.disabledAt)));
  const state = await stateOf(accountId);
  return state === "missing"
    ? { ok: false, reason: "not-found" }
    : { ok: true };
}
