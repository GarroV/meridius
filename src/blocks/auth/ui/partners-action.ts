"use server";

// Действия экрана «Партнёры» (T337). Каждое зовёт requireHq() само: действия идут мимо
// разметки, и охрана страницы их не закрывает. Партнёр получает 404, как на экран.
//
// Пароль не попадает ни в журнал, ни в ответ — кроме ответа на сброс, ради которого
// сброс и нажимали.
import { revalidatePath } from "next/cache";

import { normalizeLogin } from "../accounts";
import { bindAccountEmail } from "../emails";
import { requireHq } from "../guard";
import { provisionHqMember } from "../hq-members";
import {
  changePartnerPassword,
  disablePartnerAccount,
  resetPartnerPassword,
} from "../partners";
import { provisionPartner } from "../provision";
import { PARTNERS_PATH } from "../routes";
import type { PartnerFormState } from "./partners-state";

/** Длиннее человек не набирает; предел отсекает попытку загрузить в поле мегабайт. */
const MAX_FIELD_LENGTH = 512;
const MAX_COUNTRIES = 500;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function field(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.slice(0, MAX_FIELD_LENGTH) : "";
}

function accountIdOf(form: FormData): string | null {
  const value = field(form, "accountId");
  return UUID_PATTERN.test(value) ? value : null;
}

function unexpected(error: unknown, what: string): PartnerFormState {
  // В журнал — имя и сообщение, а не объект целиком: что драйвер базы или scrypt
  // положат в свой объект ошибки, здесь не контролируется, а рядом лежит пароль.
  const reason =
    error instanceof Error ? `${error.name}: ${error.message}` : typeof error;
  console.error(`Партнёры: непредвиденный сбой — ${what}`, reason);
  return { status: "failed", error: "unknown" };
}

/** «Завести партнёра»: название партнёра, страны, логин и пароль учётки. */
export async function submitCreatePartner(
  previous: PartnerFormState,
  form: FormData,
): Promise<PartnerFormState> {
  void previous;
  await requireHq();

  const countryNames = form
    .getAll("country")
    .filter((value): value is string => typeof value === "string")
    .slice(0, MAX_COUNTRIES);
  const login = field(form, "login");
  try {
    const result = await provisionPartner({
      tenantName: field(form, "tenant"),
      countryNames,
      login,
      password: field(form, "password"),
    });
    if (!result.ok) return { status: "failed", error: result.reason };
  } catch (error) {
    return unexpected(error, "партнёр не заведён");
  }

  revalidatePath(PARTNERS_PATH);
  return { status: "done", login: normalizeLogin(login) ?? login };
}

/** «Сменить пароль»: новый пароль, набранный УК. */
export async function submitChangePassword(
  previous: PartnerFormState,
  form: FormData,
): Promise<PartnerFormState> {
  void previous;
  await requireHq();

  const accountId = accountIdOf(form);
  if (accountId === null) return { status: "failed", error: "not-found" };
  try {
    const result = await changePartnerPassword(
      accountId,
      field(form, "password"),
    );
    if (!result.ok) return { status: "failed", error: result.reason };
  } catch (error) {
    return unexpected(error, "пароль не сменён");
  }
  return { status: "done" };
}

/** «Сбросить пароль»: учётке выдаётся случайный пароль, и он показывается один раз. */
export async function submitResetPassword(
  previous: PartnerFormState,
  form: FormData,
): Promise<PartnerFormState> {
  void previous;
  await requireHq();

  const accountId = accountIdOf(form);
  if (accountId === null) return { status: "failed", error: "not-found" };
  try {
    const result = await resetPartnerPassword(accountId);
    if (!result.ok) return { status: "failed", error: result.reason };
    return { status: "done", password: result.password };
  } catch (error) {
    return unexpected(error, "пароль не сброшен");
  }
}

/** «Снять учётку»: вход ею отказывает сразу, открытые сессии гаснут на следующем запросе. */
export async function submitDisableAccount(
  previous: PartnerFormState,
  form: FormData,
): Promise<PartnerFormState> {
  void previous;
  await requireHq();

  const accountId = accountIdOf(form);
  if (accountId === null) return { status: "failed", error: "not-found" };
  try {
    const result = await disablePartnerAccount(accountId);
    if (!result.ok) return { status: "failed", error: result.reason };
  } catch (error) {
    return unexpected(error, "учётка не снята");
  }

  revalidatePath(PARTNERS_PATH);
  return { status: "done" };
}

/** «Почта для входа через Google»: привязать, заменить или (пустым полем) отвязать. */
export async function submitBindEmail(
  previous: PartnerFormState,
  form: FormData,
): Promise<PartnerFormState> {
  void previous;
  await requireHq();

  const accountId = accountIdOf(form);
  if (accountId === null) return { status: "failed", error: "not-found" };
  try {
    const result = await bindAccountEmail(accountId, field(form, "email"));
    if (!result.ok) return { status: "failed", error: result.reason };
  } catch (error) {
    return unexpected(error, "почта не привязана");
  }

  revalidatePath(PARTNERS_PATH);
  return { status: "done" };
}

/** «Добавить сотрудника УК»: логин и рабочая почта, вход — через Google (D176). */
export async function submitCreateHqMember(
  previous: PartnerFormState,
  form: FormData,
): Promise<PartnerFormState> {
  void previous;
  await requireHq();

  const login = field(form, "login");
  try {
    const result = await provisionHqMember({
      login,
      email: field(form, "email"),
    });
    if (!result.ok) return { status: "failed", error: result.reason };
  } catch (error) {
    return unexpected(error, "сотрудник УК не заведён");
  }

  revalidatePath(PARTNERS_PATH);
  return { status: "done", login: normalizeLogin(login) ?? login };
}
