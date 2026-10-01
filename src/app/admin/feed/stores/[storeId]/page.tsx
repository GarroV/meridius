import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";

import { requireAdmin } from "@/blocks/auth/guard";
import type { Locale } from "@/blocks/core/locale";
import { parseStatsDays } from "@/blocks/feed/stats-view";
import { StoreStatsScreen } from "@/blocks/feed/ui/StoreStatsScreen";
import { buildStoreModel } from "@/blocks/feed/ui/build-store-model";
import { parseFeedView, type SearchParams } from "@/blocks/feed/view";

/**
 * Экран пиццерии раздела «Статистика» (D179): её чек-листы со статистикой за 7/30 дней и
 * статусом на сегодня, тревоги и лента заполнений. Чужая или несуществующая пиццерия —
 * «не найдено», как чужое заполнение (D145).
 *
 * `requireAdmin()` — здесь, а не только в разметке: разметка и страница рендерятся
 * параллельно.
 */
export default async function StoreStatsPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ storeId: string }>;
  readonly searchParams: Promise<SearchParams>;
}) {
  const viewer = await requireAdmin();

  const { storeId } = await params;
  const query = await searchParams;
  const locale = (await getLocale()) as Locale;
  const model = await buildStoreModel(
    { storeId, days: parseStatsDays(query), feed: parseFeedView(query) },
    locale,
    viewer,
  );
  if (model === null) notFound();

  return <StoreStatsScreen model={model} />;
}
