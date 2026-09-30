"use client";

// Формы экрана «Партнёры» (T337). Действия серверные, поэтому формы работают и без
// JavaScript; состояние нужно, чтобы показать итог и заблокировать кнопку на время.
// Словаря здесь нет: тексты приходят готовыми с сервера (`PartnersScreen`).
import { useActionState, type ReactElement, type ReactNode } from "react";

import {
  submitChangePassword,
  submitCreatePartner,
  submitDisableAccount,
  submitResetPassword,
} from "./partners-action";
import {
  INITIAL_PARTNER_FORM,
  type PartnerFormError,
  type PartnerFormState,
} from "./partners-state";

export type PartnerErrorTexts = Readonly<Record<PartnerFormError, string>>;

export interface CreatePartnerLabels {
  readonly tenant: string;
  readonly tenantHint: string;
  readonly login: string;
  readonly loginHint: string;
  readonly password: string;
  readonly passwordHint: string;
  readonly countries: string;
  readonly countriesEmpty: string;
  readonly submit: string;
  readonly submitting: string;
  /** Подтверждение с местом под логин: `{login}`. */
  readonly created: string;
}

export interface AccountActionLabels {
  readonly changePassword: string;
  readonly newPassword: string;
  readonly save: string;
  readonly saving: string;
  readonly passwordChanged: string;
  readonly resetPassword: string;
  readonly resetting: string;
  readonly resetConfirm: string;
  readonly resetYes: string;
  readonly resetDone: string;
  readonly disable: string;
  readonly disableConfirm: string;
  readonly disableYes: string;
  readonly disabling: string;
}

const LABEL_CLASS =
  "text-[length:var(--fs-micro)] leading-[var(--lh-micro)] font-semibold tracking-[var(--tracking-micro)] text-[var(--ink-3)] uppercase";
const INPUT_CLASS =
  "bg-surface text-ink h-[var(--control-h)] w-full rounded-[var(--r-control)] border border-[var(--line-control)] px-[var(--space-5)] text-[length:var(--fs-body)] focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--focus-soft)] focus:outline-none";
const HINT_CLASS =
  "m-0 text-[length:var(--fs-meta)] leading-[var(--lh-meta)] text-[var(--ink-3)]";
const BTN_PRIMARY_CLASS =
  "bg-accent inline-flex h-[var(--control-h)] cursor-pointer items-center justify-center rounded-[var(--r-control)] border border-[var(--accent)] px-[var(--space-6)] text-[length:var(--fs-body)] font-medium text-[var(--ink-inverse)] hover:border-[var(--accent-hover)] hover:bg-[var(--accent-hover)] disabled:opacity-45";
const BTN_CLASS =
  "bg-surface text-ink inline-flex h-[var(--control-h)] cursor-pointer items-center justify-center rounded-[var(--r-control)] border border-[var(--line-control)] px-[var(--space-5)] text-[length:var(--fs-dense)] font-medium hover:bg-[var(--surface-2)] disabled:opacity-45";
const BTN_DANGER_CLASS =
  "bg-surface text-err inline-flex h-[var(--control-h)] cursor-pointer items-center justify-center rounded-[var(--r-control)] border border-[var(--err-line)] px-[var(--space-5)] text-[length:var(--fs-dense)] font-medium hover:bg-[var(--err-soft)] disabled:opacity-45";
const ERROR_CLASS =
  "text-err m-0 rounded-[var(--r-control)] border border-[var(--err-line)] bg-[var(--err-soft)] px-[var(--space-5)] py-[var(--space-4)] text-[length:var(--fs-dense)] leading-[var(--lh-dense)]";
const DONE_CLASS =
  "m-0 rounded-[var(--r-control)] border border-[var(--accent-line)] bg-[var(--accent-soft)] px-[var(--space-5)] py-[var(--space-4)] text-[length:var(--fs-dense)] leading-[var(--lh-dense)]";
const SUMMARY_CLASS =
  "cursor-pointer text-[length:var(--fs-dense)] font-medium text-[var(--accent)]";

