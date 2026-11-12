// Спокойный обзор пиццерий на сегодня (D189). Статусы и область доступа — общие со статистикой.
import { scopeOf, type Viewer } from "@/blocks/auth/scope";
import type { Locale } from "@/blocks/core/locale";
import { listAlarms } from "@/blocks/feed/alarms";
import { loadFeedCatalog } from "@/blocks/feed/options";
import { storeStatsHref } from "@/blocks/feed/stats-view";
import {
  todayStatusOf,
  type TodayStatusKind,
} from "@/blocks/feed/today-status";
import { listLiveChecklists } from "@/blocks/feed/today-windows";

export async function loadHome(
  _locale: Locale,
  viewer: Viewer,
  country?: string,
  now = new Date(),
) {
  const visible = scopeOf(viewer);
  const catalog = await loadFeedCatalog(visible);
  const countries = catalog.countries.toSorted((a, b) =>
    a.name.localeCompare(b.name),
  );
  const countryId = countries.some((row) => row.id === country)
    ? country
    : countries[0]?.id;
  const scope = { visible, ...(countryId === undefined ? {} : { countryId }) };
  const [live, alarms] = await Promise.all([
    listLiveChecklists(scope, now),
    listAlarms(scope, now),
  ]);
  return {
    countries,
    countryId,
    // Чья это зона: у партнёра — его название и его страны (D145). У УК — вся сеть,
    // и подписывать нечего.
    owner:
      viewer.tenantKind === "partner"
        ? { name: viewer.tenantName, countries: countries.map((c) => c.name) }
        : null,
    capped: live.capped || alarms.capped,
    stores: catalog.stores
      .filter((row) => row.countryId === countryId)
      .toSorted((a, b) => a.name.localeCompare(b.name))
      .map((store) => {
        const statuses = live.rows
          .filter((row) => row.storeId === store.id)
          .map((row) => todayStatusOf(row.day, now));
        const count = (kind: TodayStatusKind) =>
          statuses.filter((status) => status.kind === kind).length;
        return {
          id: store.id,
          name: store.name,
          href: storeStatsHref(store.id),
          total: statuses.length,
          filled: count("filled"),
          open: count("open"),
          upcoming: count("upcoming"),
          missed: count("missed"),
          notExpected: count("notExpected"),
          unknown: count("unknownZone"),
          alarms: alarms.alarms.filter((alarm) => alarm.storeId === store.id)
            .length,
          remarks: new Set(
            alarms.alarms
              .filter(
                (alarm) =>
                  alarm.storeId === store.id && alarm.kind !== "missed",
              )
              .map((alarm) => alarm.submissionId),
          ).size,
        };
      }),
  };
}
export type HomeModel = Awaited<ReturnType<typeof loadHome>>;
