import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import type { ReactElement } from "react";

import { AdminShell } from "@/blocks/core/ui/AdminShell";

import type { FeedModel } from "../model";
import { roundsReportHref, toFeedView } from "../view";
import { AlarmStrip } from "./AlarmStrip";
import { FeedEmpty } from "./FeedEmpty";
import { FeedFilters } from "./FeedFilters";
import { FeedMetrics } from "./FeedMetrics";
import { FeedTable } from "./FeedTable";

/**
 * Экран ленты заполнений (эталон `docs/furca/design/screens/feed.html`).
 *
 * Всё, что здесь показано, посчитала модель: экран ничего не фильтрует, не сортирует
 * и не пересчитывает. Показатели и лента приходят из одного массива строк — именно
 * поэтому они не могут разъехаться (T045).
 */

const META_CLASS = "text-[length:var(--fs-meta)] text-[var(--ink-3)]";
// Ссылка на отчёт в верхней полосе — тот же вид, что у «Открыть» в строке ленты
// (`FeedTable.tsx`): второй взгляд на те же данные оформлен как соседнее действие,
// а не как ещё один пункт бокового меню.
const REPORT_LINK_CLASS =
  "inline-flex h-[var(--control-h-sm)] items-center justify-center gap-[var(--space-4)] rounded-[var(--r-control)] border border-transparent bg-transparent px-[var(--space-5)] text-[length:var(--fs-dense)] font-medium text-[var(--ink-2)] no-underline hover:bg-[var(--surface-3)] hover:text-ink";

type Formatter = Awaited<ReturnType<typeof getFormatter>>;
type Translate = Awaited<ReturnType<typeof getTranslations>>;

/**
 * Крошка: «Казахстан · Алматы, Абая 44 · Кухня» — ровно то, что сейчас в фильтре.
 *
 * «Все пиццерии» дописываются, только когда не выбрана и станция: название станции
 * без выбранной пиццерии уже несёт её («Алматы, Абая 44 · Кухня»), и строка
 * «все пиццерии · Алматы, Абая 44 · Кухня» противоречила бы сама себе.
 */
function breadcrumbOf(model: FeedModel, t: Translate): string {
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

/** Подпись периода в верхней полосе: «за 5 сентября» или «с 7 августа по 5 сентября». */
function periodText(model: FeedModel, format: Formatter, t: Translate): string {
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

export async function FeedScreen({
  model,
}: {
  readonly model: FeedModel;
}): Promise<ReactElement> {
  const t = await getTranslations("feed");
  const format = await getFormatter();

  return (
    <AdminShell
      testId="feed-screen"
      active="feed"
      breadcrumb={breadcrumbOf(model, t)}
      title={t("title")}
      topbarAction={
        <>
          <span className={META_CLASS} data-testid="feed-period">
            {periodText(model, format, t)}
          </span>
          <Link
            href={roundsReportHref(toFeedView(model.selection))}
            data-testid="feed-report-link"
            className={REPORT_LINK_CLASS}
          >
            {t("report.link")}
          </Link>
        </>
      }
    >
      <FeedFilters
        selection={model.selection}
        timeZone={model.timeZone}
        timeZoneAmbiguous={model.timeZoneAmbiguous}
      />
      {/* Тревоги выше показателей и ленты: это единственное на экране, что требует
          действия сегодня, а не сведений о прошлом (D053). */}
      <AlarmStrip alarms={model.alarms} selection={model.selection} />
      <FeedMetrics metrics={model.metrics} period={model.selection.period} />

      {/* Показатели остаются на месте и при пустой ленте: ноль заполнений — это факт,
          а не сбой, и прятать его вместе с таблицей значит скрывать ответ на вопрос. */}
      {model.emptyKind === null ? (
        <FeedTable
          rows={model.rows}
          selection={model.selection}
          limitReached={model.limitReached}
        />
      ) : (
        <FeedEmpty kind={model.emptyKind} />
      )}
    </AdminShell>
  );
}
