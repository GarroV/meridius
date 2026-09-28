import { getTranslations } from "next-intl/server";
import type { ReactElement } from "react";

import { ADMIN_SECTIONS } from "@/blocks/core/admin-sections";
import { Drawer, PropertyRow } from "@/blocks/core/ui/Drawer";

import type { StationTablets } from "../station-tablets";
import { issuePinAction } from "./issue-pin-action";
import { PairGuide } from "./PairGuide";
import { PairTabletButton } from "./PairTabletButton";
import { PairTabletIntl } from "./PairTabletIntl";
import { UnlinkButton } from "./UnlinkButton";

/**
 * Выдвижная панель станции в разделе «Устройства» (D162, D163): что на станции стоит,
 * отвязка и привязка нового планшета — не уходя со списка.
 *
 * Код выпускается прямо здесь, а инструкция стоит РЯДОМ с ним: управляющий смотрит на
 * четыре цифры и на то, что с ними делать на планшете, одним взглядом. Отдельной
 * «перепривязки» нет, и это не упущение: введённый на планшете код новой станции сам
 * снимает его прежнюю привязку (`pairDevice`), поэтому перенос планшета — это та же
 * привязка, и панель говорит об этом словами.
 *
 * `station === null` — в адресе станция, которой нет (удалили или ссылка устарела):
 * панель открывается и говорит это, а не молча показывает список без панели.
 */

const SECTION_CLASS = "drawer__section flex flex-col gap-[var(--space-5)]";
const TEXT_CLASS =
  "text-[length:var(--fs-dense)] leading-[var(--lh-dense)] text-[var(--ink-2)]";
const TABLET_ROW_CLASS =
  "flex flex-wrap items-center gap-x-[var(--space-6)] gap-y-[var(--space-2)] rounded-[var(--r-block)] border border-[var(--line)] px-[var(--space-6)] py-[var(--space-5)]";
const TABLET_MARKS_CLASS =
  "flex min-w-0 flex-1 flex-col gap-[var(--space-1)] text-[length:var(--fs-meta)] leading-[var(--lh-meta)] text-[var(--ink-3)] tabular-nums";
const FAILED_CLASS =
  "text-err rounded-[var(--r-block)] border border-[var(--err-line)] bg-[var(--err-soft)] px-[var(--space-6)] py-[var(--space-5)] text-[length:var(--fs-dense)]";
const PAIR_BOX_CLASS =
  "rounded-[var(--r-block)] border border-[var(--line-strong)] bg-surface p-[var(--space-6)] shadow-[var(--sh-xs)]";

export interface StationDrawerProps {
  readonly station: StationTablets | null;
  readonly confirmId: string | null;
  readonly failed: boolean;
  readonly pairAddress: string;
  readonly minutes: number;
  readonly dateFormat: Intl.DateTimeFormat;
}

export async function StationDrawer({
  station,
  confirmId,
  failed,
  pairAddress,
  minutes,
  dateFormat,
}: StationDrawerProps): Promise<ReactElement> {
  const t = await getTranslations("device.admin");
  // «Отмена» реиспользует `catalog.actions.cancel`: тем же приёмом пользуется перевыпуск
  // кода на листе QR (`qr/ui/ReissueConfirm.tsx`) — одно слово, одна строка словаря.
  const tCatalog = await getTranslations("catalog");
  const devicesPath = ADMIN_SECTIONS.devices.path;

  if (station === null) {
    return (
      <Drawer
        title={t("title")}
        closeHref={devicesPath}
        closeLabel={t("drawer.close")}
        testId="station-drawer"
      >
        <p className={TEXT_CLASS} data-testid="station-drawer-missing">
          {t("drawer.missing")}
        </p>
      </Drawer>
    );
  }

  const here = `${devicesPath}?station=${station.stationId}`;
  const hasTablet = station.tablets.length > 0;

  return (
    <Drawer
      title={station.stationName}
      closeHref={devicesPath}
      closeLabel={t("drawer.close")}
      testId="station-drawer"
    >
      <div className="drawer__section flex flex-col gap-[var(--space-1)]">
        <PropertyRow
          icon="globe"
          label={t("drawer.country")}
          value={station.countryName}
        />
        <PropertyRow
          icon="home"
          label={t("drawer.store")}
          value={station.storeName}
        />
        <PropertyRow
          icon="task"
          label={t("drawer.checklists")}
          value={
            station.checklistCount === 0 ? (
              <span className="tag tag--warn">{t("drawer.noChecklist")}</span>
            ) : (
              t("drawer.checklistCount", { count: station.checklistCount })
            )
          }
        />
      </div>

      <section className={SECTION_CLASS} data-testid="station-tablets">
        <h3 className="drawer__section-title">{t("drawer.tablets")}</h3>

        {failed ? (
          <p className={FAILED_CLASS} role="alert" data-testid="unlink-failed">
            {t("failed")}
          </p>
        ) : null}

        {hasTablet ? (
          station.tablets.map((tablet, index) => (
            <div
              key={tablet.id}
              data-testid="device-row"
              data-station-id={station.stationId}
              className={TABLET_ROW_CLASS}
            >
              <div className={TABLET_MARKS_CLASS}>
                <span className="text-[length:var(--fs-body)] font-medium text-ink">
                  {t("drawer.tablet", { number: index + 1 })}
                </span>
                <span>
                  {t("pairedAt", { when: dateFormat.format(tablet.pairedAt) })}
                </span>
                <span>
                  {t("lastSeen", {
                    when: dateFormat.format(tablet.lastSeenAt),
                  })}
                </span>
              </div>
              <UnlinkButton
                deviceId={tablet.id}
                open={confirmId === tablet.id}
                screenHref={here}
                texts={{
                  unlink: t("unlink"),
                  title: t("confirm.title", { station: station.stationName }),
                  warning: t("confirm.warning"),
                  confirmLabel: t("unlink"),
                  cancelLabel: tCatalog("actions.cancel"),
                }}
              />
            </div>
          ))
        ) : (
          <p className={TEXT_CLASS} data-testid="station-no-tablet">
            <span className="tag tag--neutral tag--dashed">
              {t("unpaired")}
            </span>{" "}
            {t("drawer.noTablet")}
          </p>
        )}
      </section>

      <section className={SECTION_CLASS} data-testid="station-pair">
        <h3 className="drawer__section-title">
          {hasTablet ? t("drawer.pairMoreTitle") : t("drawer.pairTitle")}
        </h3>
        <p className={TEXT_CLASS}>{t("drawer.pairText")}</p>
        {hasTablet ? (
          <p className={TEXT_CLASS}>{t("drawer.replaceText")}</p>
        ) : null}
        <div className={PAIR_BOX_CLASS}>
          <PairTabletIntl>
            <PairTabletButton
              issue={issuePinAction.bind(null, station.stationId)}
              address={pairAddress}
            />
          </PairTabletIntl>
        </div>
      </section>

      <section className={SECTION_CLASS}>
        <h3 className="drawer__section-title">{t("drawer.guideTitle")}</h3>
        <PairGuide address={pairAddress} minutes={minutes} compact />
      </section>
    </Drawer>
  );
}
