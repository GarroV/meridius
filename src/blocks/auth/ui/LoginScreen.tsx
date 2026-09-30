import { getTranslations } from "next-intl/server";

import { formActionPath } from "@/blocks/core/base-path";

import { googleSettings } from "../google";
import { GOOGLE_START_PATH } from "../routes";
import { LoginForm } from "./LoginForm";

const NOTE_CLASS =
  "m-0 rounded-[var(--r-control)] border border-[var(--err-line)] bg-[var(--err-soft)] px-[var(--space-5)] py-[var(--space-4)] text-[length:var(--fs-dense)] leading-[var(--lh-dense)] text-err";

/**
 * Экран входа по образцу Decimus (#177, D176): карточка «Вход» с пояснением, логин и
 * пароль, а под ними — вход через Google по привязанной почте.
 *
 * Google — РЯДОМ с паролем, а не вместо: пароль остаётся запасной дверью, учётка УК
 * `admin` входит только им. Реквизиты клиента не заданы — кнопки нет вовсе: мёртвая
 * «Войти через Google» выглядела бы поломкой продукта.
 */
export async function LoginScreen({
  googleFailed,
}: {
  readonly googleFailed: boolean;
}) {
  const t = await getTranslations("login");
  const isGoogleEnabled = googleSettings() !== null;

  return (
    <main
      data-testid="login-screen"
      className="flex min-h-screen items-center justify-center p-[var(--space-8)]"
    >
      <div className="w-[380px] max-w-full">
        <p className="mb-[var(--space-8)] text-center text-[length:var(--fs-display)] leading-[var(--lh-display)] font-semibold">
          {t("brand")}{" "}
          <span className="font-normal text-[var(--ink-3)]">
            {t("brandMuted")}
          </span>
        </p>

        <div className="bg-surface flex flex-col gap-[var(--space-7)] rounded-[var(--r-block)] border border-[var(--line-strong)] p-[var(--space-8)] shadow-[var(--sh-xs)]">
          <div className="flex flex-col gap-[var(--space-3)]">
            <h1 className="m-0 text-[length:var(--fs-title)] leading-[var(--lh-title)] font-semibold">
              {t("title")}
            </h1>
            <p className="m-0 text-[length:var(--fs-meta)] leading-[var(--lh-meta)] text-[var(--ink-2)]">
              {t("lead")}
            </p>
          </div>

          {googleFailed ? (
            <p
              role="alert"
              data-testid="login-google-error"
              className={NOTE_CLASS}
            >
              {t("googleFailed")}
            </p>
          ) : null}

          <LoginForm
            labels={{
              login: t("login"),
              password: t("password"),
              submit: t("submit"),
              submitting: t("submitting"),
              failed: t("failed"),
            }}
          />

          {isGoogleEnabled ? (
            <div className="flex flex-col gap-[var(--space-5)]">
              <p className="m-0 text-center text-[length:var(--fs-meta)] leading-[var(--lh-meta)] text-[var(--ink-3)]">
                {t("or")}
              </p>
              {/* Обычная GET-форма, а не <Link>: за адресом обработчик маршрута и уход
                  к Google, клиентскому роутеру тут делать нечего. Базовый путь атрибуту
                  action приставляем сами — Next его не трогает. */}
              <form method="get" action={formActionPath(GOOGLE_START_PATH)}>
                <button
                  type="submit"
                  data-testid="login-google"
                  className="bg-surface text-ink flex h-[var(--control-h)] w-full cursor-pointer items-center justify-center rounded-[var(--r-control)] border border-[var(--line-control)] text-[length:var(--fs-body)] font-medium hover:border-[var(--line-strong)] hover:bg-[var(--surface-3)]"
                >
                  {t("google")}
                </button>
              </form>
              <p className="m-0 text-[length:var(--fs-meta)] leading-[var(--lh-meta)] text-[var(--ink-3)]">
                {t("googleHint")}
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
