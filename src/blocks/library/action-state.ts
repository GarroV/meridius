// Состояние серверных действий библиотеки. Живёт отдельно от самих действий, потому что
// файл с "use server" имеет право экспортировать только асинхронные функции: значение
// по умолчанию и типы там оказались бы ошибкой сборки.
import type { EditorErrorCode } from "./parsing";

/** Что показать методисту после нажатия «Сохранить блок»: тишину, подтверждение, отказ. */
export interface LibraryActionState {
  status: "idle" | "saved" | "failed";
  /** Код отказа для словаря сообщений; `unknown` — сбой, которого мы не предусмотрели. */
  errorCode?: EditorErrorCode | "unknown";
  /** Предел из сообщения об отказе: «не больше N знаков». */
  limit?: number;
}

export const INITIAL_LIBRARY_STATE: LibraryActionState = { status: "idle" };
