import { getLocale } from "next-intl/server";

import { requireAdmin } from "@/blocks/auth/guard";
import type { Locale } from "@/blocks/core/locale";
import { RoundsReportScreen } from "@/blocks/feed/ui/RoundsReportScreen";
import { buildRoundsModel } from "@/blocks/feed/ui/build-rounds-model";
import { parseFeedView, type SearchParams } from "@/blocks/feed/view";

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
  await requireAdmin();

  const view = parseFeedView(await searchParams);
  const locale = (await getLocale()) as Locale;
  const model = await buildRoundsModel(view, locale);

  return <RoundsReportScreen model={model} />;
}
