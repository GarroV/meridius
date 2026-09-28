import type { ReactNode } from "react";

import { PairTabletCard } from "@/blocks/device/ui/PairTabletCard";
import { EditorScreen } from "@/blocks/editor/ui/EditorScreen";

// Редактор — разметка сегмента чек-листа, а не его страница (D162). Предпросмотр и
// подтверждение удаления — дочерние страницы (`preview/`, `delete/`), которые рисуют
// выдвижную панель справа поверх редактора. Будь редактор страницей, переход на панель
// снял бы его с экрана вместе с несохранённой правкой; разметку же Next при переходе
// между её страницами не перерисовывает.
//
// Охрану ставит src/app/admin/layout.tsx, повторять её здесь не нужно. Серверные
// действия редактора зовут requireAdmin() сами: они идут мимо разметки.
//
// Карточку привязки планшета собирает маршрут, а не редактор: правило границ
// (`.dependency-cruiser.cjs`) не даёт блоку `editor` зависеть от блока `device`.
// Редактор отдаёт сюда сохранённую станцию чек-листа и ставит полученную разметку в
// свой боковой столбец — знать, что там внутри, ему не нужно.
export default async function ChecklistEditorLayout({
  params,
  children,
}: {
  readonly params: Promise<{ id: string }>;
  readonly children: ReactNode;
}) {
  const { id } = await params;

  return (
    <>
      <EditorScreen
        checklistId={id}
        stationAction={(stationId) => <PairTabletCard stationId={stationId} />}
      />
      {children}
    </>
  );
}
