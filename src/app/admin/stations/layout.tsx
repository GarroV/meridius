import type { ReactNode } from "react";

import { StationsWorkspace } from "@/blocks/stations/ui/StationsWorkspace";

/**
 * Раздел «Станции» — мастер-деталь (D163): колонка станций живёт здесь, в разметке
 * сегмента, а справа меняется `children` — экран раздела с раскаткой или карточка
 * станции. Выбор другой станции колонку не перерисовывает.
 *
 * Охрану кабинета разметка не повторяет — она стоит выше, в `src/app/admin/layout.tsx`.
 */
export default function StationsLayout({
  children,
}: {
  readonly children: ReactNode;
}) {
  return <StationsWorkspace>{children}</StationsWorkspace>;
}
