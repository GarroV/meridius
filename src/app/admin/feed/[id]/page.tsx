import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";

import { requireAdmin } from "@/blocks/auth/guard";
import type { Locale } from "@/blocks/core/locale";
import { SubmissionScreen } from "@/blocks/feed/ui/SubmissionScreen";
import { buildSubmissionModel } from "@/blocks/feed/ui/build-model";
import { feedHref, parseFeedView, type SearchParams } from "@/blocks/feed/view";

/**
 * Карточка одного заполнения (T046): ответ и время по каждому пункту, комментарии к
 * проваленным и пункты снимком той версии, по которой заполняли (D002).
 *
 * Фильтры ленты доезжают до карточки в адресе и возвращают управляющего туда же,
 * откуда он пришёл, — иначе после каждого заполнения фильтры пришлось бы ставить заново.
 */
export default async function SubmissionPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ id: string }>;
  readonly searchParams: Promise<SearchParams>;
}) {
  const viewer = await requireAdmin();

  const { id } = await params;
  const locale = (await getLocale()) as Locale;
  const backHref = feedHref(parseFeedView(await searchParams));
  const model = await buildSubmissionModel(id, locale, backHref, viewer);

  // Ссылка на несуществующее заполнение — это именно «не найдено», а не пустая
  // карточка со статусом 200: объяснение рисует not-found.tsx рядом.
  if (model === null) notFound();

  return <SubmissionScreen model={model} />;
}
