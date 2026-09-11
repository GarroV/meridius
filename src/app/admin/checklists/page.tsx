import {
  parseChecklistFilter,
  type SearchParams,
} from "@/blocks/editor/filter";
import { ChecklistsScreen } from "@/blocks/editor/ui/ChecklistsScreen";

/**
 * Экран «Чек-листы» (T0хх; фильтры — T075). Охрану админки страница не повторяет —
 * она уже стоит в `src/app/admin/layout.tsx`; данные экран читает внутри себя, поэтому
 * странице остаётся разобрать адрес: сужение списка живёт в нём, а не в памяти
 * компонента, и ссылкой на «Кухню Алматы» можно поделиться.
 */
export default async function ChecklistsPage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const filter = parseChecklistFilter(await searchParams);

  return <ChecklistsScreen filter={filter} />;
}
