import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactElement } from "react";

import { ADMIN_SECTIONS } from "@/blocks/core/admin-sections";
import { AdminShell } from "@/blocks/core/ui/AdminShell";

import type { StationGap } from "../gaps";
import type { NetworkStation } from "../overview";
import { countGaps, listNetworkStations } from "../overview";
import { stationHref } from "./view";

/**
 * Раздел «Станции» — единственное место, где живёт всё про станцию (D151).
 *
 * До него привязка была разложена по трём местам, и ни одно не называлось привязкой:
 * чек-лист станции выбирался в справочнике, станция чек-листа — в редакторе, пин
 * планшета выпускался с карточки чек-листа, а раздел «Устройства» умел только смотреть.
 * Два входа противоречили друг другу — из одного привязывали чек-лист к станции, из
 * другого станцию к чек-листу, — и владелец сформулировал итог точно: «я не вижу как
 * привязать».
 *
 * Экран показывает не опись сети, а места, где продукт молча не работает. Поэтому
 * первое, что человек видит, — счёт дырок, и он же переключает список на них.
 */

const INTRO_CLASS =
  "rounded-[var(--r-block)] border border-[var(--line-strong)] bg-[var(--surface-2)] px-[var(--space-7)] py-[var(--space-6)] text-[length:var(--fs-dense)] leading-[var(--lh-dense)] text-[var(--ink-2)]";
const FILTERS_CLASS = "flex flex-wrap gap-[var(--space-3)]";
const CHIP_CLASS =
  "flex h-[var(--control-h)] items-center rounded-[var(--r-pill)] border px-[var(--space-6)] text-[length:var(--fs-dense)] no-underline";
const CHIP_IDLE_CLASS =
  "bg-surface border-[var(--line-control)] text-[var(--ink-2)]";
const CHIP_ACTIVE_CLASS =
  "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)] font-medium";
const EMPTY_CLASS =
  "rounded-[var(--r-block)] border border-[var(--line)] bg-surface px-[var(--space-8)] py-[var(--space-10)] text-center text-[var(--ink-2)]";
const COUNTRY_CARD_CLASS =
  "bg-surface flex flex-col gap-[var(--space-6)] rounded-[var(--r-block)] border border-[var(--line-strong)] p-[var(--space-7)] shadow-[var(--sh-xs)]";
const COUNTRY_TITLE_CLASS =
  "text-[length:var(--fs-title)] leading-[var(--lh-title)] font-semibold";
const STORE_BLOCK_CLASS =
  "flex flex-col gap-[var(--space-4)] border-t border-[var(--line)] pt-[var(--space-5)]";
const STORE_TITLE_CLASS =
  "text-[length:var(--fs-lead)] leading-[var(--lh-lead)] font-medium";
const ROW_CLASS =
  "flex flex-wrap items-center gap-x-[var(--space-6)] gap-y-[var(--space-2)] rounded-[var(--r-control)] border border-[var(--line)] px-[var(--space-6)] py-[var(--space-4)]";
const ROW_NAME_CLASS = "min-w-[160px] font-medium";
const META_CLASS =
  "text-[length:var(--fs-meta)] leading-[var(--lh-meta)] text-[var(--ink-3)]";
const GAP_CLASS =
  "text-err rounded-[var(--r-mark)] bg-[var(--err-soft)] px-[var(--space-3)] py-[var(--space-1)] text-[length:var(--fs-meta)] font-medium";

/**
 * Адрес раздела берётся из общего списка, а не пишется строкой: адреса кабинета в этом
 * проекте вычищали трижды, и каждый раз блок держал собственную копию того, что уже
 * лежит в `core/admin-sections` (T116, T118, T119). Сторож `admin-paths.test.ts` ловит
 * возврат к строке — он и поймал её здесь.
 */
const SECTION_PATH = ADMIN_SECTIONS.stations.path;

/** Значения фильтра в адресе. Совпадают с именами дырок: одно имя на продукт. */
const GAP_FILTERS: readonly StationGap[] = ["noChecklist", "silent"];

function isGapFilter(value: string | undefined): value is StationGap {
  return value !== undefined && GAP_FILTERS.includes(value as StationGap);
}

interface StoreGroup {
  readonly storeId: string;
  readonly storeName: string;
  readonly stations: readonly NetworkStation[];
}

interface CountryGroup {
  readonly countryId: string;
  readonly countryName: string;
  readonly stores: readonly StoreGroup[];
}

