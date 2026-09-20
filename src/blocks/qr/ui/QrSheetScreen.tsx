import { getTranslations } from "next-intl/server";
import type { ReactElement } from "react";

import { AdminShell } from "@/blocks/core/ui/AdminShell";

import type { QrModel } from "./model";
import { PrintButton } from "./PrintButton";
import { PrintSheet } from "./PrintSheet";
import { ReissueConfirm } from "./ReissueConfirm";
import { StationsCard } from "./StationsCard";
import { StorePicker } from "./StorePicker";
import { TabletPreview } from "./TabletPreview";

/**
 * Экран «QR-коды станций» (эталон `docs/furca/design/screens/qr-sheet.html`):
 * каркас + предупреждение и печатный лист слева, станции и планшет справа.
 * Без пиццерии в адресе — выбор пиццерии вместо листа (`StorePicker.tsx`,
 * состояния, которого в эталоне нет). Сам почти ничего не считает: всё нужное
 * уже лежит в `model` (см. `ui/build-model.ts`).
 */

const ERROR_NOTICE_CLASS =
  "text-err flex gap-[var(--space-5)] rounded-[var(--r-block)] border border-[var(--err-line)] bg-[var(--err-soft)] px-[var(--space-7)] py-[var(--space-6)] text-[length:var(--fs-dense)]";
const NOTICE_CLASS =
  "flex gap-[var(--space-5)] rounded-[var(--r-block)] border border-[var(--line-strong)] bg-[var(--surface-2)] px-[var(--space-7)] py-[var(--space-6)] text-[length:var(--fs-dense)]";
const META_CLASS = "text-[length:var(--fs-meta)] text-[var(--ink-3)]";
const STACK_CLASS = "flex flex-col gap-[var(--space-6)]";
const TWO_COL_CLASS =
  "grid grid-cols-[1fr_460px] items-start gap-[var(--space-8)]";
const CARD_CLASS =
  "bg-surface rounded-[var(--r-block)] border border-[var(--line-strong)] shadow-[var(--sh-xs)]";
const CARD_HEAD_CLASS =
  "flex items-center gap-[var(--space-6)] rounded-t-[var(--r-block)] border-b border-[var(--line)] bg-[var(--surface-3)] px-[var(--space-7)] py-[var(--space-6)]";
const CARD_TITLE_CLASS =
  "text-[length:var(--fs-title)] leading-[var(--lh-title)] font-semibold";
const SHEET_BODY_CLASS =
  "flex justify-center bg-[var(--surface-2)] p-[var(--space-7)]";

export async function QrSheetScreen({
  model,
}: {
  readonly model: QrModel;
}): Promise<ReactElement> {
  const t = await getTranslations("qr");
  const { store } = model;

  const breadcrumb =
    store === null
      ? t("breadcrumb.pick")
      : `${store.countryName} · ${store.name}`;

  return (
    <AdminShell
      testId="qr-screen"
      active="qr"
      breadcrumb={breadcrumb}
      title={t("title")}
      topbarAction={
        store === null ? null : <PrintButton label={t("actions.print")} />
      }
    >
      {model.errorCode !== null ? (
        <p data-testid="qr-error" className={ERROR_NOTICE_CLASS}>
          {t(`errors.${model.errorCode}`)}
        </p>
      ) : null}

      {store === null ? (
        <StorePicker stores={model.stores} />
      ) : (
        <div className={TWO_COL_CLASS}>
          <div className={STACK_CLASS}>
            <div className={NOTICE_CLASS}>
              <div>{t("notice.text")}</div>
            </div>
            <p className={META_CLASS}>
              {t("notice.origin", { origin: model.scanOrigin })}
            </p>
            <div className={CARD_CLASS}>
              <div className={CARD_HEAD_CLASS}>
                <h2 className={CARD_TITLE_CLASS}>{t("sheet.title")}</h2>
                <span className={`${META_CLASS} ml-auto`}>
                  {t("sheet.meta", { count: model.stations.length })}
                </span>
              </div>
              <div className={SHEET_BODY_CLASS}>
                {/* Лист говорит языком ПИЦЦЕРИИ, а карточка вокруг — языком
                    методиста: на бумагу идёт только лист (T273). */}
                <PrintSheet
                  stations={model.stations}
                  storeName={store.name}
                  locale={store.locale}
                />
              </div>
            </div>
          </div>

          <div className={STACK_CLASS}>
            <StationsCard store={store} stations={model.stations} />
            <TabletPreview selected={model.selected} storeName={store.name} />
          </div>
        </div>
      )}

      {/* Окно подтверждения перевыпуска — поверх листа, а не под таблицей: человек
          в этот момент смотрит на строку станции, и карточка внизу экрана осталась
          бы незамеченной ровно в том случае, ради которого вопрос и задаётся. */}
      <ReissueConfirm station={model.confirming} store={store} />
    </AdminShell>
  );
}
