/**
 * Сотрудник УК: учётка в тенанте УК, которая входит через Google по рабочей почте (D176).
 * Ядро: ошибка здесь не падает, а тихо даёт человеку вид на всю сеть.
 *
 * Заводит её УК вручную, с экрана «Партнёры» — список не подтягивается ниоткуда сам.
 * Пароль выдаётся случайный и нигде не показывается: вход — через Google, а пароль при
 * нужде УК сбросит тем же экраном, и сброс покажет новый один раз.
 */
import { eq } from "drizzle-orm";

import { accounts, getDb } from "@/blocks/data";

import { ROOT_LOGIN, hqTenantId, normalizeLogin } from "./accounts";
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

  const tenantId = await hqTenantId();

  try {
    const [row] = await getDb()
      .insert(accounts)
      .values({ tenantId, login, email, passwordHash })
      .returning({ id: accounts.id });
    if (row === undefined) throw new Error("учётка не вставилась");
    return { ok: true, accountId: row.id };
  } catch (error) {
    // Занятость проверяет сама вставка, а не выборка перед ней: между выборкой и
    // вставкой логин успели бы занять. Какая из двух уникальностей сработала — видно
    // по тому, есть ли уже учётка с этим логином.
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
