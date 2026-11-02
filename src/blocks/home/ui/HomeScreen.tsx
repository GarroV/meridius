import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { ADMIN_HOME } from "@/blocks/core/admin-sections";
import { formActionPath } from "@/blocks/core/base-path";

import type { HomeModel } from "../load";

export async function HomeScreen({ model }: { readonly model: HomeModel }) {
  const t = await getTranslations("adminHome");
  return (
    <div
      data-testid="admin-home"
      className="flex flex-col gap-[var(--space-7)]"
    >
      <form
        className="flex flex-wrap items-end gap-[var(--space-5)]"
        action={formActionPath(ADMIN_HOME.path)}
      >
        <label className="flex flex-col gap-[var(--space-3)] text-[length:var(--fs-body)]">
          {t("country")}
          <select
            name="country"
            defaultValue={model.countryId}
            className="bg-surface text-ink min-h-[var(--tap-min)] rounded-[var(--r-control)] border border-[var(--line-control)] px-[var(--space-5)]"
          >
            {model.countries.map((country) => (
              <option key={country.id} value={country.id}>
                {country.name}
              </option>
            ))}
          </select>
        </label>
        <button className="btn" type="submit">
          {t("show")}
        </button>
        <p className="m-0 text-[length:var(--fs-meta)] text-[var(--ink-3)]">
          {t("todayHint")}
        </p>
      </form>
      {model.capped ? <p role="status">{t("partial")}</p> : null}
      <ul className="m-0 grid list-none gap-[var(--space-6)] p-0 md:grid-cols-2 xl:grid-cols-3">
        {model.stores.map((store) => (
          <li key={store.id}>
            <Link
              href={store.href}
              className="card flex h-full flex-col gap-[var(--space-5)] p-[var(--space-7)] text-ink no-underline hover:border-[var(--accent)] hover:text-ink hover:no-underline"
            >
              <h2 className="m-0 text-[length:var(--fs-title)] font-semibold">
                {store.name}
              </h2>
              {store.total === 0 ? (
                <p className="m-0 text-[var(--ink-3)]">{t("notConfigured")}</p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-x-[var(--space-7)] gap-y-[var(--space-4)] text-[length:var(--fs-body)]">
                    <span>{t("filled", { count: store.filled })}</span>
                    <span>{t("open", { count: store.open })}</span>
                    <span className="text-[var(--ink-2)]">
                      {t("missed", { count: store.missed })}
                    </span>
                  </div>
                  <p className="m-0 text-[length:var(--fs-meta)] text-[var(--ink-3)]">
                    {t("upcoming", { count: store.upcoming })}
                    {store.notExpected > 0
                      ? ` · ${t("notExpected", { count: store.notExpected })}`
                      : ""}
                  </p>
                  {store.unknown > 0 ? (
                    <p className="m-0 text-[var(--ink-2)]">
                      {t("unknown", { count: store.unknown })}
                    </p>
                  ) : null}
                  {store.remarks > 0 ? (
                    <p className="m-0 text-[var(--warn-ink)]">
                      {t("remarks", { count: store.remarks })}
                    </p>
                  ) : null}
                </>
              )}
              <span className="mt-auto text-[length:var(--fs-meta)] text-[var(--accent)]">
                {t("details")} →
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {model.stores.length === 0 ? <p>{t("noStores")}</p> : null}
    </div>
  );
}
