// Разбор того, что приходит в библиотеку из браузера.
//
// Своей проверки пунктов здесь нет намеренно: пункты блока при вставке становятся
// секцией чек-листа и уезжают в опубликованную версию, где остаются навсегда (D002).
// Значит гейт у них обязан быть ровно тот же, что у пунктов, набранных в редакторе, —
// вторая, «почти такая же» проверка разъехалась бы с первой на первой же правке.
import type { Item, LocalizedText } from "@/blocks/data";
import { EditorInputError, parseSections } from "@/blocks/editor/validation";

export { EditorInputError, isUuid } from "@/blocks/editor/validation";
export type { EditorErrorCode } from "@/blocks/editor/validation";

/** Название блока: без него список показывал бы безымянную строку. */
export { parseRequiredText as parseBlockTitle } from "@/blocks/editor/validation";

/**
 * Пункты блока. Проверяются как единственная секция чек-листа: те же пределы длины
 * текста, тот же разбор типов, границ и уровней, то же правило «пункт без названия —
 * это пустая строка, которую методист ещё не заполнил, и она пропускается».
 */
export function parseBlockItems(input: unknown): Item[] {
  if (!Array.isArray(input)) {
    throw new EditorInputError("badFormat", "Пункты блока — не список");
  }

  const sections = parseSections([
    { id: "block-items", title: {}, source: "own", items: input },
  ]);
  return sections[0]?.items ?? [];
}

/** Название и пункты блока: всё, что у блока есть. */
export interface BlockInput {
  title: LocalizedText;
  items: Item[];
}
