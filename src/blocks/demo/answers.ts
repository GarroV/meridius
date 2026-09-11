// Ответы показательного заполнения. Собираются из самой разметки версии, а не
// перечисляются рядом с ней: список ответов, набранный вручную по опознавателям пунктов,
// расходится с разметкой на первой же правке — и лента показывает «отвечено 5 из 7»,
// что читается как недоделка продукта, а не как замысел данных.
import type { Item, Section } from "@/blocks/data";

import type { DemoAnswer } from "./model";

/** Ответ по умолчанию на пункт «да/нет»: в демо всё в порядке, кроме одного места. */
const DEFAULT_BOOL = true;

/** На сколько ответ выходит за границу диапазона, когда числовой пункт провален. */
const OUT_OF_RANGE_STEP = 1;

interface FailedItem {
  readonly itemId: string;
  /** Объяснение сотрудника: провал без комментария бесполезен управляющему. */
  readonly comment: string;
}

export interface AnswerOptions {
  /** Текст, которым отвечают на все пункты свободного текста этого заполнения. */
  readonly note?: string;
  /** Значения числовых пунктов по порядку их следования; недостающие берут середину диапазона. */
  readonly numbers?: readonly number[];
  /** Единственный проваленный пункт заполнения. */
  readonly failed?: FailedItem;
  /**
   * Пункты, оставленные без ответа вовсе: их в результате не будет — ни пустой строки,
   * ни `false`, а именно отсутствие элемента.
   *
   * Исключение происходит из разметки ДО сборки ответов, и у этого два следствия:
   * `numbers` раздаётся ОСТАВШИМСЯ числовым пунктам по порядку (исключённый числовой
   * пункт номера не занимает), а `note` не требуется, если единственный пункт
   * свободного текста разметки оказался среди исключённых.
   */
  readonly unanswered?: readonly string[];
}

/** Середина заданного диапазона: обычный ответ на числовой пункт. */
function middleOf(item: Item): number {
  const min = item.min ?? 0;
  const max = item.max ?? 0;
  return Math.round((min + max) / 2);
}

/** Значение, которое проваливает пункт по правилу `isFailed` блока data. */
function failingValue(item: Item): boolean | number {
  if (item.type === "bool") return false;
  return (item.min ?? 0) - OUT_OF_RANGE_STEP;
}

/**
 * Пункт свободного текста без заметки дал бы пустой ответ, а продукт таких не создаёт:
 * `isAnswered` в блоке fill считает текст из одних пробелов НЕотвеченным пунктом.
 * Пустая строка в демо выглядела бы на карточке как «поле не сохранилось» — то есть
 * как дефект продукта, причём ровно на показе. Поэтому это ошибка данных, а не умолчание.
 */
function assertNoteGiven(
  items: readonly Item[],
  note: string | undefined,
): void {
  const text = items.find((item) => item.type === "text");
  if (text === undefined) return;
  if (note !== undefined && note.trim() !== "") return;
  throw new Error(
    `Пункт ${text.id} — свободный текст, а заметка (note) не задана: пустой ответ продукт не сохраняет`,
  );
}

function assertFailable(items: readonly Item[], failed: FailedItem): Item {
  const item = items.find((candidate) => candidate.id === failed.itemId);
  if (item === undefined) {
    throw new Error(
      `Провалить нечего: пункта ${failed.itemId} нет в разметке этой версии`,
    );
  }
  if (item.type === "text") {
    throw new Error(
      `Пункт ${failed.itemId} — свободный текст: провалить его нельзя, текст не оценивается`,
    );
  }
  return item;
}

/**
 * Опечатка в опознавателе `unanswered` иначе молча дала бы полное заполнение —
 * пункт остался бы отвеченным, и задуманной тревоги на показе бы не было.
 */
function assertUnanswerable(
  items: readonly Item[],
  unanswered: readonly string[],
): void {
  for (const itemId of unanswered) {
    const exists = items.some((item) => item.id === itemId);
    if (!exists) {
      throw new Error(
        `Пункт ${itemId} нельзя оставить без ответа: его нет в разметке этой версии`,
      );
    }
  }
}

/** Провалить пункт и одновременно оставить его без ответа — требования взаимоисключающие. */
function assertNotBothFailedAndUnanswered(
  unanswered: readonly string[],
  failed: FailedItem | undefined,
): void {
  if (failed === undefined) return;
  if (!unanswered.includes(failed.itemId)) return;
  throw new Error(
    `Пункт ${failed.itemId} указан и в unanswered, и в failed: нельзя одновременно провалить пункт и оставить его без ответа`,
  );
}

/**
 * Ответы на все пункты версии подряд. Порядок — тот же, что на экране заполнения:
 * секции по порядку, внутри секции пункты по порядку.
 */
export function answersFor(
  sections: readonly Section[],
  options: AnswerOptions = {},
): DemoAnswer[] {
  const allItems = sections.flatMap((section) => section.items);
  const unanswered = options.unanswered ?? [];
  assertUnanswerable(allItems, unanswered);
  assertNotBothFailedAndUnanswered(unanswered, options.failed);

  // Исключение — до сборки ответов: пункт выпадает из разметки целиком, а не
  // получает пустой ответ. Отсюда и `numbers`, и `assertNoteGiven` ниже работают
  // уже с оставшимися пунктами, не подозревая об исключённых.
  const items = allItems.filter((item) => !unanswered.includes(item.id));
  assertNoteGiven(items, options.note);
  if (options.failed !== undefined) assertFailable(items, options.failed);

  const numbers = [...(options.numbers ?? [])];
  let numberIndex = 0;

  return items.map((item) => {
    if (options.failed?.itemId === item.id) {
      return {
        itemId: item.id,
        value: failingValue(item),
        comment: options.failed.comment,
      };
    }
    if (item.type === "number") {
      const given = numbers[numberIndex];
      numberIndex += 1;
      return { itemId: item.id, value: given ?? middleOf(item) };
    }
    if (item.type === "text") {
      // Заметка здесь заведомо есть: её отсутствие отсечено `assertNoteGiven` выше.
      return { itemId: item.id, value: options.note ?? "" };
    }
    return { itemId: item.id, value: DEFAULT_BOOL };
  });
}
