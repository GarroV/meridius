"use client";

import { useActionState } from "react";

import { submitLogin, type LoginFormState } from "./login-action";

export interface LoginLabels {
  readonly password: string;
  readonly submit: string;
  readonly submitting: string;
  readonly failed: string;
  readonly kitchenHint: string;
}

const INITIAL_STATE: LoginFormState = { failed: false, message: null };

const FIELD_ID = "admin-password";
const ERROR_ID = "admin-password-error";

/**
 * Форма входа. Действие серверное, поэтому форма работает и с выключенным JavaScript;
 * состояние нужно только чтобы показать отказ и заблокировать кнопку на время проверки.
 */
export function LoginForm({ labels }: { readonly labels: LoginLabels }) {
  const [state, action, pending] = useActionState(submitLogin, INITIAL_STATE);

  return (
    <form action={action} className="flex flex-col gap-[var(--space-6)]">
      <div className="flex flex-col gap-[var(--space-3)]">
        <label
          htmlFor={FIELD_ID}
          className="text-[length:var(--fs-micro)] leading-[var(--lh-micro)] font-semibold tracking-[var(--tracking-micro)] text-[var(--ink-3)] uppercase"
        >
          {labels.password}
        </label>
        <input
          id={FIELD_ID}
          name="password"
          type="password"
          autoComplete="current-password"
          autoFocus
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
        className="bg-accent flex h-[var(--control-h)] w-full items-center justify-center rounded-[var(--r-control)] border border-[var(--accent)] text-[length:var(--fs-body)] font-medium text-[var(--ink-inverse)] hover:border-[var(--accent-hover)] hover:bg-[var(--accent-hover)] disabled:opacity-45"
      >
        {pending ? labels.submitting : labels.submit}
      </button>

      <p className="m-0 text-center text-[length:var(--fs-meta)] leading-[var(--lh-meta)] text-[var(--ink-3)]">
        {labels.kitchenHint}
      </p>
    </form>
  );
}
