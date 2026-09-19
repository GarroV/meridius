// Решения серверных действий, вынесенные из самих действий: файл действий помечен
// `"use server"` и может экспортировать только асинхронные функции, то есть его логику
// нечем проверить тестом. Здесь она обычная и проверяется.
import { CatalogError } from "../errors";
import { qrStationsHref, type CatalogView } from "./view";

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

/** Что делать с запросом: сперва спросить или уже перевыпускать и вести на печать. */
export type ReissueOutcome =
  | { readonly kind: "confirm"; readonly view: CatalogView }
  | { readonly kind: "reissue"; readonly doneHref: string };

/**
 * Перевыпуск кода станции в два шага: подтверждение, потом сам перевыпуск (T260).
 *
 * Почему правило стоит здесь, а не в разметке. Перевыпуск необратим и бьёт не по
 * экрану, а по бумаге: все напечатанные наклейки станции перестают работать в ту же
 * секунду, а узнают об этом сотрудники у стойки. Одна кнопка `submit` без вопроса —
 * это один промах мышью до такого исхода (T260: `dmcsfrn672` → `b9c72yb6xd`). Правило
 * в разметке защищало бы только ту разметку, где о нём вспомнили; правило в решении
 * действия закрывает и прямую отправку формы мимо экрана.
 *
 * Тот же порядок, что у удаления станции (`submitDeleteStation`): неподтверждённый
 * запрос ничего не меняет, а уводит экран в состояние подтверждения.
 *
 * После подтверждения экран не возвращается в справочник, а открывает печать новой
 * наклейки: обещание кнопки — «перевыпустить И открыть печать», и без второго шага
 * методист уходит со старой наклейкой на станции и новым кодом в базе.
 */
export function reissueOutcome(request: ReissueRequest): ReissueOutcome {
  const { countryId, storeId, stationId, confirmed } = request;

  if (!confirmed) {
    return {
      kind: "confirm",
      view: {
        countryId,
        storeId,
        stationId,
        focus: "station",
        confirm: "reissue",
      },
    };
  }

  return { kind: "reissue", doneHref: qrStationsHref({ storeId, stationId }) };
}
