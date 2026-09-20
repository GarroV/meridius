// Вопрос «перевыпустить код станции?» на экране печати (T266).
//
// Само окно общее на продукт (`core/ui/ConfirmDialog`), здесь — только то, что у
// этого экрана своё: какая станция, что подставить в форму и куда вернёт «Отмена».
//
// Тексты берутся из раздела справочника (`catalog.confirm.*`, `catalog.actions.*`),
// а не заводятся вторыми под `qr`. Вопрос один и тот же, задаётся с двух экранов, и
// две копии предупреждения разъехались бы ровно так же молча, как разъехалась бы
// сама развилка: на одном экране человек прочёл бы, что старая наклейка умирает
// сразу, на другом — прежнюю редакцию этой фразы.
import { getTranslations } from "next-intl/server";
import type { ReactElement } from "react";

import { ConfirmDialog } from "@/blocks/core/ui/ConfirmDialog";

import { submitReissueCode } from "./actions";
import type { QrStationView, QrStoreView } from "./model";
import { qrHref } from "./view";

/** Имя действия: из него собраны `data-testid` окна и кнопок. */
const ACTION_NAME = "reissue";

export interface ReissueConfirmProps {
  /** Станция, про которую спрашивают, или `null` — тогда окна нет вовсе. */
  readonly station: QrStationView | null;
  readonly store: QrStoreView | null;
}

/**
 * Окно только тогда, когда известно всё, что оно называет: сама станция (её имя
 * стоит в заголовке) и пиццерия (в неё возвращает «Отмена»). Половины окна не
 * бывает — без имени станции вопрос «перевыпустить код?» не отличает одну станцию
 * от соседней.
 */
export async function ReissueConfirm({
  station,
  store,
}: ReissueConfirmProps): Promise<ReactElement | null> {
  if (station === null || store === null) return null;

  // Подпись подтверждающей кнопки — ТА ЖЕ, что в справочнике, хотя лист печати здесь
  // уже открыт. Сперва она была своя, короткая («Перевыпустить»): казалось, что
  // обещать «и открыть печать» тому, кто уже на печати, — обещание несделанного.
  // Сверка экрана показала обратное: одно окно с двумя разными кнопками читается
  // как два разных действия, а эталон даёт ровно одну подпись. Обещание при этом
  // верно и здесь — после подтверждения человек остаётся на листе с новой наклейкой.
  const t = await getTranslations("catalog");

  return (
    <ConfirmDialog
      name={ACTION_NAME}
      action={submitReissueCode}
      fields={{ storeId: store.id, stationId: station.id }}
      title={t("confirm.reissueTitle", { name: station.name })}
      warning={t("confirm.reissueBody")}
      confirmLabel={t("actions.confirmReissue")}
      cancelLabel={t("actions.cancel")}
      cancelHref={qrHref({ storeId: store.id, stationId: station.id })}
    />
  );
}
