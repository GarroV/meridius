import { getLocale } from "next-intl/server";

import { requireAdmin } from "@/blocks/auth/guard";
import type { Locale } from "@/blocks/core/locale";
import { FeedScreen } from "@/blocks/feed/ui/FeedScreen";
import { buildFeedModel } from "@/blocks/feed/ui/build-model";
import { parseFeedView, type SearchParams } from "@/blocks/feed/view";

/**
 * Лента заполнений: что и когда заполнено на точках (T044, T045).
 *
 * `requireAdmin()` зовётся здесь, а не только в разметке `src/app/admin/layout.tsx`:
 * разметка и страница рендерятся параллельно, поэтому без этой строки страница успела
 * бы сходить в базу до того, как охрана уведёт гостя на вход.
 */
export default async function FeedPage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const viewer = await requireAdmin();

  const view = parseFeedView(await searchParams);
  const locale = (await getLocale()) as Locale;
  const model = await buildFeedModel(view, locale, viewer);

  return <FeedScreen model={model} />;
}
