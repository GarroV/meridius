import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";

import { requireAdmin } from "@/blocks/auth/guard";
import { redirectPath } from "@/blocks/core/base-path";
import type { Locale } from "@/blocks/core/locale";
import { RoundsReportScreen } from "@/blocks/feed/ui/RoundsReportScreen";
import { buildRoundsModel } from "@/blocks/feed/ui/build-rounds-model";
import {
  isLegacyPeriod,
  parseFeedView,
  roundsReportHref,
  toFeedView,
  type SearchParams,
} from "@/blocks/feed/view";

/**
 * Отчёт об обходах: те же фильтры, что у ленты (T044, T045), но вопрос другой —
 * в какие часы обход сыпется (rounds-model.ts).
 *
 * `requireAdmin()` зовётся здесь, а не только в разметке `src/app/admin/layout.tsx`:
 * разметка и страница рендерятся параллельно, поэтому без этой строки страница успела
 * бы сходить в базу до того, как охрана уведёт гостя на вход.
 */
export default async function RoundsReportPage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const viewer = await requireAdmin();

  const params = await searchParams;
  const view = parseFeedView(params);
  const locale = (await getLocale()) as Locale;
  const model = await buildRoundsModel(view, locale, viewer);
  // Старый `period=today|week|month` — тот же отрезок, но адрес переводится в «с — по».
  if (isLegacyPeriod(params)) {
    redirect(redirectPath(roundsReportHref(toFeedView(model.selection))));
  }

  return <RoundsReportScreen model={model} />;
}
