import { getTranslations } from "next-intl/server";
import type { ReactElement } from "react";

import type { Locale } from "@/blocks/core/locale";

import type { QrStationView } from "./model";

/**
 * Печатный лист A4 (`.sheet`/`.sticker` из `docs/furca/design/app.css`). На
 * экране — уменьшенная копия внутри карточки «Лист для печати» (её рисует
 * `QrSheetScreen.tsx`: заголовок и счётчик станций — это его забота, не эта).
 *
 * При печати `PRINT_CSS` прячет всё, кроме `[data-print-sheet]`, и растягивает
 * его на настоящий A4 — иначе на бумаге оказались бы меню и кнопки той же
 * страницы, а не только наклейки.
 *
 * ЯЗЫК ЗДЕСЬ НЕ ЯЗЫК МЕТОДИСТА (T273, D122). Всё, что попадает на бумагу, —
 * поверхность пиццерии: лист печатают в кабинете, а читают его наклейки на кухне.
 * Поэтому словарь берётся по языку пиццерии (`getTranslations({ locale })`), а не по
 * языку запроса, и лист объявляет этот язык атрибутом `lang` на себе — в ОТДАННОМ
 * HTML, без единой строки JavaScript. Атрибут не украшение: диктор читает подпись по
 * правилам объявленного языка, а вокруг листа стоит кабинет на языке методиста, то
 * есть документ и правда двуязычный, и умалчивать об этом нельзя.
 *
 * Остальной экран — карточка со счётчиком «A4 · 3 станции», таблица станций, окно
 * перевыпуска — остаётся на языке методиста: это он читает, и на бумагу это не идёт.
 */

const SHEET_CLASS =
  "grid w-full grid-cols-2 content-start gap-[6mm] bg-white p-[10mm]";
/**
 * Размер кода на экране — уменьшенная копия эталона (34 мм), на бумаге печатный
 * стиль возвращает настоящие 42 мм: экран показывает лист целиком в карточке,
 * а на листе код обязан быть того размера, который читается с руки.
 */
const QR_CLASS = "h-[34mm] w-[34mm]";
const STICKER_CLASS =
  "flex flex-col items-center gap-[var(--space-5)] rounded-[var(--r-block)] border border-dashed border-[var(--line-control-2)] p-[8mm] text-center";
const STATION_NAME_CLASS =
  "text-[length:var(--fs-title)] leading-[var(--lh-title)] font-semibold";
const HINT_CLASS = "text-[length:var(--fs-meta)] text-[var(--ink-3)]";
const EMPTY_CLASS =
  "col-span-2 flex flex-col items-center gap-[var(--space-5)] px-[var(--space-8)] py-[var(--space-10)] text-center text-[var(--ink-2)]";

const PRINT_CSS = `
@media print {
  @page { size: A4; margin: 10mm; }
  /* Ширина документа зажимается печатным полем: невидимые части экрана всё ещё
     занимают место в разметке, и без этого Chrome сжимает ЛИСТ ЦЕЛИКОМ, чтобы
     влезла ширина админки, — код на бумаге выходит на 15% мельче задуманного.
     Проверено печатью в PDF и обмером растра. */
  html, body { background: #fff !important; width: 190mm !important; overflow: hidden !important; }
  body * { visibility: hidden !important; }
  [data-print-sheet], [data-print-sheet] * { visibility: visible !important; }
  [data-print-sheet] {
    position: absolute !important;
    top: 0 !important; left: 0 !important;
    width: 190mm !important;
    margin: 0 !important; padding: 0 !important;
    gap: 8mm !important;
    background: #fff !important; box-shadow: none !important;
  }
  [data-print-sticker] { break-inside: avoid; }
  [data-print-qr] { width: 42mm !important; height: 42mm !important; }
}
`;

export interface PrintSheetProps {
  readonly stations: readonly QrStationView[];
  readonly storeName: string;
  /** Язык пиццерии: его посчитал `build-model.ts`, здесь он только применяется. */
  readonly locale: Locale;
}

export async function PrintSheet({
  stations,
  storeName,
  locale,
}: PrintSheetProps): Promise<ReactElement> {
  const t = await getTranslations({ locale, namespace: "qr" });

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <div
        data-print-sheet
        data-testid="qr-sheet"
        lang={locale}
        className={SHEET_CLASS}
      >
        {stations.length === 0 ? (
          <p className={EMPTY_CLASS}>{t("sheet.empty")}</p>
        ) : (
          stations.map((station) => (
            <div
              key={station.id}
              data-print-sticker
              data-testid="qr-sticker"
              className={STICKER_CLASS}
            >
              <div
                data-print-qr
                role="img"
                aria-label={t("sticker.qrLabel", { station: station.name })}
                className={QR_CLASS}
                dangerouslySetInnerHTML={{ __html: station.svg }}
              />
              <div className={STATION_NAME_CLASS}>{station.name}</div>
              <div className={HINT_CLASS}>
                {t("sticker.hint", { store: storeName })}
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
