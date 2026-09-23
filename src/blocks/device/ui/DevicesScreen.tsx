import { getLocale, getTranslations } from "next-intl/server";
import type { ReactElement } from "react";

import type { Locale } from "@/blocks/core/locale";
import { ADMIN_SECTIONS } from "@/blocks/core/admin-sections";
import { AdminShell } from "@/blocks/core/ui/AdminShell";

import type { PairedDeviceRow } from "../devices";
import { UnlinkButton } from "./UnlinkButton";

/**
 * Раздел кабинета «Устройства» (T297): привязанные планшеты сети, разбитые на
 * страна → пиццерия → станция, с отметками «привязан»/«был на связи» и отвязкой.
 *
 * Каркас — тот же `AdminShell`, что у остальных экранов кабинета (`CatalogScreen.tsx`).
 * Крошка реиспользует `admin.nav.groups.reference` («Справочник»): раздел лежит в той
 * же группе меню, что и справочник, а собственного ключа `device.admin.breadcrumb`
 * контракт задачи не заводил (T297: ключи сообщений не трогаем — см. отчёт исполнителя).
 */

const NOTICE_CLASS =
  "rounded-[var(--r-block)] border border-[var(--line-strong)] bg-[var(--surface-2)] px-[var(--space-7)] py-[var(--space-6)] text-[length:var(--fs-dense)] leading-[var(--lh-dense)] text-[var(--ink-2)]";
const FAILED_NOTICE_CLASS =
  "text-err rounded-[var(--r-block)] border border-[var(--err-line)] bg-[var(--err-soft)] px-[var(--space-7)] py-[var(--space-6)] text-[length:var(--fs-dense)]";
const COUNT_CLASS =
  "text-[length:var(--fs-meta)] leading-[var(--lh-meta)] text-[var(--ink-3)]";
const EMPTY_CLASS =
  "rounded-[var(--r-block)] border border-[var(--line)] bg-surface px-[var(--space-8)] py-[var(--space-10)] text-center text-[var(--ink-2)]";
const COUNTRY_CARD_CLASS =
  "bg-surface flex flex-col gap-[var(--space-6)] rounded-[var(--r-block)] border border-[var(--line-strong)] p-[var(--space-7)] shadow-[var(--sh-xs)]";
const COUNTRY_TITLE_CLASS =
  "text-[length:var(--fs-title)] leading-[var(--lh-title)] font-semibold";
const STORE_BLOCK_CLASS =
  "flex flex-col gap-[var(--space-5)] border-t border-[var(--line)] pt-[var(--space-5)]";
const STORE_TITLE_CLASS =
  "text-[length:var(--fs-lead)] leading-[var(--lh-lead)] font-medium";
const STATION_BLOCK_CLASS = "flex flex-col gap-[var(--space-3)]";
const STATION_TITLE_CLASS =
  "text-[length:var(--fs-micro)] leading-[var(--lh-micro)] font-semibold tracking-[var(--tracking-micro)] text-[var(--ink-3)] uppercase";
const DEVICE_ROW_CLASS =
  "flex flex-wrap items-center gap-[var(--space-5)] rounded-[var(--r-control)] border border-[var(--line)] px-[var(--space-6)] py-[var(--space-5)]";
const DEVICE_MARKS_CLASS =
  "flex flex-1 flex-wrap gap-[var(--space-6)] text-[length:var(--fs-dense)] text-[var(--ink-2)]";

// Внутри группировки массивы дополняются по ходу чтения строк — поэтому без
// `readonly`, в отличие от типа `PairedDeviceRow` самих строк, который не меняется.
// Наружу (`DevicesScreen`) уходит тот же объект: TypeScript разрешает читать
// изменяемый массив через `readonly`-тип без явного приведения.
interface StationGroup {
  stationId: string;
  stationName: string;
  devices: PairedDeviceRow[];
}

interface StoreGroup {
  storeName: string;
  stations: StationGroup[];
}

interface CountryGroup {
  countryName: string;
  stores: StoreGroup[];
}

/**
 * Строит дерево страна → пиццерия → станция из уже отсортированного списка:
 * `listPairedDevices()` (`devices.ts`) отдаёт строки в этом самом порядке. Группировка
 * идёт по равенству СОСЕДНИХ имён, а не идентификаторов — у страны и пиццерии в строке
 * их просто нет, так устроена сама выборка.
 */
