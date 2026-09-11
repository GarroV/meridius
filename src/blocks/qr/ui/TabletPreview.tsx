import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactElement } from "react";

import type { QrStationView } from "./model";

/**
 * Карточка «QR на экран планшета» (эталон `.tablet`/`.tablet__screen`): то же
 * самое, что видно на самом планшете станции (`StationScreen.tsx`), но
 * уменьшенной копией внутри админки — методист сверяет код, не подходя к
 * станции. Показывает станцию из `model.selected` (выбранную в адресе или
 * первую по списку — это уже решил `build-model.ts`).
 */

const CARD_CLASS =
  "bg-surface rounded-[var(--r-block)] border border-[var(--line-strong)] shadow-[var(--sh-xs)]";
const CARD_HEAD_CLASS =
  "flex items-center gap-[var(--space-6)] rounded-t-[var(--r-block)] border-b border-[var(--line)] bg-[var(--surface-3)] px-[var(--space-7)] py-[var(--space-6)]";
const CARD_TITLE_CLASS =
  "text-[length:var(--fs-title)] leading-[var(--lh-title)] font-semibold";
const CARD_BODY_CLASS = "p-[var(--space-7)]";
const BTN_SM_CLASS =
  "text-ink bg-surface inline-flex h-[var(--control-h-sm)] items-center justify-center gap-[var(--space-4)] rounded-[var(--r-control)] border border-[var(--line-control)] px-[var(--space-5)] text-[length:var(--fs-dense)] font-medium no-underline hover:border-[var(--line-control-2)] hover:bg-[var(--surface-2)]";
const TABLET_CLASS = "w-[420px]";
const TABLET_SCREEN_CLASS =
  "bg-surface flex aspect-[4/3] flex-col items-center justify-center gap-[var(--space-7)] rounded-[var(--r-screen)] border border-[var(--line-strong)] p-[var(--space-9)] shadow-[var(--sh-xs)]";
const TABLET_QR_CLASS = "h-[190px] w-[190px]";
const TABLET_STATION_CLASS =
  "text-[length:var(--fs-display)] leading-[var(--lh-display)] font-semibold";
const META_CLASS = "text-[length:var(--fs-meta)] text-[var(--ink-3)]";
const HINT_CLASS = `${META_CLASS} mt-[var(--space-6)]`;

export interface TabletPreviewProps {
  readonly selected: QrStationView | null;
  readonly storeName: string;
}

export async function TabletPreview({
  selected,
  storeName,
}: TabletPreviewProps): Promise<ReactElement> {
  const t = await getTranslations("qr");

  if (selected === null) {
    return (
      <p data-testid="qr-tablet" className={META_CLASS}>
        {t("tablet.empty")}
      </p>
    );
  }

  return (
    <div data-testid="qr-tablet" className={CARD_CLASS}>
      <div className={CARD_HEAD_CLASS}>
        <h2 className={CARD_TITLE_CLASS}>{t("tablet.title")}</h2>
        <Link
          href={selected.screenHref}
          data-testid="qr-open-screen"
          className={`${BTN_SM_CLASS} ml-auto`}
        >
          {t("actions.openScreen")}
        </Link>
      </div>
      <div className={CARD_BODY_CLASS}>
        <div className={TABLET_CLASS}>
          <div className={TABLET_SCREEN_CLASS}>
            <div
              role="img"
              aria-label={t("sticker.qrLabel", { station: selected.name })}
              className={TABLET_QR_CLASS}
              dangerouslySetInnerHTML={{ __html: selected.svg }}
            />
            <div className={TABLET_STATION_CLASS}>{selected.name}</div>
            <div className={META_CLASS}>{storeName}</div>
          </div>
        </div>
        <p className={HINT_CLASS}>{t("tablet.hint")}</p>
      </div>
    </div>
  );
}
