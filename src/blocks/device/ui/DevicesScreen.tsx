import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import type { ReactElement } from "react";

import { ADMIN_SECTIONS } from "@/blocks/core/admin-sections";
import type { Locale } from "@/blocks/core/locale";
import { AdminShell } from "@/blocks/core/ui/AdminShell";
import { Icon } from "@/blocks/core/ui/Icon";

import { PIN_TTL_SECONDS } from "../pin";
import type { StationTablets } from "../station-tablets";
import { PairGuide } from "./PairGuide";
import { StationDrawer } from "./StationDrawer";

/**
 * Раздел кабинета «Устройства» (T297, D163): какой планшет на какой станции стоит, где
 * планшета нет, и отсюда же — привязка, перепривязка и отвязка.
 *
 * Владелец: «я не понимаю как привязать планшет в пиццерии … чтобы менеджерить кому что
 * привязывать, во вторых чтобы отвязывать + визуальная инструкция». Поэтому экран
 * устроен так: сверху инструкция по шагам с настоящим адресом, ниже ВСЕ станции сети
 * (страна → пиццерия → станция) с отметкой «планшет привязан / без планшета», а работа
 * со станцией — в выдвижной панели справа (D162, эталон Swarm), открытой параметром
 * адреса `?station=<id>`. Список под панелью остаётся на месте.
 *
 * Крошка реиспользует `admin.nav.groups.reference` («Справочник»): раздел лежит в той же
 * группе меню, что и справочник.
 */

const SECONDS_IN_MINUTE = 60;
const MILLISECONDS = 1000;
/**
 * «Не на связи больше суток». Отметка «был на связи» пишется раз в пять минут, пока
 * вкладка открыта (`devices.ts`), а кухня работает каждый день — сутки тишины значат,
 * что планшет выключен, сломан или его унесли. Меньший порог пугал бы ночной паузой.
 */
const STALE_AFTER_MS = 24 * 60 * 60 * MILLISECONDS;

const NOTICE_CLASS =
  "rounded-[var(--r-block)] border border-[var(--line-strong)] bg-[var(--surface-2)] px-[var(--space-7)] py-[var(--space-6)] text-[length:var(--fs-dense)] leading-[var(--lh-dense)] text-[var(--ink-2)]";
const SUMMARY_CLASS =
  "text-[length:var(--fs-meta)] leading-[var(--lh-meta)] text-[var(--ink-3)]";
const EMPTY_CLASS =
  "rounded-[var(--r-block)] border border-[var(--line)] bg-surface px-[var(--space-8)] py-[var(--space-10)] text-center text-[var(--ink-2)]";
const COUNTRY_CARD_CLASS =
  "bg-surface flex flex-col rounded-[var(--r-block)] border border-[var(--line-strong)] shadow-[var(--sh-xs)]";
const COUNTRY_TITLE_CLASS =
  "border-b border-[var(--line)] px-[var(--space-7)] py-[var(--space-6)] text-[length:var(--fs-title)] leading-[var(--lh-title)] font-semibold";
const STORE_TITLE_CLASS =
  "flex items-center gap-[var(--space-4)] bg-[var(--surface-2)] px-[var(--space-7)] py-[var(--space-4)] text-[length:var(--fs-micro)] leading-[var(--lh-micro)] font-semibold tracking-[var(--tracking-micro)] text-[var(--ink-3)] uppercase";
// Строка — обычный текст, а не синяя ссылка (D162): вся строка открывает панель, и
// подчёркнутое название читалось бы как «уйти на другую страницу». Наведение — фоном.
const ROW_CLASS =
  "text-ink hover:text-ink flex flex-wrap items-center gap-x-[var(--space-6)] gap-y-[var(--space-2)] border-t border-[var(--line)] px-[var(--space-7)] py-[var(--space-5)] no-underline hover:bg-[var(--surface-2)] hover:no-underline focus-visible:bg-[var(--surface-2)] aria-[current=true]:bg-[var(--accent-soft)]";
const ROW_NAME_CLASS =
  "min-w-[160px] flex-1 text-[length:var(--fs-body)] font-medium";
const ROW_META_CLASS =
  "text-[length:var(--fs-meta)] leading-[var(--lh-meta)] text-[var(--ink-3)] tabular-nums";

interface StoreGroup {
  readonly storeId: string;
  readonly storeName: string;
  readonly stations: StationTablets[];
}

interface CountryGroup {
  readonly countryId: string;
  readonly countryName: string;
  readonly stores: StoreGroup[];
}

/**
 * Дерево страна → пиццерия → станция из уже отсортированного списка
 * (`listStationTablets()` отдаёт строки в этом порядке). Группировка — по
 * идентификаторам соседних строк: две пиццерии с одним названием не склеиваются.
 */
function groupByCountry(
  rows: readonly StationTablets[],
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

    let store = country.stores.at(-1);
    if (store?.storeId !== row.storeId) {
      store = { storeId: row.storeId, storeName: row.storeName, stations: [] };
      country.stores.push(store);
    }

    store.stations.push(row);
  }

  return countries;
}

