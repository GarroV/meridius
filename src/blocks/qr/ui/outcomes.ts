// Решения серверных действий экрана QR, вынесенные из самих действий: файл действий
// помечен `"use server"` и может экспортировать только асинхронные функции, то есть
// его логику нечем проверить тестом. Здесь она обычная и проверяется.
import {
  decideReissue,
  type ReissueDecision,
} from "@/blocks/core/reissue-confirmation";

import { CONFIRM_REISSUE, qrHref, type QrView } from "./view";

/** Решение о перевыпуске в понятиях этого экрана: состояние листа печати. */
export type QrReissueOutcome = ReissueDecision<QrView>;

/** Запрос на перевыпуск кода станции с листа печати. */
export interface QrReissueRequest {
  readonly storeId: string;
  readonly stationId: string;
  readonly confirmed: boolean;
}

/**
 * Перевыпуск кода станции с листа печати в два шага (T266).
 *
 * Сама развилка сюда не переписана — она общая на оба экрана продукта и живёт в
 * `core/reissue-confirmation.ts`. Здесь остаётся только то, что у листа печати
 * своё: вопрос задаётся на нём же (`?confirm=reissue`), и удавшийся перевыпуск
 * никуда не уводит — печать уже открыта, на ней же перерисуется новая наклейка.
 */
export function reissueOutcome(request: QrReissueRequest): QrReissueOutcome {
  const { storeId, stationId, confirmed } = request;
  const place: QrView = { storeId, stationId };

  return decideReissue({
    stationId,
    confirmed,
    ask: { ...place, confirm: CONFIRM_REISSUE },
    doneHref: qrHref(place),
    fail: place,
  });
}
