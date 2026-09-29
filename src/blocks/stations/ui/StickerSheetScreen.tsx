import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactElement } from "react";

import type { Locale } from "@/blocks/core/locale";
import { storeLocale } from "@/blocks/core/store-locale";
import { AdminPage } from "@/blocks/core/ui/AdminPage";
import { stationQrSvg } from "@/blocks/qr";
import type { QrStationView } from "@/blocks/qr/ui/model";
import { PrintButton } from "@/blocks/qr/ui/PrintButton";
import { PrintSheet } from "@/blocks/qr/ui/PrintSheet";
import { qrScreenHref } from "@/blocks/qr/ui/view";

import { listStickerStations, type StickerStation } from "../stickers";
import { STATIONS_PATH } from "./view";

/**
 * Наклейки на станции, отмеченные в колонке (T311), — печать пачкой.
 *
 * Раздел QR печатает лист одной пиццерии; раскатка же идёт по всей стране, и после неё
 * человеку нужны наклейки на те же сорок станций, а не сорок заходов по пиццериям.
 *
 * Лист не свой, а тот же `PrintSheet` раздела QR — по одному на пиццерию, и это сделано
 * намеренно: тот же код, те же 42 мм на бумаге, та же подпись и тот же язык пиццерии на
 * листе (D122). Своя копия листа, заведённая было в этой же задаче, снята 29.09.2026 до
 * приёмки: она разошлась бы с разделом QR так же молча, как расходились два кодировщика,
 * и сторож бумаги (`core/design-reference.test.ts`) её и поймал. Пиццерия за пиццерией
 * идут подряд; каждая начинает свой ряд, и наклейки одной кухни не перемешиваются с
 * чужими.
 *
 * Печатный стиль `PrintSheet` ставит КАЖДЫЙ лист в левый верхний угол бумаги — для
 * одного листа это и нужно, а несколько легли бы друг на друга. Поэтому здесь позицию
 * берёт на себя общая обёртка, а листы внутри возвращаются в обычный поток. Цвета тут
 * нет ни одного: белую бумагу по-прежнему задаёт сам лист.
 */

const PACK_PRINT_CSS = `
@media print {
  [data-stickers-pack] {
    position: absolute !important;
    top: 0 !important; left: 0 !important;
    width: 190mm !important;
    display: flex !important; flex-direction: column !important; gap: 8mm !important;
    margin: 0 !important; padding: 0 !important;
  }
  [data-stickers-pack] [data-print-sheet] { position: static !important; }
}
`;

const META_CLASS =
  "m-0 text-[length:var(--fs-meta)] leading-[var(--lh-meta)] text-[var(--ink-3)]";
const EMPTY_CLASS =
  "bg-surface flex flex-col gap-[var(--space-3)] rounded-[var(--r-block)] border border-[var(--line-strong)] px-[var(--space-7)] py-[var(--space-6)] shadow-[var(--sh-xs)]";
const LINK_CLASS = "text-accent font-medium";
const CARD_CLASS =
  "bg-surface rounded-[var(--r-block)] border border-[var(--line-strong)] shadow-[var(--sh-xs)]";
const CARD_HEAD_CLASS =
  "flex items-center justify-between gap-[var(--space-6)] rounded-t-[var(--r-block)] border-b border-[var(--line)] bg-[var(--surface-3)] px-[var(--space-7)] py-[var(--space-6)]";
const CARD_TITLE_CLASS =
  "m-0 text-[length:var(--fs-title)] leading-[var(--lh-title)] font-semibold";
const SHEET_BODY_CLASS =
  "flex flex-col items-center gap-[var(--space-7)] rounded-b-[var(--r-block)] bg-[var(--surface-2)] p-[var(--space-7)]";

/** Лист одной пиццерии: её станции, её имя в подписи, её язык. */
interface StoreSheet {
  readonly storeId: string;
  readonly storeName: string;
  readonly locale: Locale;
  readonly stations: readonly QrStationView[];
}

export interface StickerSheetScreenProps {
  readonly stationIds: readonly string[];
  /** Адрес, по которому продукт открыт: он зашит в код (см. `qr/ui/origin.ts`). */
  readonly origin: string;
  readonly basePath: string;
  readonly acceptLanguage: string | null;
}

function stationView(
  row: StickerStation,
  origin: string,
  basePath: string,
): QrStationView {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    codeIssuedAt: row.codeIssuedAt,
    svg: stationQrSvg(row.code, origin, basePath),
    screenHref: qrScreenHref({ storeId: row.storeId, stationId: row.id }),
  };
}

/** Строки уже упорядочены по пиццериям (`listStickerStations`): режутся на подряд идущие. */
function bySheet(
  rows: readonly StickerStation[],
  { origin, basePath, acceptLanguage }: StickerSheetScreenProps,
): readonly StoreSheet[] {
  return rows.reduce<StoreSheet[]>((sheets, row) => {
    const view = stationView(row, origin, basePath);
    const last = sheets.at(-1);
    if (last?.storeId === row.storeId) {
      return [
        ...sheets.slice(0, -1),
        { ...last, stations: [...last.stations, view] },
      ];
    }
    return [
      ...sheets,
      {
        storeId: row.storeId,
        storeName: row.storeName,
        locale: storeLocale(acceptLanguage, row.countryLocale),
        stations: [view],
      },
    ];
  }, []);
}

export async function StickerSheetScreen(
  props: StickerSheetScreenProps,
): Promise<ReactElement> {
  const t = await getTranslations("stations");
  const rows = await listStickerStations(props.stationIds);
  const sheets = bySheet(rows, props);

  return (
    <AdminPage
      testId="stickers-screen"
      breadcrumb={t("title")}
      title={t("stickers.title")}
      topbarAction={
        rows.length === 0 ? null : <PrintButton label={t("stickers.print")} />
      }
    >
      {rows.length === 0 ? (
        <div className={EMPTY_CLASS} data-testid="stickers-empty">
          <p className={META_CLASS}>{t("stickers.empty")}</p>
          <Link href={STATIONS_PATH} className={LINK_CLASS}>
            {t("rail.back")}
          </Link>
        </div>
      ) : (
        <section className={CARD_CLASS}>
          <style dangerouslySetInnerHTML={{ __html: PACK_PRINT_CSS }} />
          <div className={CARD_HEAD_CLASS}>
            <h2 className={CARD_TITLE_CLASS}>{t("stickers.sheetTitle")}</h2>
            <span className={META_CLASS} data-testid="stickers-count">
              {t("stickers.count", {
                count: rows.length,
                stores: sheets.length,
              })}
            </span>
          </div>
          <div data-stickers-pack className={SHEET_BODY_CLASS}>
            {sheets.map((sheet) => (
              <PrintSheet
                key={sheet.storeId}
                stations={sheet.stations}
                storeName={sheet.storeName}
                locale={sheet.locale}
              />
            ))}
          </div>
        </section>
      )}
    </AdminPage>
  );
}