/** Самая свежая отметка «был на связи» среди планшетов станции. */
function lastSeenOf(station: StationTablets): Date | null {
  let latest: Date | null = null;
  for (const tablet of station.tablets) {
    if (latest === null || tablet.lastSeenAt > latest) {
      latest = tablet.lastSeenAt;
    }
  }
  return latest;
}

export interface DevicesScreenProps {
  readonly stations: readonly StationTablets[];
  /** Станция в выдвижной панели (`?station=<id>`); `undefined` — панель закрыта. */
  readonly selected: StationTablets | null | undefined;
  /** Планшет, про который сейчас задан вопрос об отвязке (`&confirm=<deviceId>`). */
  readonly confirmId: string | null;
  /** Последняя отвязка не удалась (`&failed=1`) — гонка с параллельной отвязкой. */
  readonly failed: boolean;
  /** Что набрать на планшете: полный адрес страницы привязки. */
  readonly pairAddress: string;
  readonly now: Date;
}

export async function DevicesScreen({
  stations,
  selected,
  confirmId,
  failed,
  pairAddress,
  now,
}: DevicesScreenProps): Promise<ReactElement> {
  const t = await getTranslations("device.admin");
  const tAdmin = await getTranslations("admin");
  const locale = (await getLocale()) as Locale;
  const devicesPath = ADMIN_SECTIONS.devices.path;
  const minutes = PIN_TTL_SECONDS / SECONDS_IN_MINUTE;

  const dateFormat = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const paired = stations.filter((row) => row.tablets.length > 0).length;
  const countries = groupByCountry(stations);
  const selectedId = selected?.stationId ?? null;

  return (
    <AdminShell
      testId="devices-screen"
      active="devices"
      breadcrumb={tAdmin("nav.groups.reference")}
      title={t("title")}
      topbarAction={null}
    >
      <p className={NOTICE_CLASS}>{t("notice")}</p>

      <PairGuide address={pairAddress} minutes={minutes} />

      {stations.length === 0 ? (
        <p className={EMPTY_CLASS} data-testid="devices-empty">
          {t("empty")}
        </p>
      ) : (
        <>
          <p className={SUMMARY_CLASS} data-testid="devices-summary">
            {t("summary", {
              stations: stations.length,
              paired,
              unpaired: stations.length - paired,
            })}
          </p>
          <div className="flex flex-col gap-[var(--space-7)]">
            {countries.map((country) => (
              <section
                key={country.countryId}
                className={COUNTRY_CARD_CLASS}
                aria-labelledby={`country-${country.countryId}`}
              >
                <h2
                  id={`country-${country.countryId}`}
                  className={COUNTRY_TITLE_CLASS}
                >
                  {country.countryName}
                </h2>
                {country.stores.map((store) => (
                  <div key={store.storeId}>
                    <h3 className={STORE_TITLE_CLASS}>
                      <Icon name="home" className="h-[14px] w-[14px]" />
                      {store.storeName}
                    </h3>
                    {store.stations.map((station) => {
                      const count = station.tablets.length;
                      const seen = lastSeenOf(station);
                      const isStale =
                        seen !== null &&
                        now.getTime() - seen.getTime() > STALE_AFTER_MS;
                      return (
                        <Link
                          key={station.stationId}
                          href={`${devicesPath}?station=${station.stationId}`}
                          scroll={false}
                          data-testid="station-row"
                          data-station-id={station.stationId}
                          data-paired={count > 0 ? "true" : "false"}
                          aria-current={
                            station.stationId === selectedId
                              ? "true"
                              : undefined
                          }
                          aria-label={t("open", {
                            station: station.stationName,
                          })}
                          className={ROW_CLASS}
                        >
                          <span className={ROW_NAME_CLASS}>
                            {station.stationName}
                          </span>
                          {count === 0 ? (
                            <span className="tag tag--neutral tag--dashed">
                              {t("unpaired")}
                            </span>
                          ) : (
                            <span className="tag tag--ok">
                              {count === 1
                                ? t("paired")
                                : t("pairedMany", { count })}
                            </span>
                          )}
                          {isStale ? (
                            <span className="tag tag--warn">{t("stale")}</span>
                          ) : null}
                          <span className={ROW_META_CLASS}>
                            {seen === null
                              ? t("never")
                              : t("lastSeen", {
                                  when: dateFormat.format(seen),
                                })}
                          </span>
                          <Icon
                            name="cright"
                            className="h-[16px] w-[16px] text-[var(--ink-3)]"
                          />
                        </Link>
                      );
                    })}
                  </div>
                ))}
              </section>
            ))}
          </div>
        </>
      )}

      {selected === undefined ? null : (
        <StationDrawer
          station={selected}
          confirmId={confirmId}
          failed={failed}
          pairAddress={pairAddress}
          minutes={minutes}
          dateFormat={dateFormat}
        />
      )}
    </AdminShell>
  );
}
