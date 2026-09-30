/**
 * Сотрудник УК: учётка в тенанте УК, которая входит через Google по рабочей почте (D176).
 * Ядро: ошибка здесь не падает, а тихо даёт человеку вид на всю сеть.
 *
 * Заводит её УК вручную, с экрана «Партнёры» — список не подтягивается ниоткуда сам.
 * Пароль выдаётся случайный и нигде не показывается: вход — через Google, а пароль при
 * нужде УК сбросит тем же экраном, и сброс покажет новый один раз.
 */
import { eq } from "drizzle-orm";

import { accounts, getDb, tenants } from "@/blocks/data";

import { ROOT_LOGIN, normalizeLogin } from "./accounts";
import { isUniqueViolation, normalizeEmail } from "./emails";
import { generatePartnerPassword } from "./partners";
import { hashPassword, type ScryptParams } from "./password";

export interface HqMemberInput {
  readonly login: string;
  readonly email: string;
}

export type HqMemberResult =
  | { readonly ok: true; readonly accountId: string }
  | {
      readonly ok: false;
      readonly reason:
        | "root-login"
        | "login-shape"
        | "login-taken"
        | "email-shape"
        | "email-taken";
    };

export async function provisionHqMember(
  input: HqMemberInput,
  scrypt?: ScryptParams,
): Promise<HqMemberResult> {
  if (input.login.trim().toLowerCase() === ROOT_LOGIN) {
    return { ok: false, reason: "root-login" };
  }
  const login = normalizeLogin(input.login);
  if (login === null) return { ok: false, reason: "login-shape" };
  // Почта обязательна: без неё сотрудник УК не войдёт ничем — пароля он не знает.
  const email = normalizeEmail(input.email);
  if (email === null) return { ok: false, reason: "email-shape" };

  const passwordHash = await hashPassword(generatePartnerPassword(), scrypt);

  const [taken] = await getDb()
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.login, login));
  if (taken !== undefined) return { ok: false, reason: "login-taken" };

  const [hq] = await getDb()
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.kind, "hq"));
  if (hq === undefined) {
    throw new Error("В базе нет тенанта УК: миграция 0016 не накатана");
  }

  try {
    const [row] = await getDb()
      .insert(accounts)
      .values({ tenantId: hq.id, login, email, passwordHash })
      .returning({ id: accounts.id });
    if (row === undefined) throw new Error("учётка не вставилась");
    return { ok: true, accountId: row.id };
  } catch (error) {
    // Логин проверен выше, но его могли занять между проверкой и вставкой — различаем
    // по тому, какая из двух уникальностей сработала.
    if (!isUniqueViolation(error)) throw error;
    const [again] = await getDb()
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.login, login));
    return {
      ok: false,
      reason: again === undefined ? "email-taken" : "login-taken",
    };
  }
}
