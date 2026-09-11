import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import type { ReactElement } from "react";

import { submitReissueCode } from "./actions";
import type { QrStationView, QrStoreView } from "./model";
import { qrHref, qrStickerHref } from "./view";

/**
 * Карточка «Станции» (таблица `.table` из эталона): код и дата выпуска на
 * каждую станцию пиццерии, и перевыпуск рядом. Название станции ведёт на лист
 * печати с этой станцией выбранной (`?station=…`) — так карточка планшета
 * справа (`TabletPreview.tsx`) начинает показывать именно её.
 */

const FIELD_STORE_ID = "storeId";
const FIELD_STATION_ID = "stationId";

const CARD_CLASS =
  "bg-surface rounded-[var(--r-block)] border border-[var(--line-strong)] shadow-[var(--sh-xs)]";
const CARD_HEAD_CLASS =
  "flex items-center gap-[var(--space-6)] rounded-t-[var(--r-block)] border-b border-[var(--line)] bg-[var(--surface-3)] px-[var(--space-7)] py-[var(--space-6)]";
const CARD_TITLE_CLASS =
  "text-[length:var(--fs-title)] leading-[var(--lh-title)] font-semibold";
const TABLE_CLASS =
  "w-full border-collapse text-[length:var(--fs-dense)] leading-[var(--lh-dense)]";
const TABLE_TH_CLASS =
  "border-b border-[var(--line-strong)] bg-[var(--surface-3)] px-[var(--cell-pad-x)] py-[var(--space-4)] text-left text-[length:var(--fs-micro)] leading-[var(--lh-micro)] font-semibold tracking-[var(--tracking-micro)] text-[var(--ink-2)] whitespace-nowrap uppercase";
const TABLE_TD_CLASS =
  "border-b border-[var(--line)] px-[var(--cell-pad-x)] py-[var(--space-5)] align-middle";
const TABLE_TD_NUM_CLASS = `${TABLE_TD_CLASS} text-ink text-right font-[family-name:var(--font-num)] text-[length:var(--fs-num)] [font-variant-numeric:tabular-nums]`;
const TABLE_TD_META_CLASS = `${TABLE_TD_CLASS} text-[length:var(--fs-meta)] text-[var(--ink-3)]`;
const TABLE_TD_ACTIONS_CLASS = `${TABLE_TD_CLASS} text-right whitespace-nowrap`;
const TABLE_ROW_CLASS = "hover:bg-[var(--surface-2)]";
const STATION_LINK_CLASS = "text-ink no-underline";
const BTN_GHOST_SM_CLASS =
  "inline-flex h-[var(--control-h-sm)] items-center justify-center gap-[var(--space-4)] rounded-[var(--r-control)] border border-transparent bg-transparent px-[var(--space-5)] text-[length:var(--fs-dense)] font-medium text-[var(--ink-2)] no-underline hover:bg-[var(--surface-3)] hover:text-ink";

interface StationRowProps {
  readonly station: QrStationView;
  readonly storeId: string;
  readonly issuedAt: string;
  readonly reissueLabel: string;
  readonly downloadLabel: string;
}

function StationRow({
  station,
  storeId,
  issuedAt,
  reissueLabel,
  downloadLabel,
}: StationRowProps): ReactElement {
  return (
    <tr className={TABLE_ROW_CLASS}>
      <td className={TABLE_TD_CLASS}>
        <Link
          href={qrHref({ storeId, stationId: station.id })}
          className={STATION_LINK_CLASS}
        >
          {station.name}
        </Link>
      </td>
      <td className={TABLE_TD_NUM_CLASS}>{station.code}</td>
      <td className={TABLE_TD_META_CLASS}>{issuedAt}</td>
      <td className={TABLE_TD_ACTIONS_CLASS}>
        <div className="inline-flex items-center gap-[var(--space-4)]">
          {/* T088: базовый путь площадки к этой ссылке НЕ приставляется — известный
              остаток задачи T088.
              Обычная ссылка с `download`: файл отдаёт маршрут, и скачивание работает
              без JavaScript — как и остальные действия продукта. */}
          <a
            href={qrStickerHref({ storeId, stationId: station.id })}
            download
            data-testid="download-sticker"
            className={BTN_GHOST_SM_CLASS}
          >
            {downloadLabel}
          </a>
          <form action={submitReissueCode}>
            <input type="hidden" name={FIELD_STORE_ID} value={storeId} />
            <input type="hidden" name={FIELD_STATION_ID} value={station.id} />
            <button
              type="submit"
              data-testid="reissue-code"
              className={BTN_GHOST_SM_CLASS}
            >
              {reissueLabel}
            </button>
          </form>
        </div>
      </td>
    </tr>
  );
}

export interface StationsCardProps {
  readonly store: QrStoreView;
  readonly stations: readonly QrStationView[];
}

export async function StationsCard({
  store,
  stations,
}: StationsCardProps): Promise<ReactElement> {
  const t = await getTranslations("qr");
  const format = await getFormatter();
  const reissueLabel = t("actions.reissue");
  const downloadLabel = t("actions.download");

  return (
    <div data-testid="qr-stations" className={CARD_CLASS}>
      <div className={CARD_HEAD_CLASS}>
        <h2 className={CARD_TITLE_CLASS}>{t("stations.title")}</h2>
      </div>
      <table className={TABLE_CLASS}>
        <thead>
          <tr>
            <th className={TABLE_TH_CLASS}>{t("stations.colStation")}</th>
            <th className={TABLE_TH_CLASS}>{t("stations.colCode")}</th>
            <th className={TABLE_TH_CLASS}>{t("stations.colIssued")}</th>
            <th className={TABLE_TH_CLASS} />
          </tr>
        </thead>
        <tbody>
          {stations.map((station) => (
            <StationRow
              key={station.id}
              station={station}
              storeId={store.id}
              issuedAt={format.dateTime(station.codeIssuedAt, {
                day: "numeric",
                month: "long",
                timeZone: store.timezone,
              })}
              reissueLabel={reissueLabel}
              downloadLabel={downloadLabel}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
