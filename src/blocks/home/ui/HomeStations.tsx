import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactElement } from "react";

import { ADMIN_SECTIONS } from "@/blocks/core/admin-sections";
import type { FeedPeriod } from "@/blocks/feed/period";

import type { HomeStation, StationStatus, StoreSummary } from "../summary";
import { homeHref } from "../view";
import { ago } from "./ago";
import {
  CARD_CLASS,
  COUNT_CLASS,
  HEAD_CLASS,
  LINK_CLASS,
  META_CLASS,
  TABLE_CLASS,
  TD_CLASS,
  TD_NUM_CLASS,
  TH_CLASS,
  TITLE_CLASS,
  TR_CLASS,
} from "./style";

// Отметка — канонический `.tag` ядра (D164): работает — ровным, дырки — тревожными.
const STATUS_CLASS: Readonly<Record<StationStatus, string>> = {
  working: "tag tag--ok",
  silent: "tag tag--warn",
  noChecklist: "tag tag--err",
};

/**
 * Станции пиццерии: чек-лист, планшет и когда был на связи, последнее заполнение.
 * Строка ведёт в выдвижную панель станции раздела «Устройства» (`?station=<id>`) —
 * там привязка и отвязка; своей копии панели у главной нет.
 */
export async function StationsTable({
  stations,
  now,
  locale,
}: {
  readonly stations: readonly HomeStation[];
  readonly now: Date;
  readonly locale: string;
}): Promise<ReactElement> {
  const t = await getTranslations("adminHome.stations");

  return (
    <section className={CARD_CLASS} data-testid="home-stations">
      <div className={HEAD_CLASS}>
        <h2 className={TITLE_CLASS}>{t("title")}</h2>
        <span className={COUNT_CLASS}>
          {t("count", { count: stations.length })}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className={TABLE_CLASS}>
          <thead>
            <tr>
              <th className={TH_CLASS}>{t("columnStation")}</th>
              <th className={TH_CLASS}>{t("columnStatus")}</th>
              <th className={TH_CLASS}>{t("columnTablet")}</th>
              <th className={TH_CLASS}>{t("columnLastFill")}</th>
            </tr>
          </thead>
          <tbody>
            {stations.map((station) => (
              <tr
                key={station.id}
                className={TR_CLASS}
                data-testid="home-station"
              >
                <td className={TD_CLASS}>
                  <Link
                    href={`${ADMIN_SECTIONS.devices.path}?station=${station.id}`}
                    className={LINK_CLASS}
                  >
                    {station.name}
                  </Link>
                  <div className={META_CLASS}>{station.storeName}</div>
                </td>
                <td className={TD_CLASS}>
                  <span className={STATUS_CLASS[station.status]}>
                    {t(`status.${station.status}`)}
                  </span>
                </td>
                <td className={TD_CLASS}>
                  {station.tabletCount === 0 ? (
                    <span className={META_CLASS}>{t("noTablet")}</span>
                  ) : (
                    <>
                      <div>{t("tablets", { count: station.tabletCount })}</div>
                      {station.lastSeenAt === null ? null : (
                        <div className={META_CLASS}>
                          {t("seen", {
                            ago: ago(station.lastSeenAt, now, locale),
                          })}
                        </div>
                      )}
                    </>
                  )}
                </td>
                <td className={TD_NUM_CLASS}>
                  {station.lastSubmissionAt === null
                    ? t("never")
                    : ago(station.lastSubmissionAt, now, locale)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Строка на пиццерию; нажатие сужает главную до неё, не теряя период. */
export async function StoresTable({
  stores,
  period,
  now,
  locale,
}: {
  readonly stores: readonly StoreSummary[];
  readonly period: FeedPeriod;
  readonly now: Date;
  readonly locale: string;
}): Promise<ReactElement> {
  const t = await getTranslations("adminHome.stores");

  return (
    <section className={CARD_CLASS} data-testid="home-stores">
      <div className={HEAD_CLASS}>
        <h2 className={TITLE_CLASS}>{t("title")}</h2>
        <span className={COUNT_CLASS}>
          {t("count", { count: stores.length })}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className={TABLE_CLASS}>
          <thead>
            <tr>
              <th className={TH_CLASS}>{t("columnStore")}</th>
              <th className={TH_CLASS}>{t("columnWorking")}</th>
              <th className={TH_CLASS}>{t("columnTablets")}</th>
              <th className={TH_CLASS}>{t("columnLastFill")}</th>
            </tr>
          </thead>
          <tbody>
            {stores.map((store) => (
              <tr
                key={store.storeId}
                className={TR_CLASS}
                data-testid="home-store"
              >
                <td className={TD_CLASS}>
                  <Link
                    href={homeHref({ storeId: store.storeId, period })}
                    className={LINK_CLASS}
                  >
                    {store.storeName}
                  </Link>
                  <div className={META_CLASS}>{store.countryName}</div>
                </td>
                <td className={TD_NUM_CLASS}>
                  {t("ofTotal", { part: store.working, total: store.total })}
                </td>
                <td className={TD_NUM_CLASS}>
                  {t("ofTotal", { part: store.withTablet, total: store.total })}
                </td>
                <td className={TD_NUM_CLASS}>
                  {store.lastSubmissionAt === null
                    ? t("never")
                    : ago(store.lastSubmissionAt, now, locale)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
