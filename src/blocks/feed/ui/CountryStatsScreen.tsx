import Link from "next/link";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import type { ReactElement } from "react";

import { ADMIN_SECTIONS } from "@/blocks/core/admin-sections";
import { AdminNav } from "@/blocks/core/ui/AdminNav";
import { AdminPage } from "@/blocks/core/ui/AdminPage";
import { MasterDetail } from "@/blocks/core/ui/MasterDetail";
import { SectionIntro } from "@/blocks/core/ui/SectionIntro";

import type { CountryStatsModel } from "../country-model";
import { FEED_PATH } from "../routes";
import { countryStatsHref } from "../stats-view";
import { CountryRail } from "./CountryRail";
import { PeriodSwitch } from "./PeriodSwitch";
import { StatsMetrics } from "./StatsMetrics";
import { StoreTiles } from "./StoreTiles";
import { TopbarActions } from "./TopbarActions";

/**
 * Раздел «Статистика» (D179) — мастер-деталь, как «Чек-листы» и «Станции» (D162, D163):
 * слева страны, справа сводка выбранной страны (D150, D170) и плитки её пиццерий.
 * Страна живёт в адресе (`?country=`), без неё открыта первая — поэтому каркас стоит на
 * странице и узнаёт о выборе из модели, а не из сегмента адреса.
 */

const EMPTY_CLASS =
  "bg-surface flex flex-col items-center gap-[var(--space-5)] rounded-[var(--r-block)] border border-[var(--line-strong)] px-[var(--space-8)] py-[var(--space-10)] text-center text-[var(--ink-2)] shadow-[var(--sh-xs)]";
const EMPTY_TITLE_CLASS =
  "text-ink m-0 text-[length:var(--fs-title)] leading-[var(--lh-title)] font-semibold";
const BTN_CLASS =
  "bg-surface text-ink inline-flex h-[var(--control-h)] items-center justify-center gap-[var(--space-4)] rounded-[var(--r-control)] border border-[var(--line-control)] px-[var(--space-6)] text-[length:var(--fs-body)] font-medium no-underline hover:border-[var(--line-control-2)] hover:bg-[var(--surface-2)]";

async function NoCountries(): Promise<ReactElement> {
  const t = await getTranslations("feed.country");
  return (
    <div className={EMPTY_CLASS} data-testid="stats-empty">
      <p className={EMPTY_TITLE_CLASS}>{t("noCountriesTitle")}</p>
      <p className="m-0 max-w-[520px]">{t("noCountriesText")}</p>
      <Link href={ADMIN_SECTIONS.catalog.path} className={BTN_CLASS}>
        {t("noCountriesAction")}
      </Link>
    </div>
  );
}

async function CountryDetail({
  model,
}: {
  readonly model: CountryStatsModel;
}): Promise<ReactElement> {
  const t = await getTranslations("feed");
  const { countryId } = model;

  return (
    <AdminPage
      breadcrumb={model.countryName ?? t("crumbs.allCountries")}
      title={t("title")}
      topbarAction={
        countryId === null ? null : (
          <TopbarActions>
            <PeriodSwitch
              days={model.days}
              hrefOf={(days) => countryStatsHref({ countryId, days })}
            />
          </TopbarActions>
        )
      }
    >
      <SectionIntro section="feed" />
      {model.summary === null ? (
        <NoCountries />
      ) : (
        <>
          <StatsMetrics model={model.summary} />
          <StoreTiles model={model} />
        </>
      )}
    </AdminPage>
  );
}

export async function CountryStatsScreen({
  model,
}: {
  readonly model: CountryStatsModel;
}): Promise<ReactElement> {
  const [locale, messages, t] = await Promise.all([
    getLocale(),
    getMessages(),
    getTranslations("feed.country"),
  ]);

  return (
    <NextIntlClientProvider
      locale={locale}
      // Каркасу — подписи кабинета и текст отказа границы ошибки; колонка серверная.
      messages={{
        admin: messages["admin"] as AbstractIntlMessages,
        failure: messages["failure"] as AbstractIntlMessages,
      }}
    >
      <MasterDetail
        testId="feed-screen"
        nav={<AdminNav active="feed" />}
        rail={<CountryRail model={model} />}
        railLabel={t("railLabel")}
        backHref={FEED_PATH}
        backLabel={t("back")}
        intro={<SectionIntro section="feed" />}
        hasDetail={model.isExplicit}
      >
        <CountryDetail model={model} />
      </MasterDetail>
    </NextIntlClientProvider>
  );
}