function groupByCountry(
  rows: readonly PairedDeviceRow[],
): readonly CountryGroup[] {
  const countries: CountryGroup[] = [];

  for (const row of rows) {
    let country = countries.at(-1);
    if (country?.countryName !== row.countryName) {
      country = { countryName: row.countryName, stores: [] };
      countries.push(country);
    }

    let store = country.stores.at(-1);
    if (store?.storeName !== row.storeName) {
      store = { storeName: row.storeName, stations: [] };
      country.stores.push(store);
    }

    let station = store.stations.at(-1);
    if (station?.stationId !== row.stationId) {
      station = {
        stationId: row.stationId,
        stationName: row.stationName,
        devices: [],
      };
      store.stations.push(station);
    }

    station.devices.push(row);
  }

  return countries;
}

export interface DevicesScreenProps {
  readonly devices: readonly PairedDeviceRow[];
  /** Планшет, про который сейчас задан вопрос об отвязке (`?confirm=<deviceId>`). */
  readonly confirmId: string | null;
  /** Последняя отвязка не удалась (`?failed=1`) — race с параллельной отвязкой. */
  readonly failed: boolean;
}

export async function DevicesScreen({
  devices,
  confirmId,
  failed,
}: DevicesScreenProps): Promise<ReactElement> {
  const t = await getTranslations("device.admin");
  const tAdmin = await getTranslations("admin");
  // Кнопка «Отмена» переиспускает `catalog.actions.cancel`: тем же приёмом пользуется
  // перевыпуск кода на листе QR (`qr/ui/ReissueConfirm.tsx`), реиспользуя тексты
  // справочника вместо второй копии одного и того же слова.
  const tCatalog = await getTranslations("catalog");
  const locale = (await getLocale()) as Locale;
  const devicesPath = ADMIN_SECTIONS.devices.path;

  const dateFormat = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  // Заголовок вопроса называет СТАНЦИЮ, а не просто действие: окно модальное, и человек,
  // открывший его из списка на десяток планшетов, иначе не видит, про какой он согласился.
  const unlinkTexts = {
    unlink: t("unlink"),
    warning: t("confirm.warning"),
    confirmLabel: t("unlink"),
    cancelLabel: tCatalog("actions.cancel"),
  };

  const countries = groupByCountry(devices);

  return (
    <AdminShell
      testId="devices-screen"
      active="devices"
      breadcrumb={tAdmin("nav.groups.reference")}
      title={t("title")}
      topbarAction={null}
    >
      <p className={NOTICE_CLASS}>{t("notice")}</p>

      {failed ? <p className={FAILED_NOTICE_CLASS}>{t("failed")}</p> : null}

      <p className={COUNT_CLASS}>{t("count", { count: devices.length })}</p>

      {devices.length === 0 ? (
        <p className={EMPTY_CLASS}>{t("empty")}</p>
      ) : (
        <div className="flex flex-col gap-[var(--space-7)]">
          {countries.map((country) => (
            <section key={country.countryName} className={COUNTRY_CARD_CLASS}>
              <h2 className={COUNTRY_TITLE_CLASS}>{country.countryName}</h2>
              {country.stores.map((store) => (
                <div
                  key={`${country.countryName}/${store.storeName}`}
                  className={STORE_BLOCK_CLASS}
                >
                  <h3 className={STORE_TITLE_CLASS}>{store.storeName}</h3>
                  {store.stations.map((station) => (
                    <div
                      key={station.stationId}
                      className={STATION_BLOCK_CLASS}
                    >
                      <h4 className={STATION_TITLE_CLASS}>
                        {station.stationName}
                      </h4>
                      {station.devices.map((device) => (
                        <div
                          key={device.deviceId}
                          data-testid="device-row"
                          data-station-id={station.stationId}
                          className={DEVICE_ROW_CLASS}
                        >
                          <div className={DEVICE_MARKS_CLASS}>
                            <span>
                              {t("pairedAt", {
                                when: dateFormat.format(device.pairedAt),
                              })}
                            </span>
                            <span>
                              {t("lastSeen", {
                                when: dateFormat.format(device.lastSeenAt),
                              })}
                            </span>
                          </div>
                          <UnlinkButton
                            deviceId={device.deviceId}
                            open={confirmId === device.deviceId}
                            devicesPath={devicesPath}
                            texts={{
                              ...unlinkTexts,
                              title: t("confirm.title", {
                                station: station.stationName,
                              }),
                            }}
                          />
                        </div>
                      ))}
                    </div>
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
