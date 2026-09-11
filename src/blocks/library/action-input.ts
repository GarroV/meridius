// Разбор формы библиотеки и превращение отказа в состояние экрана.
//
// Живёт отдельно от `actions.ts`, потому что файл с "use server" не имеет права
// экспортировать ничего, кроме асинхронных функций, — а значит и проверить его
// по частям нельзя. Здесь чистые функции: они и разбирают вход, и решают, какое
// сообщение увидит методист.
import { LIMITS } from "@/blocks/editor/validation";

import type { LibraryActionState } from "./action-state";
import type { BlockInput, EditorErrorCode } from "./parsing";
import { EditorInputError, parseBlockItems } from "./parsing";

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

/**
 * Название и пункты блока из формы. Пункты приходят строкой JSON в скрытом поле:
 * их правит клиентская часть экрана, как и разметку чек-листа в редакторе.
 *
 * Название заводится на языке интерфейса: второй язык добавляется переключением
 * языка и повторной правкой — своего поля на каждый язык у блока нет (принцип 1).
 */
export function blockInputFrom(form: FormData): BlockInput {
  const raw = formText(form, "items");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new EditorInputError("badFormat", "Пункты блока пришли не как JSON");
  }

  return {
    title: { [formText(form, "locale")]: formText(form, "title") },
    items: parseBlockItems(parsed),
  };
}

/**
 * Отказ для экрана: понятный код и, если он нужен сообщению, предел.
 *
 * Сбой, которого мы не предусмотрели, превращается в общий код `unknown`: подробности
 * незачем отдавать браузеру, но и молчать нельзя — вызывающий пишет их в журнал сервера.
 */
export function failureState(error: unknown): LibraryActionState {
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
