import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import type { ReactElement } from "react";

import { AdminShell } from "@/blocks/core/ui/AdminShell";

import type { RoundsReportModel } from "../rounds-model";
import { ROUNDS_REPORT_PATH } from "../routes";
import { feedHref, toFeedView } from "../view";
import { FeedFilters } from "./FeedFilters";
import { RoundsEmpty } from "./RoundsEmpty";
import { RoundsGridTable } from "./RoundsGridTable";
import { TopbarActions } from "./TopbarActions";

/**
 * Экран отчёта об обходах: второй взгляд на те же фильтры, что у ленты (`FeedScreen.tsx`),
 * но вопрос другой — не «что заполнили», а «в какие часы обход сыпется»
 * (см. `rounds-model.ts`). Крошка и подпись периода поэтому повторяют приём `FeedScreen`,
 * а не выносятся в общий модуль ради одной короткой функции.
 */

const META_CLASS = "text-[length:var(--fs-meta)] text-[var(--ink-3)]";
const LEAD_CLASS = "text-[length:var(--fs-meta)] text-[var(--ink-3)]";
const BACK_CLASS =
  "inline-flex h-[var(--control-h-sm)] items-center justify-center gap-[var(--space-4)] rounded-[var(--r-control)] border border-transparent bg-transparent px-[var(--space-5)] text-[length:var(--fs-dense)] font-medium text-[var(--ink-2)] no-underline hover:bg-[var(--surface-3)] hover:text-ink";

type Formatter = Awaited<ReturnType<typeof getFormatter>>;
type Translate = Awaited<ReturnType<typeof getTranslations>>;

/** Крошка: та же логика, что `breadcrumbOf` в `FeedScreen.tsx`, — оба экрана читают
 * фильтр одинаково, иначе один и тот же выбор выглядел бы на двух экранах по-разному. */
function breadcrumbOf(model: RoundsReportModel, t: Translate): string {
  const { selection } = model;
  const country =
    selection.countries.find((row) => row.id === selection.countryId)?.name ??
    t("crumbs.allCountries");
  const store = selection.stores.find(
    (row) => row.id === selection.storeId,
  )?.name;
  const station = selection.stations.find(
    (row) => row.id === selection.stationId,
  )?.name;

  const parts = [country];
  if (store !== undefined) parts.push(store);
  else if (station === undefined) parts.push(t("crumbs.allStores"));
  if (station !== undefined) parts.push(station);

  return parts.join(" · ");
}

/** Подпись периода в верхней полосе — тот же приём, что в `FeedScreen.tsx`. */
function periodText(
  model: RoundsReportModel,
  format: Formatter,
  t: Translate,
): string {
  const day = (at: Date): string =>
    format.dateTime(at, {
      day: "numeric",
      month: "long",
      timeZone: model.timeZone,
    });

  if (model.selection.period === "today") {
    return t("range.day", { day: day(model.periodFrom) });
  }
  return t("range.span", {
    from: day(model.periodFrom),
    to: day(model.periodTo),
  });
}

export async function RoundsReportScreen({
  model,
}: {
  readonly model: RoundsReportModel;
}): Promise<ReactElement> {
  const t = await getTranslations("feed");
  const format = await getFormatter();

  return (
    <AdminShell
      testId="rounds-report-screen"
      active="feed"
      breadcrumb={breadcrumbOf(model, t)}
      title={t("report.title")}
      topbarAction={
        <TopbarActions>
          <span className={META_CLASS} data-testid="feed-period">
            {periodText(model, format, t)}
          </span>
          <Link
            href={feedHref(toFeedView(model.selection))}
            data-testid="rounds-feed-link"
            className={BACK_CLASS}
          >
            {t("report.backToFeed")}
          </Link>
        </TopbarActions>
      }
    >
      <FeedFilters
        selection={model.selection}
        timeZone={model.timeZone}
        timeZoneAmbiguous={model.timeZoneAmbiguous}
        action={ROUNDS_REPORT_PATH}
      />

      <p className={LEAD_CLASS} data-testid="rounds-lead">
        {t("report.lead")}
      </p>

      {model.emptyKind === null ? (
        <RoundsGridTable model={model} />
      ) : (
        <RoundsEmpty kind={model.emptyKind} />
      )}

      {/* Обе строки видны и при пустой сетке: пропавшие вне сетки отметки и точки с
          неизвестным поясом — факты о данных, а не о том, что сетка сейчас показывает. */}
      {model.strayMarkCount > 0 ? (
        <p className={LEAD_CLASS} data-testid="rounds-stray">
          {t("report.stray", { count: model.strayMarkCount })}
        </p>
      ) : null}

      {model.unknownTimezoneStores > 0 ? (
        <p className={LEAD_CLASS} data-testid="rounds-unknown-timezone">
          {t("report.unknownTimezone", {
            count: model.unknownTimezoneStores,
          })}
        </p>
      ) : null}
    </AdminShell>
  );
}
