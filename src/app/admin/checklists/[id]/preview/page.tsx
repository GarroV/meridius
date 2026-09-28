import { PreviewScreen } from "@/blocks/editor/ui/PreviewScreen";

/**
 * Предпросмотр «как это увидит сотрудник» (T0хх) — выдвижная панель поверх редактора
 * (D162). Панель сама ходит за черновиком (`loadEditor(id)`) и сама решает
 * `notFound()` — странице здесь нечего собирать.
 */
export default async function ChecklistPreviewPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ id: string }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const mode = (await searchParams)["mode"];
  return (
    <PreviewScreen id={id} mode={typeof mode === "string" ? mode : undefined} />
  );
}
