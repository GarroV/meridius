import { getLocale } from "next-intl/server";

import { requireAdmin } from "@/blocks/auth/guard";
import { buildCatalogModel } from "@/blocks/catalog/ui/build-model";
import { CatalogScreen } from "@/blocks/catalog/ui/CatalogScreen";
import { parseCatalogView, type SearchParams } from "@/blocks/catalog/ui/view";
import type { Locale } from "@/blocks/core/locale";

/**
 * Экран справочника: страны → пиццерии → станции (D007).
 *
 * `requireAdmin()` зовётся здесь, а не только в разметке `src/app/admin/layout.tsx`:
 * разметка и страница рендерятся параллельно, поэтому без этой строки страница успела
 * бы сходить в базу до того, как охрана уведёт гостя на вход.
 */
export default async function CatalogPage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const viewer = await requireAdmin();

  const view = parseCatalogView(await searchParams);
  const locale = (await getLocale()) as Locale;
  const model = await buildCatalogModel(view, locale, viewer);

  return <CatalogScreen model={model} />;
}
