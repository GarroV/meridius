// Экран УК «Партнёры» (T337, D169): завести партнёра с учёткой и странами, сменить и
// сбросить пароль, снять учётку — вместо команды оператора и правки базы.
//
// Модуля эталона у экрана нет (`docs/furca/design/map.md`): он собран из тех же
// карточек и полей, что соседние экраны кабинета.
import { getTranslations } from "next-intl/server";
import type { ReactElement } from "react";

import { AdminShell } from "@/blocks/core/ui/AdminShell";

import type { PartnerAccountRow } from "../partners";
import { MIN_PARTNER_PASSWORD_LENGTH } from "../provision";
import {
  AccountActions,
  CreatePartnerForm,
  type AccountActionLabels,
  type CreatePartnerLabels,
  type PartnerErrorTexts,
} from "./PartnerForms";

type Translate = Awaited<ReturnType<typeof getTranslations>>;

export interface PartnersModel {
  readonly accounts: readonly PartnerAccountRow[];
  readonly tenantNames: readonly string[];
  readonly countryNames: readonly string[];
}

const CARD_CLASS =
  "bg-surface rounded-[var(--r-block)] border border-[var(--line-strong)] shadow-[var(--sh-xs)]";
const CARD_HEAD_CLASS =
  "flex items-center gap-[var(--space-6)] rounded-t-[var(--r-block)] border-b border-[var(--line)] bg-[var(--surface-3)] px-[var(--space-7)] py-[var(--space-6)]";
const CARD_TITLE_CLASS =
  "m-0 text-[length:var(--fs-title)] leading-[var(--lh-title)] font-semibold";
const NOTICE_CLASS =
  "rounded-[var(--r-block)] border border-[var(--line-strong)] bg-[var(--surface-2)] px-[var(--space-7)] py-[var(--space-6)] text-[length:var(--fs-dense)] leading-[var(--lh-dense)]";
const ROW_CLASS =
  "grid gap-[var(--space-5)] border-b border-[var(--line)] px-[var(--space-7)] py-[var(--space-6)] [grid-template-columns:minmax(0,1fr)_minmax(0,1fr)] max-md:[grid-template-columns:minmax(0,1fr)]";
const META_CLASS =
  "m-0 text-[length:var(--fs-meta)] leading-[var(--lh-meta)] text-[var(--ink-3)]";
const TAG_CLASS =
  "inline-flex min-h-[20px] items-center rounded-[var(--r-mark)] border border-[var(--line-strong)] px-[var(--space-4)] text-[length:var(--fs-micro)] font-semibold tracking-[var(--tracking-micro)] uppercase";

const ERROR_KEYS = [
  "tenant-name",
  "hq-tenant",
  "no-countries",
  "unknown-country",
  "root-login",
  "login-shape",
  "login-taken",
  "short-password",
  "not-found",
  "removed",
  "unknown",
] as const;

function errorTexts(t: Translate): PartnerErrorTexts {
  return Object.fromEntries(
    ERROR_KEYS.map((key) => [
      key,
      t(`errors.${key}`, { min: MIN_PARTNER_PASSWORD_LENGTH }),
    ]),
  ) as PartnerErrorTexts;
}

function createLabels(t: Translate): CreatePartnerLabels {
  return {
    tenant: t("tenant"),
    tenantHint: t("tenantHint"),
    login: t("login"),
    loginHint: t("loginHint"),
    password: t("password"),
    passwordHint: t("passwordHint", { min: MIN_PARTNER_PASSWORD_LENGTH }),
    countries: t("countries"),
    countriesEmpty: t("countriesEmpty"),
    submit: t("create"),
    submitting: t("creating"),
    // Место под логин остаётся буквальным: подставляет его форма, когда логин известен.
    created: t("created", { login: "{login}" }),
  };
}

function actionLabels(t: Translate): AccountActionLabels {
  return {
    changePassword: t("changePassword"),
    newPassword: t("newPassword"),
    save: t("save"),
    saving: t("saving"),
    passwordChanged: t("passwordChanged"),
    resetPassword: t("resetPassword"),
    resetting: t("resetting"),
    resetDone: t("resetDone"),
    disable: t("disable"),
    disableConfirm: t("disableConfirm"),
    disableYes: t("disableYes"),
    disabling: t("disabling"),
  };
}

function AccountRow({
  row,
  t,
  locale,
  labels,
  errors,
}: {
  readonly row: PartnerAccountRow;
  readonly t: Translate;
  readonly locale: string;
  readonly labels: AccountActionLabels;
  readonly errors: PartnerErrorTexts;
}): ReactElement {
  const isRemoved = row.disabledAt !== null;
  return (
    <div
      className={ROW_CLASS}
      data-testid="partner-account"
      data-login={row.login}
      data-removed={isRemoved ? "true" : "false"}
    >
      <div className="flex min-w-0 flex-col gap-[var(--space-3)]">
        <div className="flex flex-wrap items-center gap-[var(--space-4)]">
          <b className="font-mono">{row.login}</b>
          <span
            className={
              isRemoved
                ? `${TAG_CLASS} text-[var(--ink-3)]`
                : `${TAG_CLASS} border-[var(--accent-line)] text-[var(--accent)]`
            }
            data-testid="partner-status"
          >
            {isRemoved
              ? t("disabledSince", {
                  date: row.disabledAt.toLocaleDateString(locale),
                })
              : t("active")}
          </span>
        </div>
        <p className="m-0">{row.tenantName}</p>
        <p className={META_CLASS}>
          {row.countryNames.length === 0
            ? t("noCountries")
            : row.countryNames.join(", ")}
        </p>
      </div>
      {isRemoved ? (
        <p className={META_CLASS}>{t("disabledNote")}</p>
      ) : (
        <AccountActions
          accountId={row.accountId}
          labels={labels}
          errors={errors}
        />
      )}
    </div>
  );
}

export async function PartnersScreen({
  model,
  locale,
}: {
  readonly model: PartnersModel;
  readonly locale: string;
}): Promise<ReactElement> {
  const t = await getTranslations("partners");
  const errors = errorTexts(t);
  const labels = actionLabels(t);

  return (
    <AdminShell
      testId="partners-screen"
      breadcrumb={t("crumbs")}
      title={t("title")}
      topbarAction={null}
    >
      <p className={NOTICE_CLASS}>{t("notice")}</p>

      <section className={CARD_CLASS}>
        <div className={CARD_HEAD_CLASS}>
          <h2 className={CARD_TITLE_CLASS}>{t("createTitle")}</h2>
        </div>
        <CreatePartnerForm
          labels={createLabels(t)}
          errors={errors}
          tenantNames={model.tenantNames}
          countryNames={model.countryNames}
        />
      </section>

      <section className={CARD_CLASS} data-testid="partner-accounts">
        <div className={CARD_HEAD_CLASS}>
          <h2 className={CARD_TITLE_CLASS}>{t("listTitle")}</h2>
        </div>
        {model.accounts.length === 0 ? (
          <p
            className={`${META_CLASS} px-[var(--space-7)] py-[var(--space-6)]`}
          >
            {t("listEmpty")}
          </p>
        ) : (
          model.accounts.map((row) => (
            <AccountRow
              key={row.accountId}
              row={row}
              t={t}
              locale={locale}
              labels={labels}
              errors={errors}
            />
          ))
        )}
      </section>
    </AdminShell>
  );
}
