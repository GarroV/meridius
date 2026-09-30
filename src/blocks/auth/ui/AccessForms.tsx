"use client";

// Формы входа через Google на экране «Партнёры» (D176): привязка почты к учётке и
// заведение сотрудника УК. Части форм — общие с соседними (`PartnerForms`).
import { useActionState, type ReactElement } from "react";

import {
  BTN_CLASS,
  BTN_PRIMARY_CLASS,
  Field,
  INPUT_CLASS,
  Outcome,
  SUMMARY_CLASS,
  type PartnerErrorTexts,
} from "./PartnerForms";
import { submitBindEmail, submitCreateHqMember } from "./partners-action";
import { INITIAL_PARTNER_FORM } from "./partners-state";

export interface BindEmailLabels {
  readonly open: string;
  readonly email: string;
  readonly hint: string;
  readonly save: string;
  readonly saving: string;
  readonly saved: string;
}

export interface CreateHqMemberLabels {
  readonly login: string;
  readonly loginHint: string;
  readonly email: string;
  readonly emailHint: string;
  readonly submit: string;
  readonly submitting: string;
  /** Подтверждение с местом под логин: `{login}`. */
  readonly created: string;
}

/** Почта учётки: пустое поле отвязывает, учётка остаётся с паролем. */
export function BindEmail({
  accountId,
  email,
  labels,
  errors,
}: {
  readonly accountId: string;
  readonly email: string | null;
  readonly labels: BindEmailLabels;
  readonly errors: PartnerErrorTexts;
}): ReactElement {
  const [state, action, pending] = useActionState(
    submitBindEmail,
    INITIAL_PARTNER_FORM,
  );
  const id = `account-email-${accountId}`;

  return (
    <details>
      <summary className={SUMMARY_CLASS} data-testid="account-email-open">
        {labels.open}
      </summary>
      <form
        action={action}
        className="mt-[var(--space-4)] flex flex-col gap-[var(--space-4)]"
      >
        <input type="hidden" name="accountId" value={accountId} />
        <Field id={id} label={labels.email} hint={labels.hint}>
          <input
            id={id}
            name="email"
            type="email"
            defaultValue={email ?? ""}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            data-testid="account-email"
            className={INPUT_CLASS}
          />
        </Field>
        <Outcome
          state={state}
          errors={errors}
          testId="account-email"
          done={labels.saved}
        />
        <div>
          <button
            type="submit"
            disabled={pending}
            data-testid="account-email-submit"
            className={BTN_CLASS}
          >
            {pending ? labels.saving : labels.save}
          </button>
        </div>
      </form>
    </details>
  );
}

/** «Добавить сотрудника УК»: без пароля — он входит через Google. */
export function CreateHqMemberForm({
  labels,
  errors,
}: {
  readonly labels: CreateHqMemberLabels;
  readonly errors: PartnerErrorTexts;
}): ReactElement {
  const [state, action, pending] = useActionState(
    submitCreateHqMember,
    INITIAL_PARTNER_FORM,
  );

  return (
    <form
      action={action}
      data-testid="hq-create"
      className="flex flex-col gap-[var(--space-6)] p-[var(--space-7)]"
    >
      <Field id="hq-login" label={labels.login} hint={labels.loginHint}>
        <input
          id="hq-login"
          name="login"
          type="text"
          required
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          className={INPUT_CLASS}
        />
      </Field>
      <Field id="hq-email" label={labels.email} hint={labels.emailHint}>
        <input
          id="hq-email"
          name="email"
          type="email"
          required
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          className={INPUT_CLASS}
        />
      </Field>
      <Outcome
        state={state}
        errors={errors}
        testId="hq-create"
        done={labels.created.replace("{login}", state.login ?? "")}
      />
      <div>
        <button
          type="submit"
          disabled={pending}
          data-testid="hq-create-submit"
          className={BTN_PRIMARY_CLASS}
        >
          {pending ? labels.submitting : labels.submit}
        </button>
      </div>
    </form>
  );
}
