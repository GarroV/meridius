import { getTranslations } from "next-intl/server";

import { LoginForm } from "./LoginForm";

/**
 * Экран входа по эталону `docs/furca/design/screens/login.html`: карточка на 340 px
 * по центру пустого экрана. Ничего, кроме поля пароля: учётная запись одна (D014),
 * а сотрудникам на кухне вход не нужен вовсе (D001) — об этом на экране сказано прямо.
 */
export async function LoginScreen() {
  const t = await getTranslations("login");

  return (
    <main
      data-testid="login-screen"
      className="flex min-h-screen items-center justify-center p-[var(--space-8)]"
    >
      <div className="w-[340px] max-w-full">
        <h1 className="mb-[var(--space-8)] text-center text-[length:var(--fs-display)] leading-[var(--lh-display)] font-semibold">
          {t("brand")}{" "}
          <span className="font-normal text-[var(--ink-3)]">
            {t("brandMuted")}
          </span>
        </h1>

        <div className="bg-surface rounded-[var(--r-block)] border border-[var(--line-strong)] shadow-[var(--sh-xs)]">
          <div className="p-[var(--space-7)]">
            <LoginForm
              labels={{
                password: t("password"),
                submit: t("submit"),
                submitting: t("submitting"),
                failed: t("failed"),
                kitchenHint: t("kitchenHint"),
              }}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
