import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";

import { requireAdmin } from "@/blocks/auth/guard";
import { redirectPath } from "@/blocks/core/base-path";
import type { Locale } from "@/blocks/core/locale";
import { countryStatsHref } from "@/blocks/feed/stats-view";
import { CountryStatsScreen } from "@/blocks/feed/ui/CountryStatsScreen";
import { buildCountryModel } from "@/blocks/feed/ui/build-country-model";
import { legacyFeedTarget } from "@/blocks/feed/ui/legacy-feed";
import {
  isLegacyPeriod,
  parseFeedView,
  type SearchParams,
} from "@/blocks/feed/view";

/**
 * Раздел «Статистика» (D179): страны слева, плитки пиццерий выбранной страны справа.
 * Старый адрес ленты с пиццерией или станцией уводит на экран пиццерии — лента теперь
 * там (`legacy-feed.ts`).
 *
 * `requireAdmin()` зовётся здесь, а не только в разметке `src/app/admin/layout.tsx`:
 * разметка и страница рендерятся параллельно, поэтому без этой строки страница успела
 * бы сходить в базу до того, как охрана уведёт гостя на вход.
 */
export default async function StatisticsPage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const viewer = await requireAdmin();

  const params = await searchParams;
  const view = parseFeedView(params);
  const legacy = await legacyFeedTarget(view, viewer);
  if (legacy !== null) redirect(redirectPath(legacy));

  const locale = (await getLocale()) as Locale;
  const model = await buildCountryModel(
    { countryId: view.countryId, period: view.period },
    locale,
    viewer,
  );
  // Старый период (`days=7|30`) открывается тем же отрезком, но адрес переводится в
  // «с — по»: даты зависят от пояса страны, поэтому только после сборки модели.
  if (isLegacyPeriod(params)) {
    redirect(
      redirectPath(
        countryStatsHref({
          countryId: model.isExplicit ? model.countryId : null,
          period: model.period,
        }),
      ),
    );
  }

  return <CountryStatsScreen model={model} />;
}
