import { getLocale } from "next-intl/server";

import { requireAdmin } from "@/blocks/auth/guard";
import type { Locale } from "@/blocks/core/locale";
import { StatsScreen } from "@/blocks/feed/ui/StatsScreen";
import { buildStatsModel } from "@/blocks/feed/ui/build-stats-model";
import { parseStatsView } from "@/blocks/feed/stats-view";
import type { SearchParams } from "@/blocks/feed/view";

/**
 * Статистика по стране и по пиццерии (D150, D170). `requireAdmin()` — здесь, а не
 * только в разметке: разметка и страница рендерятся параллельно (см. отчёт по обходам).
 */
export default async function StatsPage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const viewer = await requireAdmin();

  const view = parseStatsView(await searchParams);
  const locale = (await getLocale()) as Locale;
  const model = await buildStatsModel(view, locale, viewer);

  return <StatsScreen model={model} />;
}
