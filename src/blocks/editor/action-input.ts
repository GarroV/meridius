// Разбор формы редактора и превращение отказа в состояние экрана.
//
// Живёт отдельно от `actions.ts`, потому что файл с "use server" не имеет права
// экспортировать ничего, кроме асинхронных функций, — а значит и проверить его
// по частям нельзя. Здесь же чистые функции: они и разбирают вход, и решают,
// какое сообщение увидит методист.
import type { Section } from "@/blocks/data";

import type { EditorActionState } from "./action-state";
import type { ChecklistInput } from "./drafts";
import type { EditorErrorCode } from "./validation";
import { EditorInputError, LIMITS, parseSections } from "./validation";
import {
  WINDOW_FIELD,
  WINDOW_FROM_FIELD,
  WINDOW_TO_FIELD,
  windowFromFields,
} from "./window-field";

// Предел, о котором говорит сообщение об отказе: «не больше N пунктов».
const LIMIT_BY_CODE: Partial<Record<EditorErrorCode, number>> = {
  tooManySections: LIMITS.sections,
  tooManyItems: LIMITS.items,
  textTooLong: LIMITS.textLength,
};

export function formText(form: FormData, field: string): string {
  const value = form.get(field);
  return typeof value === "string" ? value : "";
}

/** Разметка чек-листа приходит из браузера строкой JSON в скрытом поле формы. */
export function sectionsFrom(form: FormData): Section[] {
  const raw = formText(form, "sections");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new EditorInputError("badFormat", "Разметка пришла не как JSON");
  }
  return parseSections(parsed);
}

/**
 * Свойства чек-листа из формы. Проверку значений делает слой черновика.
 *
 * Окно приходит с экрана ГОТОВЫМИ полями, а не копией состояния React: список
 * отправляет выбранную смену сам (`window-field.ts`), а два поля времени — своё окно,
 * если методист набрал его целиком (T185). Прежняя пара `windowStart`/`windowEnd`
 * считалась из состояния и отставала от выбора, сделанного до того как экран ожил:
 * на сервер уезжала не та смена (T129). Здесь отправляет ровно то, во что человек
 * напечатал, — и без единого скрипта тоже.
 */
export function checklistInputFrom(form: FormData): ChecklistInput {
  const stationId = formText(form, "stationId");
  return {
    stationId: stationId === "" ? null : stationId,
    title: { [formText(form, "locale")]: formText(form, "title") },
    window: windowFromFields(
      formText(form, WINDOW_FIELD),
      formText(form, WINDOW_FROM_FIELD),
      formText(form, WINDOW_TO_FIELD),
    ),
  };
}

/**
 * Отказ для экрана: понятный код и, если он нужен сообщению, предел.
 *
 * Сбой, которого мы не предусмотрели, превращается в общий код `unknown`: подробности
 * незачем отдавать браузеру, но и молчать нельзя — вызывающий пишет их в журнал сервера.
 */
export function failureState(error: unknown): EditorActionState {
  if (!(error instanceof EditorInputError)) {
    return { status: "failed", errorCode: "unknown" };
  }
  const limit = LIMIT_BY_CODE[error.code];
  return {
    status: "failed",
    errorCode: error.code,
    ...(limit === undefined ? {} : { limit }),
  };
}
