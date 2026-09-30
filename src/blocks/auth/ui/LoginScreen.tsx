import { getTranslations } from "next-intl/server";

import { formActionPath } from "@/blocks/core/base-path";

import { googleSettings } from "../google";
import { GOOGLE_START_PATH } from "../routes";
import { LoginForm } from "./LoginForm";

const NOTE_CLASS =
  "m-0 rounded-[var(--r-control)] border border-[var(--err-line)] bg-[var(--err-soft)] px-[var(--space-5)] py-[var(--space-4)] text-[length:var(--fs-dense)] leading-[var(--lh-dense)] text-err";
const CARD_CLASS =
  "bg-surface flex flex-col gap-[var(--space-7)] rounded-[var(--r-block)] border border-[var(--line-strong)] p-[var(--space-9)] shadow-[var(--sh-xs)]";

/** Значок Google — тот же, что на кнопке входа Decimus. */
function GoogleMark() {
  return (
    <svg
      className="h-5 w-5 flex-none"
      viewBox="0 0 48 48"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

/** «или» по вертикальной черте между Google и паролем; в столбик — по горизонтальной. */
function OrDivider({ label }: { readonly label: string }) {
  return (
    <div
      aria-hidden="true"
      className="flex items-center gap-[var(--space-4)] self-stretch text-[length:var(--fs-meta)] text-[var(--ink-3)] before:h-px before:flex-1 before:bg-[var(--line)] after:h-px after:flex-1 after:bg-[var(--line)] md:flex-col md:before:h-auto md:before:w-px md:after:h-auto md:after:w-px"
    >
      {label}
    </div>
  );
}

/**
 * Экран входа по образцу Decimus (#177, D176; раскладка Decimus от 29.09): с Google —
 * кнопка Google слева, «или» по вертикальной черте, логин и пароль справа, без лишних
 * слов; на узком экране всё в столбик, Google сверху.
 *
 * Google — РЯДОМ с паролем, а не вместо: пароль остаётся запасной дверью, учётка УК
 * `admin` входит только им. Реквизиты клиента не заданы — кнопки нет вовсе (мёртвая
 * «Войти через Google» выглядела бы поломкой), и карточка — одна колонка с пояснением.
 */
export async function LoginScreen({
  googleFailed,
}: {
  readonly googleFailed: boolean;
}) {
  const t = await getTranslations("login");
  const isGoogleEnabled = googleSettings() !== null;

  const form = (
    <LoginForm
      isSecondary={isGoogleEnabled}
      labels={{
        login: t("login"),
        password: t("password"),
        submit: t("submit"),
        submitting: t("submitting"),
        failed: t("failed"),
      }}
    />
  );

  return (
    <main
      data-testid="login-screen"
      className="flex min-h-screen items-center justify-center p-[var(--space-8)]"
    >
      <div
        className={
          isGoogleEnabled ? "w-[640px] max-w-full" : "w-[380px] max-w-full"
        }
      >
        <p className="mb-[var(--space-8)] text-center text-[length:var(--fs-display)] leading-[var(--lh-display)] font-semibold">
          {t("brand")}{" "}
          <span className="font-normal text-[var(--ink-3)]">
            {t("brandMuted")}
          </span>
        </p>

        <div className={CARD_CLASS}>
          <div className="flex flex-col gap-[var(--space-3)]">
            <h1 className="m-0 text-[length:var(--fs-title)] leading-[var(--lh-title)] font-semibold">
              {t("title")}
            </h1>
            {isGoogleEnabled ? null : (
              <p className="m-0 text-[length:var(--fs-meta)] leading-[var(--lh-meta)] text-[var(--ink-2)]">
                {t("lead")}
              </p>
            )}
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

          {isGoogleEnabled ? (
            <div className="flex flex-col gap-[var(--space-7)] md:grid md:grid-cols-[1fr_auto_1fr] md:items-center md:gap-[var(--space-8)]">
              {/* Обычная GET-форма, а не <Link>: за адресом обработчик маршрута и уход
                  к Google, клиентскому роутеру тут делать нечего. Базовый путь атрибуту
                  action приставляем сами — Next его не трогает. */}
              <form method="get" action={formActionPath(GOOGLE_START_PATH)}>
                <button
                  type="submit"
                  data-testid="login-google"
                  className="bg-surface text-ink flex h-12 w-full cursor-pointer items-center justify-center gap-[var(--space-4)] rounded-[var(--r-control)] border border-[var(--line-control)] text-[length:var(--fs-lead)] font-semibold hover:border-[var(--line-strong)] hover:bg-[var(--surface-3)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                >
                  <GoogleMark />
                  {t("google")}
                </button>
              </form>
              <OrDivider label={t("or")} />
              {form}
            </div>
          ) : (
            form
          )}
        </div>
      </div>
    </main>
  );
}
