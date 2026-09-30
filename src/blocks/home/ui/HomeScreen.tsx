import { getTranslations } from "next-intl/server";
import type { ReactElement } from "react";

import { ADMIN_HOME } from "@/blocks/core/admin-sections";
import { FeedFilters } from "@/blocks/feed/ui/FeedFilters";
import { FeedMetrics } from "@/blocks/feed/ui/FeedMetrics";
import type { FeedView } from "@/blocks/feed/view";

import type { HomeModel } from "../load";
import { HomeChecklists } from "./HomeChecklists";
import { HomeRecent } from "./HomeRecent";
import { StationsTable, StoresTable } from "./HomeStations";
import { HomeTodo } from "./HomeTodo";
import { CARD_CLASS, META_CLASS } from "./style";

const WORKING_CLASS = `${CARD_CLASS} flex flex-col justify-center p-[var(--space-7)]`;
const WORKING_VALUE_CLASS =
  "text-[length:var(--fs-num-hero)] leading-[1.1] font-semibold font-[family-name:var(--font-num)] [font-variant-numeric:tabular-nums]";

/**
 * Главная кабинета — пульт сети (D174), а не ссылки на разделы: меню слева и так ведёт
 * в разделы. Сверху вниз: область (страна → пиццерия → станция, период), цифры за
 * период, что не закрыто, мои чек-листы (D148), станции области, что происходит.
 */
export async function HomeScreen({
  model,
  view,
  now,
  locale,
}: {
  readonly model: HomeModel;
  readonly view: FeedView;
  readonly now: Date;
  readonly locale: string;
}): Promise<ReactElement> {
  const t = await getTranslations("adminHome");
  const { feed } = model;

  return (
    <div
      data-testid="admin-home"
      className="flex flex-col gap-[var(--space-7)]"
    >
      <FeedFilters
        selection={feed.selection}
        timeZone={feed.timeZone}
        timeZoneAmbiguous={feed.timeZoneAmbiguous}
        action={ADMIN_HOME.path}
      />

      <div className="grid gap-[var(--space-7)] lg:grid-cols-[minmax(0,1fr)_minmax(0,3fr)]">
        <div className={WORKING_CLASS} data-testid="home-working">
          <div className={WORKING_VALUE_CLASS}>
            {t("working.value", {
              working: model.working.working,
              total: model.working.total,
            })}
          </div>
          <div className={`${META_CLASS} mt-[var(--space-3)]`}>
            {t("working.caption", { total: model.working.total })}
          </div>
        </div>
        <FeedMetrics metrics={feed.metrics} period={feed.selection.period} />
      </div>

      <HomeTodo gaps={model.gaps} drafts={model.drafts} />

      <HomeChecklists
        checklists={model.checklists}
        total={model.checklistTotal}
        isFiltered={model.isFiltered}
      />

      {model.stations.length === 0 ? (
        <p className={`${CARD_CLASS} ${META_CLASS} m-0 p-[var(--space-7)]`}>
          {t("noStations")}
        </p>
      ) : model.isStoreLevel ? (
        <StationsTable stations={model.stations} now={now} locale={locale} />
      ) : (
        <StoresTable
          stores={model.stores}
          period={feed.selection.period}
          now={now}
          locale={locale}
        />
      )}

      <HomeRecent feed={feed} view={view} now={now} locale={locale} />
    </div>
  );
}
