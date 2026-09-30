"use server";

import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

import { signIn } from "../actions";
import { ADMIN_HOME_PATH } from "../routes";

/** Длиннее человек не набирает; ограничение отсекает попытку загрузить в поле мегабайт. */
const MAX_PASSWORD_LENGTH = 512;
const MAX_LOGIN_LENGTH = 128;

const SECONDS_IN_MINUTE = 60;

export interface LoginFormState {
  readonly failed: boolean;
  /**
   * Готовый текст отказа. `null` — показать общий «Неверный пароль».
   *
   * Текст собирается здесь, а не в форме: в него подставляется число минут, а форма —
   * клиентский компонент без словаря (провайдера next-intl в разметке нет).
   */
  readonly message: string | null;
}

const REFUSED: LoginFormState = { failed: true, message: null };

/**
 * Действие формы входа. Разбирает поля, отдаёт логин и пароль блоку и на успехе уводит в админку.
 *
 * Причина отказа наружу не выносится: «поле пустое», «нет такого логина» и «пароль не тот»
 * выглядят одинаково.
 */
export async function submitLogin(
  previous: LoginFormState,
  form: FormData,
): Promise<LoginFormState> {
  void previous;
  const login = form.get("login");
  const password = form.get("password");

  // Проверка на границе системы: из браузера в поле формы приходит что угодно, включая файл.
  if (
    typeof login !== "string" ||
    login.length === 0 ||
    login.length > MAX_LOGIN_LENGTH ||
    typeof password !== "string" ||
    password.length === 0 ||
    password.length > MAX_PASSWORD_LENGTH
  ) {
    return REFUSED;
  }

  const result = await signIn(login, password);

  if (result.status === "throttled") {
    const t = await getTranslations("login");
    return {
      failed: true,
      message: t("throttled", {
        minutes: Math.ceil(result.retryAfterSeconds / SECONDS_IN_MINUTE),
      }),
    };
  }

  if (result.status === "ok") {
    redirect(ADMIN_HOME_PATH);
  }

  return REFUSED;
}