/**
 * Дерево собирается из уже отсортированного списка одним проходом, а не сортировкой на
 * месте: порядок задаёт база (`listNetworkStations`), и пересобирать его здесь значит
 * завести второй источник правды о порядке — он разъедется с печатью наклеек.
 */
function groupByCountry(
  rows: readonly NetworkStation[],
): readonly CountryGroup[] {
  const countries: CountryGroup[] = [];

  for (const row of rows) {
    let country = countries.at(-1);
    if (country?.countryId !== row.countryId) {
      country = {
        countryId: row.countryId,
        countryName: row.countryName,
        stores: [],
      };
      countries.push(country);
    }

    const stores = country.stores as StoreGroup[];
    let store = stores.at(-1);
    if (store?.storeId !== row.storeId) {
      store = { storeId: row.storeId, storeName: row.storeName, stations: [] };
      stores.push(store);
    }

    (store.stations as NetworkStation[]).push(row);
  }

  return countries;
}

function StationRow({
  station,
  t,
}: {
  readonly station: NetworkStation;
  readonly t: Awaited<ReturnType<typeof getTranslations>>;
}): ReactElement {
  return (
    <div className={ROW_CLASS} data-testid="station-row">
      <Link
        href={stationHref(station.id)}
        className={ROW_NAME_CLASS}
        data-testid="station-link"
      >
        {station.name}
      </Link>

      {station.checklistCount === 0 ? (
        <span className={GAP_CLASS} data-testid="gap-noChecklist">
          {t("gaps.noChecklist")}
        </span>
      ) : (
        <span className={META_CLASS}>
          {t("checklists", { count: station.checklistCount })}
        </span>
      )}

      {station.gaps.includes("silent") ? (
        <span className={GAP_CLASS} data-testid="gap-silent">
          {t("gaps.silent")}
        </span>
      ) : null}

      <span className={META_CLASS}>
        {station.deviceCount > 0 ? t("tabletPaired") : t("stickerOnly")}
      </span>
    </div>
  );
}

export interface StationsScreenProps {
  /** Значение фильтра из адреса. Неизвестное — показываем всё, а не пустоту. */
  readonly gap?: string | undefined;
}

export async function StationsScreen({
  gap,
}: StationsScreenProps): Promise<ReactElement> {
  const t = await getTranslations("stations");
  const all = await listNetworkStations();
  const counts = countGaps(all);

  const active = isGapFilter(gap) ? gap : undefined;
  const rows =
    active === undefined
      ? all
      : all.filter((station) => station.gaps.includes(active));

  const countries = groupByCountry(rows);

  return (
    <AdminShell
      testId="stations-screen"
      active="stations"
      breadcrumb={t("breadcrumb")}
      title={t("title")}
      topbarAction={null}
    >
      {/* D152: раздел объясняет себя сам, строкой цели на самом экране. */}
      <p className={INTRO_CLASS}>{t("intro")}</p>

      <div className={FILTERS_CLASS} data-testid="station-filters">
        <Link
          href={SECTION_PATH}
          data-testid="filter-all"
          aria-current={active === undefined ? "page" : undefined}
          className={`${CHIP_CLASS} ${active === undefined ? CHIP_ACTIVE_CLASS : CHIP_IDLE_CLASS}`}
        >
          {t("filters.all", { count: all.length })}
        </Link>
        {GAP_FILTERS.map((name) => (
          <Link
            key={name}
            href={`${SECTION_PATH}?gap=${name}`}
            data-testid={`filter-${name}`}
            aria-current={active === name ? "page" : undefined}
            className={`${CHIP_CLASS} ${active === name ? CHIP_ACTIVE_CLASS : CHIP_IDLE_CLASS}`}
          >
            {t(`filters.${name}`, { count: counts[name] })}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className={EMPTY_CLASS} data-testid="stations-empty">
          {active === undefined ? t("empty") : t("emptyFiltered")}
        </p>
      ) : (
        <div className="flex flex-col gap-[var(--space-7)]">
          {countries.map((country) => (
            <section key={country.countryId} className={COUNTRY_CARD_CLASS}>
              <h2 className={COUNTRY_TITLE_CLASS}>{country.countryName}</h2>
              {country.stores.map((store) => (
                <div key={store.storeId} className={STORE_BLOCK_CLASS}>
                  <h3 className={STORE_TITLE_CLASS}>{store.storeName}</h3>
                  {store.stations.map((station) => (
                    <StationRow key={station.id} station={station} t={t} />
                  ))}
                </div>
              ))}
            </section>
          ))}
        </div>
      )}
    </AdminShell>
  );
}
