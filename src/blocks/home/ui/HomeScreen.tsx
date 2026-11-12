import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { ADMIN_HOME } from "@/blocks/core/admin-sections";
import { formActionPath } from "@/blocks/core/base-path";
import { AutoSubmitSelect } from "@/blocks/core/ui/AutoSubmitSelect";
import { Icon } from "@/blocks/core/ui/Icon";

import type { HomeModel } from "../load";

const ALARM_BLOCK_CLASS =
  "rounded-[var(--r-block)] border border-[var(--err-line)] bg-[var(--err-soft)] shadow-[var(--sh-xs)]";
const ALARM_HEAD_CLASS =
  "m-0 flex items-center gap-[var(--space-4)] px-[var(--space-7)] py-[var(--space-5)] text-[length:var(--fs-title)] leading-[var(--lh-title)] font-semibold text-[var(--err)]";
const ALARM_ROW_CLASS =
  "flex min-h-[var(--tap-min)] items-center justify-between gap-[var(--space-5)] border-t border-[var(--err-line)] px-[var(--space-7)] py-[var(--space-3)] text-[length:var(--fs-body)] text-ink no-underline hover:bg-[var(--surface-2)] hover:text-ink hover:no-underline";

export async function HomeScreen({ model }: { readonly model: HomeModel }) {
  const t = await getTranslations("adminHome");
  const single =
    model.countries.length === 1 ? (model.countries[0] ?? null) : null;
  // Сначала то, что требует внимания: тревоги, потом несделанное в срок, потом остальные.
  const stores = model.stores.toSorted(
    (a, b) =>
      b.alarms - a.alarms ||
      b.missed - a.missed ||
      a.name.localeCompare(b.name),
  );
  const alarming = stores.filter((store) => store.alarms > 0);
  const alarmTotal = alarming.reduce((sum, store) => sum + store.alarms, 0);

  return (
    <div
      data-testid="admin-home"
      className="flex flex-col gap-[var(--space-7)]"
    >
      <form
        className="flex flex-wrap items-end gap-[var(--space-5)]"
        action={formActionPath(ADMIN_HOME.path)}
      >
        {single === null ? (
          <label className="flex flex-col gap-[var(--space-3)] text-[length:var(--fs-body)]">
            {t("country")}
            <AutoSubmitSelect name="country" defaultValue={model.countryId}>
              {model.countries.map((country) => (
                <option key={country.id} value={country.id}>
                  {country.name}
                </option>
              ))}
            </AutoSubmitSelect>
          </label>
        ) : (
          <p className="m-0 text-[length:var(--fs-body)]">
            <span className="text-[var(--ink-3)]">{t("country")}: </span>
            <strong className="font-semibold">{single.name}</strong>
          </p>
        )}
        <noscript>
          <button className="btn" type="submit">
            {t("show")}
          </button>
        </noscript>
        <p className="m-0 text-[length:var(--fs-meta)] text-[var(--ink-3)]">
          {t("todayHint")}
        </p>
      </form>
      {model.capped ? <p role="status">{t("partial")}</p> : null}
      {alarming.length === 0 ? null : (
        <section
          className={ALARM_BLOCK_CLASS}
          aria-labelledby="home-alarms-title"
          data-testid="home-alarms"
        >
          <h2 id="home-alarms-title" className={ALARM_HEAD_CLASS}>
            <Icon name="warn" className="h-[20px] w-[20px] flex-none" />
            {t("alarmsTitle", { count: alarmTotal })}
          </h2>
          <ul className="m-0 list-none p-0">
            {alarming.map((store) => (
              <li key={store.id}>
                <Link href={store.href} className={ALARM_ROW_CLASS}>
                  <span>
                    {store.name} · {t("alarmRow", { count: store.alarms })}
                  </span>
                  <span className="text-[var(--accent)]">{t("details")} →</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <ul className="m-0 grid list-none gap-[var(--space-6)] p-0 md:grid-cols-2 xl:grid-cols-3">
        {stores.map((store) => (
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
                  <p className="m-0 text-[length:var(--fs-body)]">
                    {t("filledOf", {
                      filled: store.filled,
                      total: store.total,
                    })}
                  </p>
                  {/* Нулевые строки не печатаются: ноль в списке читается как содержание.
                      Всё в порядке — одной строкой. */}
                  {store.missed === 0 && store.alarms === 0 ? (
                    <p className="m-0 flex items-center gap-[var(--space-3)] text-[length:var(--fs-body)] text-[var(--ok)]">
                      <Icon name="check" className="h-[16px] w-[16px]" />
                      {t("onTime")}
                    </p>
                  ) : null}
                  {store.missed > 0 ? (
                    <p className="m-0 text-[length:var(--fs-body)] font-medium text-[var(--err)]">
                      {t("missed", { count: store.missed })}
                    </p>
                  ) : null}
                  {store.open > 0 || store.upcoming > 0 ? (
                    <p className="m-0 text-[length:var(--fs-meta)] text-[var(--ink-3)]">
                      {[
                        store.open > 0 ? t("open", { count: store.open }) : "",
                        store.upcoming > 0
                          ? t("upcoming", { count: store.upcoming })
                          : "",
                      ]
                        .filter((part) => part !== "")
                        .join(" · ")}
                    </p>
                  ) : null}
                  {store.notExpected > 0 ? (
                    <p className="m-0 text-[length:var(--fs-meta)] text-[var(--ink-3)]">
                      {t("notExpected", { count: store.notExpected })}
                    </p>
                  ) : null}
                  {store.unknown > 0 ? (
                    <p className="m-0 text-[var(--ink-2)]">
                      {t("unknown", { count: store.unknown })}
                    </p>
                  ) : null}
                  {store.remarks > 0 ? (
                    <p className="m-0 flex items-center gap-[var(--space-3)] font-medium text-[var(--err)]">
                      <Icon name="warn" className="h-[16px] w-[16px]" />
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
