import type { ReactNode } from "react";

import { ChecklistsWorkspace } from "@/blocks/editor/ui/ChecklistsWorkspace";

/**
 * Раздел «Чек-листы» — мастер-деталь (D162): колонка чек-листов живёт здесь, в разметке
 * сегмента, а справа меняется `children` — пустая рабочая зона, заведение, редактор.
 * Next разметку сегмента при переходе между его страницами не перерисовывает, поэтому
 * выбор другого чек-листа не трогает колонку: ни прокрутки, ни набранного поиска.
 *
 * Охрану кабинета разметка не повторяет — она стоит выше, в `src/app/admin/layout.tsx`.
 */
export default function ChecklistsLayout({
  children,
}: {
  readonly children: ReactNode;
}) {
  return <ChecklistsWorkspace>{children}</ChecklistsWorkspace>;
}
