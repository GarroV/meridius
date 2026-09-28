import { RemoveChecklistPanel } from "@/blocks/editor/ui/RemoveChecklistPanel";

/**
 * Подтверждение удаления чек-листа — выдвижная панель поверх редактора (D162). Панель
 * сама читает состояние и сама решает `notFound()` — странице здесь нечего собирать.
 */
export default async function RemoveChecklistPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <RemoveChecklistPanel id={id} />;
}
