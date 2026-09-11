// Что считается проваленным пунктом. Правило живёт в одном месте: и лента заполнений,
// и карточка считают провалы одинаково, иначе два экрана покажут разные числа.
import { severityOf } from "./severity";
import type { Answer, Item, Section } from "./types";

/** Все пункты снимка подряд: секции нужны на экране, а для счёта важны только пункты. */
export function flattenItems(sections: Section[]): Item[] {
  return sections.flatMap((section) => section.items);
}

/**
 * Пункт провален, если на него ответили и ответ отрицательный:
 * «нет» для да/нет, число вне заданного диапазона. Свободный текст провалить нельзя —
 * это описание, а не оценка. Пункт без ответа не провален: он просто не отвечен.
 */
export function isFailed(item: Item, answer: Answer | undefined): boolean {
  if (answer === undefined) return false;
  if (item.type === "bool") return answer.value === false;
  if (item.type === "number") {
    if (typeof answer.value !== "number") return false;
    if (item.min !== undefined && answer.value < item.min) return true;
    return item.max !== undefined && answer.value > item.max;
  }
  return false;
}

/** Ответы по идентификатору пункта: снимок и ответы сходятся только по нему. */
function answersByItem(answers: Answer[]): Map<string, Answer> {
  return new Map(answers.map((answer) => [answer.itemId, answer]));
}

/** Сколько критичных пунктов провалено: это число видно в ленте (T045). */
export function countFailedCritical(
  snapshot: Section[],
  answers: Answer[],
): number {
  const byItem = answersByItem(answers);
  return flattenItems(snapshot).filter(
    (item) =>
      severityOf(item) === "critical" && isFailed(item, byItem.get(item.id)),
  ).length;
}

/**
 * Сколько пунктов провалено всего — критичных и остальных вместе.
 *
 * Отдельное число от `countFailedCritical`, а не его замена: столбец «Результат»
 * обязан отличать «всё выполнено» от «два пункта не выполнены», и по одним лишь
 * критичным провалам обычный невыполненный пункт выглядит как чистое заполнение.
 *
 * Режим смены здесь не учитывается, и это не упущение: провалить можно только
 * отвеченный пункт, а пункт, которого в сокращённой смене не показывали, остаётся
 * без ответа — `isFailed` на нём даёт false (T100).
 */
export function countFailed(snapshot: Section[], answers: Answer[]): number {
  const byItem = answersByItem(answers);
  return flattenItems(snapshot).filter((item) =>
    isFailed(item, byItem.get(item.id)),
  ).length;
}

/**
 * Сколько критичных пунктов остались БЕЗ ОТВЕТА.
 *
 * Это не то же, что провал, и потому считается отдельно. Неполное заполнение продукт
 * принимает сознательно (`matchAnswersToSnapshot`): отвергнуть почти готовый чек-лист
 * значит потерять работу сотрудника. Но у критичного пункта пустота — не «мелкая
 * неполнота»: «выключить газ» без ответа ничем не отличается для управляющего от
 * «газ не выключен», и молчание тут обязано звучать так же громко, как отказ.
 *
 * Режим смены здесь не при чём: критичный пункт показывается во ВСЕХ трёх режимах
 * (матрица в `severity.ts`), поэтому его отсутствие в ответах — всегда пропуск, а не
 * следствие сокращения смены.
 */
export function countUnansweredCritical(
  snapshot: Section[],
  answers: Answer[],
): number {
  const answered = new Set(answers.map((answer) => answer.itemId));
  return flattenItems(snapshot).filter(
    (item) => severityOf(item) === "critical" && !answered.has(item.id),
  ).length;
}
