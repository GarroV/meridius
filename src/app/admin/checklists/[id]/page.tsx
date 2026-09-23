import { EditorScreen } from "@/blocks/editor/ui/EditorScreen";
import { PairTabletCard } from "@/blocks/device/ui/PairTabletCard";

// Экран под /admin — охрану ставит src/app/admin/layout.tsx, повторять её здесь не нужно.
// Серверные действия редактора зовут requireAdmin() сами: они идут мимо разметки.
//
// Карточку привязки планшета собирает СТРАНИЦА, а не редактор: правило границ
// (`.dependency-cruiser.cjs`) не даёт блоку `editor` зависеть от блока `device`.
// Редактор отдаёт сюда сохранённую станцию чек-листа и ставит полученную разметку в
// свой боковой столбец — знать, что там внутри, ему не нужно.
export default async function ChecklistEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <EditorScreen
      checklistId={id}
      stationAction={(stationId) => <PairTabletCard stationId={stationId} />}
    />
  );
}
