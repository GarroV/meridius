// Решения серверных действий, вынесенные из самих действий: файл действий помечен
// `"use server"` и может экспортировать только асинхронные функции, то есть его логику
// нечем проверить тестом. Здесь она обычная и проверяется.
import {
  decideReissue,
  type ReissueDecision,
} from "@/blocks/core/reissue-confirmation";

import { CatalogError } from "../errors";
import { catalogHref, qrStationsHref, type CatalogView } from "./view";

/**
 * Значение поля формы строкой. Файл вместо строки — не наш случай, но и не повод
 * падать: пустая строка не пройдёт проверку имени и вернётся понятным отказом.
 */
export function formField(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

/**
 * Куда вести после неудачного удаления пиццерии.
 *
 * Требование подтверждения — не ошибка, а следующий шаг сценария: экран показывает
 * карточку «в пиццерии N станций, удалить вместе с ними?», а не красную полосу.
 * Всё остальное (например запрет по истории заполнений) — именно отказ, и человек
 * обязан увидеть его текстом.
 */
export function afterDeleteStoreFailure(
  base: CatalogView,
  error: CatalogError,
): CatalogView {
  if (error.code === "confirmationRequired") {
    return { ...base, confirm: "store" };
  }
  return { ...base, error: error.code };
}

/** Запрос на перевыпуск кода станции: место в дереве и был ли он подтверждён. */
export interface ReissueRequest {
  readonly countryId: string;
  readonly storeId: string;
  readonly stationId: string;
  readonly confirmed: boolean;
}

/** Решение о перевыпуске в понятиях справочника: место в дереве вместо абстракции. */
export type ReissueOutcome = ReissueDecision<CatalogView>;

/**
 * Перевыпуск кода станции в два шага: подтверждение, потом сам перевыпуск (T260).
 *
 * Сама развилка сюда не переписана — она общая на оба экрана продукта и живёт в
 * `core/reissue-confirmation.ts` (T266: тот же перевыпуск запускается ещё и с листа
 * печати). Здесь остаётся только то, что у справочника своё: откуда он задаёт вопрос
 * и куда возвращается, — место в дереве с фокусом на станции.
 *
 * Почему правило стоит в решении действия, а не в разметке кнопки, и почему успех
 * уводит на печать наклейки — там же, в общем правиле.
 */
export function reissueOutcome(request: ReissueRequest): ReissueOutcome {
  const { countryId, storeId, stationId, confirmed } = request;
  const place: CatalogView = {
    countryId,
    storeId,
    stationId,
    focus: "station",
  };

  return decideReissue({
    stationId,
    confirmed,
    ask: { ...place, confirm: "reissue" },
    doneHref: qrStationsHref({ storeId, stationId }),
    fail: place,
  });
}

/**
 * Куда вести: готовый адрес или место в справочнике. Развилка живёт здесь, а не в
 * самом действии, по общей причине этого файла — в `"use server"` её нечем проверить,
 * а появилась она ради одного перевыпуска, который заканчивается печатью наклейки.
 */
export function hrefOf(target: CatalogView | string): string {
  return typeof target === "string" ? target : catalogHref(target);
}
