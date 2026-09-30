"use client";

import { useActionState } from "react";

import { submitLogin, type LoginFormState } from "./login-action";

export interface LoginLabels {
  readonly login: string;
  readonly password: string;
  readonly submit: string;
  readonly submitting: string;
  readonly failed: string;
}

const PRIMARY_BUTTON =
  "bg-accent flex h-[var(--control-h)] w-full cursor-pointer items-center justify-center rounded-[var(--r-control)] border border-[var(--accent)] text-[length:var(--fs-body)] font-medium text-[var(--ink-inverse)] hover:border-[var(--accent-hover)] hover:bg-[var(--accent-hover)] disabled:opacity-45";
const SECONDARY_BUTTON =
  "bg-surface text-ink flex h-[var(--control-h)] w-full cursor-pointer items-center justify-center rounded-[var(--r-control)] border border-[var(--line-control)] text-[length:var(--fs-body)] font-medium hover:border-[var(--line-strong)] hover:bg-[var(--surface-3)] disabled:opacity-45";

const INITIAL_STATE: LoginFormState = { failed: false, message: null };

const LOGIN_FIELD_ID = "admin-login";
const FIELD_ID = "admin-password";
const ERROR_ID = "admin-password-error";

/**
 * Форма входа. Действие серверное, поэтому форма работает и с выключенным JavaScript;
 * состояние нужно только чтобы показать отказ и заблокировать кнопку на время проверки.
 */
export function LoginForm({
  labels,
  isSecondary,
}: {
  readonly labels: LoginLabels;
  /** Рядом есть вход через Google: он главный, кнопка пароля — второстепенная, как у Decimus. */
  readonly isSecondary: boolean;
}) {
  const [state, action, pending] = useActionState(submitLogin, INITIAL_STATE);

  return (
    <form action={action} className="flex flex-col gap-[var(--space-5)]">
      <div className="flex flex-col">
        <label htmlFor={LOGIN_FIELD_ID} className="sr-only">
          {labels.login}
        </label>
        <input
          id={LOGIN_FIELD_ID}
          name="login"
          type="text"
          placeholder={labels.login}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          autoFocus={!isSecondary}
          required
          aria-invalid={state.failed}
          aria-describedby={state.failed ? ERROR_ID : undefined}
          className="bg-surface text-ink h-[var(--control-h)] w-full rounded-[var(--r-control)] border border-[var(--line-control)] px-[var(--space-5)] text-[length:var(--fs-lead)] focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--focus-soft)] focus:outline-none"
        />
      </div>

      <div className="flex flex-col">
        <label htmlFor={FIELD_ID} className="sr-only">
          {labels.password}
        </label>
        <input
          id={FIELD_ID}
          name="password"
          type="password"
          placeholder={labels.password}
          autoComplete="current-password"
          required
          aria-invalid={state.failed}
          aria-describedby={state.failed ? ERROR_ID : undefined}
          className="bg-surface text-ink h-[var(--control-h)] w-full rounded-[var(--r-control)] border border-[var(--line-control)] px-[var(--space-5)] text-[length:var(--fs-lead)] focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--focus-soft)] focus:outline-none"
        />
      </div>

      {state.failed ? (
        <p
          id={ERROR_ID}
          role="alert"
          data-testid="login-error"
          className="text-err m-0 rounded-[var(--r-control)] border border-[var(--err-line)] bg-[var(--err-soft)] px-[var(--space-5)] py-[var(--space-4)] text-[length:var(--fs-dense)] leading-[var(--lh-dense)]"
        >
          {state.message ?? labels.failed}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        data-testid="login-submit"
        className={isSecondary ? SECONDARY_BUTTON : PRIMARY_BUTTON}
      >
        {pending ? labels.submitting : labels.submit}
      </button>
    </form>
  );
}
