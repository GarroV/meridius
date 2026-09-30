import { getLocale } from "next-intl/server";

import { requireHqViewer } from "@/blocks/auth/access";
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
  const viewer = await requireAdmin();

  const view = parseLibraryView(await searchParams);
  // Открыть блок в редакторе — правка библиотеки, а её ведёт только УК (D145, T338):
  // партнёру адрес редактора отвечает тем же, что несуществующая запись. Сам список
  // ему виден — без ссылок и без редактора (`buildLibraryModel`).
  if (view.blockId !== undefined) requireHqViewer(viewer);
  const locale = await getLocale();
  const model = await buildLibraryModel(view, locale, viewer);

  return <LibraryScreen model={model} locale={locale} />;
}
