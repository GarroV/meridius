import { redirect } from "next/navigation";

import { requireAdmin } from "@/blocks/auth/guard";
import { redirectPath } from "@/blocks/core/base-path";
import { legacyStatsTarget } from "@/blocks/feed/stats-view";
import type { SearchParams } from "@/blocks/feed/view";

/**
 * Бывший экран статистики (D150, D170). С D179 статистика — сам раздел: страна —
 * плитками пиццерий, пиццерия — своим экраном. Адрес остаётся живым ради закладок:
 * страна, пиццерия и период доезжают до нового места.
 *
 * `requireAdmin()` — первой строкой, как у любой страницы кабинета.
 */
export default async function LegacyStatsPage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  await requireAdmin();
  redirect(redirectPath(legacyStatsTarget(await searchParams)));
}
