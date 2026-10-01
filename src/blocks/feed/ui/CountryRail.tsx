import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactElement } from "react";

import type { CountryStatsModel } from "../country-model";
import { countryStatsHref } from "../stats-view";

/**
 * Колонка стран раздела «Статистика» (D179): «страны списком слева, для простоты
 * навигации». Партнёр видит только свои страны — список приходит из той же области
 * видимости, что и справочник ленты (D145). Строки — обычный текст, а не синие ссылки
 * (D162), выбранная — мягкая заливка с полосой слева, как в колонке «Станций».
 */

const HEAD_CLASS =
  "bg-surface sticky top-0 z-[1] flex items-center gap-[var(--space-4)] border-b border-[var(--line)] px-[var(--space-6)] pt-[var(--space-7)] pb-[var(--space-6)]";
const TITLE_CLASS =
  "text-[length:var(--fs-title)] leading-[var(--lh-title)] font-semibold text-ink";
const COUNT_CLASS =
  "font-[family-name:var(--font-num)] text-[length:var(--fs-meta)] text-[var(--ink-3)] [font-variant-numeric:tabular-nums]";
const LIST_CLASS =
  "m-0 flex list-none flex-col gap-[var(--space-1)] px-[var(--space-4)] py-[var(--space-4)]";
const ROW_BASE_CLASS =
  "flex flex-col gap-[var(--space-1)] rounded-[var(--r-control)] px-[var(--space-5)] py-[var(--space-4)] text-ink no-underline transition-[background] duration-[var(--t-state)] hover:text-ink hover:no-underline focus-visible:shadow-[0_0_0_2px_var(--accent)] focus-visible:outline-none";
const ROW_IDLE_CLASS = `${ROW_BASE_CLASS} hover:bg-[var(--surface-2)]`;
const ROW_CURRENT_CLASS = `${ROW_BASE_CLASS} bg-[var(--accent-soft)] shadow-[inset_2px_0_0_var(--accent)]`;
const NAME_CLASS =
  "text-[length:var(--fs-body)] leading-[var(--lh-body)] font-medium [overflow-wrap:anywhere]";
const META_CLASS =
  "text-[length:var(--fs-meta)] leading-[var(--lh-meta)] text-[var(--ink-3)]";
const EMPTY_CLASS =
  "px-[var(--space-5)] py-[var(--space-8)] text-[length:var(--fs-dense)] leading-[var(--lh-dense)] text-[var(--ink-2)]";

export async function CountryRail({
  model,
}: {
  readonly model: CountryStatsModel;
}): Promise<ReactElement> {
  const t = await getTranslations("feed.country");

  return (
    <div className="flex min-h-0 flex-col" data-testid="country-rail">
      <div className={HEAD_CLASS}>
        <h2 className={TITLE_CLASS}>{t("railTitle")}</h2>
        <span className={COUNT_CLASS}>{String(model.countries.length)}</span>
      </div>
      {model.countries.length === 0 ? (
        <p className={EMPTY_CLASS}>{t("noCountriesTitle")}</p>
      ) : (
        <ul className={LIST_CLASS}>
          {model.countries.map((country) => {
            const isCurrent = country.id === model.countryId;
            return (
              <li key={country.id}>
                <Link
                  href={countryStatsHref({
                    countryId: country.id,
                    days: model.days,
                  })}
                  className={isCurrent ? ROW_CURRENT_CLASS : ROW_IDLE_CLASS}
                  data-testid="country-row"
                  {...(isCurrent ? { "aria-current": "page" as const } : {})}
                >
                  <span className={NAME_CLASS}>{country.name}</span>
                  <span className={META_CLASS}>
                    {t("storeCount", { count: country.storeCount })}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
