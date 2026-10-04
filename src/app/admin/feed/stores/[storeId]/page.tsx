import { notFound, redirect } from "next/navigation";
import { getLocale } from "next-intl/server";

import { requireAdmin } from "@/blocks/auth/guard";
import type { Locale } from "@/blocks/core/locale";
import { redirectPath } from "@/blocks/core/base-path";
import { storeStatsHref } from "@/blocks/feed/stats-view";
import { StoreStatsScreen } from "@/blocks/feed/ui/StoreStatsScreen";
import { buildStoreModel } from "@/blocks/feed/ui/build-store-model";
import {
  isLegacyPeriod,
  parseFeedView,
  type SearchParams,
} from "@/blocks/feed/view";

/**
 * Экран пиццерии раздела «Статистика» (D179): её чек-листы со статистикой за период и
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
    { storeId, feed: parseFeedView(query) },
    locale,
    viewer,
  );
  if (model === null) notFound();
  // Старый период (`days=`, `period=`) — тот же отрезок, но адрес переводится в «с — по».
  if (isLegacyPeriod(query)) {
    const { period, stationId } = model.feed.selection;
    redirect(redirectPath(storeStatsHref(storeId, { period, stationId })));
  }

  return <StoreStatsScreen model={model} />;
}
