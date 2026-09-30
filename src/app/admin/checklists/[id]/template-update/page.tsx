import { TemplateUpdatePanel } from "@/blocks/editor/ui/TemplateUpdatePanel";

/**
 * «Что изменилось в шаблоне» — выдвижная панель поверх редактора копии (D162, T336).
 * Панель сама читает отличия и сама решает `notFound()`: у своего чек-листа их нет.
 * `?stale=1` ставит действие «взять», когда шаблон успел уйти дальше показанного.
 */
export default async function TemplateUpdatePage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ id: string }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  return <TemplateUpdatePanel id={id} stale={query["stale"] === "1"} />;
}
