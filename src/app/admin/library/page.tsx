import { getLocale } from "next-intl/server";

import { requireAdmin } from "@/blocks/auth/guard";
import { buildLibraryModel } from "@/blocks/library/ui/build-model";
import { LibraryScreen } from "@/blocks/library/ui/LibraryScreen";
import { parseLibraryView, type SearchParams } from "@/blocks/library/ui/view";

/**
 * Экран библиотеки переиспользуемых блоков (D011).
 *
 * `requireAdmin()` зовётся здесь, а не только в разметке `src/app/admin/layout.tsx`:
 * разметка и страница рендерятся параллельно, поэтому без этой строки страница успела
 * бы сходить в базу до того, как охрана уведёт гостя на вход.
 */
export default async function LibraryPage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  await requireAdmin();

  const view = parseLibraryView(await searchParams);
  const locale = await getLocale();
  const model = await buildLibraryModel(view, locale);

  return <LibraryScreen model={model} locale={locale} />;
}