function Outcome({
  state,
  errors,
  done,
  testId,
}: {
  readonly state: PartnerFormState;
  readonly errors: PartnerErrorTexts;
  readonly done: ReactNode;
  readonly testId: string;
}): ReactElement | null {
  if (state.status === "failed") {
    return (
      <p role="alert" data-testid={`${testId}-error`} className={ERROR_CLASS}>
        {errors[state.error ?? "unknown"]}
      </p>
    );
  }
  if (state.status === "done") {
    return (
      <p role="status" data-testid={`${testId}-done`} className={DONE_CLASS}>
        {done}
      </p>
    );
  }
  return null;
}

function Field({
  id,
  label,
  hint,
  children,
}: {
  readonly id: string;
  readonly label: string;
  readonly hint?: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div className="flex flex-col gap-[var(--space-3)]">
      <label htmlFor={id} className={LABEL_CLASS}>
        {label}
      </label>
      {children}
      {hint === undefined ? null : <p className={HINT_CLASS}>{hint}</p>}
    </div>
  );
}

/** «Завести партнёра». Существующее название партнёра подсказывается списком. */
export function CreatePartnerForm({
  labels,
  errors,
  tenantNames,
  countryNames,
}: {
  readonly labels: CreatePartnerLabels;
  readonly errors: PartnerErrorTexts;
  readonly tenantNames: readonly string[];
  readonly countryNames: readonly string[];
}): ReactElement {
  const [state, action, pending] = useActionState(
    submitCreatePartner,
    INITIAL_PARTNER_FORM,
  );

  return (
    <form
      action={action}
      data-testid="partner-create"
      className="flex flex-col gap-[var(--space-6)] p-[var(--space-7)]"
    >
      <Field id="partner-tenant" label={labels.tenant} hint={labels.tenantHint}>
        <input
          id="partner-tenant"
          name="tenant"
          type="text"
          required
          maxLength={120}
          list="partner-tenant-names"
          autoComplete="off"
          className={INPUT_CLASS}
        />
        <datalist id="partner-tenant-names">
          {tenantNames.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      </Field>

      <Field id="partner-login" label={labels.login} hint={labels.loginHint}>
        <input
          id="partner-login"
          name="login"
          type="text"
          required
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          className={INPUT_CLASS}
        />
      </Field>

      <Field
        id="partner-password"
        label={labels.password}
        hint={labels.passwordHint}
      >
        <input
          id="partner-password"
          name="password"
          type="password"
          required
          autoComplete="new-password"
          className={INPUT_CLASS}
        />
      </Field>

      <fieldset className="m-0 flex flex-col gap-[var(--space-3)] border-0 p-0">
        <legend className={LABEL_CLASS}>{labels.countries}</legend>
        {countryNames.length === 0 ? (
          <p className={HINT_CLASS}>{labels.countriesEmpty}</p>
        ) : (
          <div className="flex flex-wrap gap-x-[var(--space-7)] gap-y-[var(--space-3)]">
            {countryNames.map((name) => (
              <label
                key={name}
                className="inline-flex items-center gap-[var(--space-3)] text-[length:var(--fs-body)]"
              >
                <input type="checkbox" name="country" value={name} />
                {name}
              </label>
            ))}
          </div>
        )}
      </fieldset>

      <Outcome
        state={state}
        errors={errors}
        testId="partner-create"
        done={labels.created.replace("{login}", state.login ?? "")}
      />

      <div>
        <button
          type="submit"
          disabled={pending}
          data-testid="partner-create-submit"
          className={BTN_PRIMARY_CLASS}
        >
          {pending ? labels.submitting : labels.submit}
        </button>
      </div>
    </form>
  );
}

function ChangePassword({
  accountId,
  labels,
  errors,
}: {
  readonly accountId: string;
  readonly labels: AccountActionLabels;
  readonly errors: PartnerErrorTexts;
}): ReactElement {
  const [state, action, pending] = useActionState(
    submitChangePassword,
    INITIAL_PARTNER_FORM,
  );
  const id = `partner-new-password-${accountId}`;

  return (
    <details>
      <summary className={SUMMARY_CLASS} data-testid="partner-change-open">
        {labels.changePassword}
      </summary>
      <form
        action={action}
        className="mt-[var(--space-4)] flex flex-col gap-[var(--space-4)]"
      >
        <input type="hidden" name="accountId" value={accountId} />
        <Field id={id} label={labels.newPassword}>
          <input
            id={id}
            name="password"
            type="password"
            required
            autoComplete="new-password"
            data-testid="partner-new-password"
            className={INPUT_CLASS}
          />
        </Field>
        <Outcome
          state={state}
          errors={errors}
          testId="partner-change"
          done={labels.passwordChanged}
        />
        <div>
          <button
            type="submit"
            disabled={pending}
            data-testid="partner-change-submit"
            className={BTN_CLASS}
          >
            {pending ? labels.saving : labels.save}
          </button>
        </div>
      </form>
    </details>
  );
}

function ResetPassword({
  accountId,
  labels,
  errors,
}: {
  readonly accountId: string;
  readonly labels: AccountActionLabels;
  readonly errors: PartnerErrorTexts;
}): ReactElement {
  const [state, action, pending] = useActionState(
    submitResetPassword,
    INITIAL_PARTNER_FORM,
  );

  // Как соседние действия — раскрыть и подтвердить: сброс сразу отнимает у партнёра
  // прежний пароль, и три похожих действия не должны вести себя тремя способами.
  return (
    <details>
      <summary className={SUMMARY_CLASS} data-testid="partner-reset-open">
        {labels.resetPassword}
      </summary>
      <form
        action={action}
        className="mt-[var(--space-4)] flex flex-col gap-[var(--space-4)]"
      >
        <input type="hidden" name="accountId" value={accountId} />
        <p className={HINT_CLASS}>{labels.resetConfirm}</p>
        <div>
          <button
            type="submit"
            disabled={pending}
            data-testid="partner-reset"
            className={BTN_CLASS}
          >
            {pending ? labels.resetting : labels.resetYes}
          </button>
        </div>
        <Outcome
          state={state}
          errors={errors}
          testId="partner-reset"
          done={
            <>
              {labels.resetDone}{" "}
              <code
                data-testid="partner-reset-password"
                className="font-mono font-semibold select-all"
              >
                {state.password}
              </code>
            </>
          }
        />
      </form>
    </details>
  );
}

function DisableAccount({
  accountId,
  labels,
  errors,
}: {
  readonly accountId: string;
  readonly labels: AccountActionLabels;
  readonly errors: PartnerErrorTexts;
}): ReactElement {
  const [state, action, pending] = useActionState(
    submitDisableAccount,
    INITIAL_PARTNER_FORM,
  );

  // Снятие необратимо, поэтому в два шага: раскрыть и подтвердить. Нативный confirm()
  // не годится — без JavaScript форма ушла бы без вопроса.
  return (
    <details>
      <summary className={SUMMARY_CLASS} data-testid="partner-disable-open">
        {labels.disable}
      </summary>
      <form
        action={action}
        className="mt-[var(--space-4)] flex flex-col gap-[var(--space-4)]"
      >
        <input type="hidden" name="accountId" value={accountId} />
        <p className={HINT_CLASS}>{labels.disableConfirm}</p>
        <Outcome
          state={state}
          errors={errors}
          testId="partner-disable"
          done=""
        />
        <div>
          <button
            type="submit"
            disabled={pending}
            data-testid="partner-disable-submit"
            className={BTN_DANGER_CLASS}
          >
            {pending ? labels.disabling : labels.disableYes}
          </button>
        </div>
      </form>
    </details>
  );
}

/** Действия над действующей учёткой: сменить и сбросить пароль, снять. */
export function AccountActions({
  accountId,
  labels,
  errors,
}: {
  readonly accountId: string;
  readonly labels: AccountActionLabels;
  readonly errors: PartnerErrorTexts;
}): ReactElement {
  return (
    <div className="flex flex-col gap-[var(--space-4)]">
      <ChangePassword accountId={accountId} labels={labels} errors={errors} />
      <ResetPassword accountId={accountId} labels={labels} errors={errors} />
      <DisableAccount accountId={accountId} labels={labels} errors={errors} />
    </div>
  );
}
