// Чистая сборка панели обходов: из состояния, посчитанного слоем данных, — в строки,
// которые читает смена. Ни базы, ни next-intl, ни React.
//
// Главное решение здесь — D076: обход показывается ОДНОЙ строкой с ближайшим временем,
// а сетка часов не возвращается на экран. На бумаге сетку рисуют потому, что иначе
// регулярность не покажешь; здесь она уехала в отчёт (D065), а смене нужен ответ на
// один вопрос — идти сейчас или нет.
import type { Locale } from "@/blocks/core/locale";
import type {
  Item,
  ItemRounds,
  LocalizedText,
  RoundsView,
  Section,
} from "@/blocks/data";
import {
  flattenItems,
  formatLocalTime,
  parseLocalTime,
  requiresCommentOnFailure,
} from "@/blocks/data";

import { pickFillText } from "./locale";
import { buildOverdue } from "./overdue";
import type { OverdueItem } from "./overdue";
import type {
  RoundMarkView,
  RoundState,
  RoundsLabels,
  RoundsPanelView,
  RoundSummaryView,
} from "./model";

export interface BuildRoundsPanelInput {
  readonly rounds: RoundsView;
  /** Секции версии: из них берутся названия пунктов — слой данных их не носит. */
  readonly sections: readonly Section[];
  readonly locales: readonly Locale[];
  readonly labels: RoundsLabels;
}

const NOTE_SEPARATOR = " · ";

/** Пункт без названия ни на одном языке — недописанный черновик (то же правило, что в `view.ts`). */
function hasTitle(text: LocalizedText): boolean {
  return Object.keys(text).length > 0;
}

/** Ответ словами: «да» и «нет» приходят из словаря, число и текст показываются как есть. */
function formatValue(
  value: boolean | number | string,
  labels: RoundsLabels,
): string {
  if (typeof value === "boolean") return value ? labels.yes : labels.no;
  return String(value);
}

/** Отрицательный ответ — только у «да/нет»: у числа и текста провал решает не этот экран. */
function isFailedValue(value: boolean | number | string): boolean {
  return value === false;
}

/**
 * Местное время конца прохода: до него смене надо успеть.
 *
 * Неразобранное начало окна отбивается вслух, а не считается полночью (T167, issue #77):
 * тихое умолчание сдвинуло бы КАЖДУЮ строку панели на несколько часов, и «Проверить до
 * 01:00» выглядело бы ровно так же убедительно, как верное «до 09:00». Сегодня ветка
 * недостижима — начало окна приходит из колонки `time`, — но держится это на внешнем
 * обстоятельстве, а не на здешнем коде.
 *
 * Свой разбор, а не общий с `windowStartMinutes` блока `data`: отказы разные по смыслу
 * (там сетка проходов, здесь строка на экране смены), а ради четырёх одинаковых строк
 * тянуть ещё одну связь между блоками дороже, чем их повторить.
 */
function endLocalTime(
  window: RoundsView["window"],
  endMinutes: number,
): string {
  const start = parseLocalTime(window.start);
  if (start === null) {
    throw new RangeError(
      `Начало окна чек-листа не разобрано: «${window.start}»`,
    );
  }
  return formatLocalTime(start + endMinutes);
}

/** Ближайший проход, который ещё не начался: он и есть «следующий». */
function nextLocalTime(item: ItemRounds, offsetMinutes: number): string | null {
  const next = item.intervals.find(
    (interval) => interval.startMinutes > offsetMinutes,
  );
  return next?.startLocalTime ?? null;
}

/**
 * Все отметки пункта за сегодня, свежие сверху. Сюда же попадают отметки, не легшие
 * ни в один проход текущей сетки (`strayMarks`): обход был сделан, и терять его молча
 * хуже, чем показать не на своём месте.
 */
function marksOf(item: ItemRounds, labels: RoundsLabels): RoundMarkView[] {
  const fromGrid = item.intervals.flatMap((interval) =>
    interval.marks.map((mark) => ({
      interval: interval.startLocalTime,
      at: mark.atLocalTime,
      value: formatValue(mark.value, labels),
      comment: mark.comment,
      failed: isFailedValue(mark.value),
    })),
  );
  const stray = item.strayMarks.map((mark) => ({
    interval: mark.atLocalTime,
    at: mark.atLocalTime,
    value: formatValue(mark.value, labels),
    comment: mark.comment,
    failed: isFailedValue(mark.value),
  }));

  return [...fromGrid, ...stray].reverse();
}

function stateOf(item: ItemRounds, offsetMinutes: number): RoundState {
  if (item.current === null) {
    return nextLocalTime(item, offsetMinutes) === null ? "finished" : "waiting";
  }
  return item.current.marks.length > 0 ? "done" : "due";
}

function headlineOf(
  item: ItemRounds,
  state: RoundState,
  window: RoundsView["window"],
  labels: RoundsLabels,
  offsetMinutes: number,
): string {
  const current = item.current;
  if (current === null) {
    const next = nextLocalTime(item, offsetMinutes);
    return next === null ? labels.finished : labels.nextAt(next);
  }
  if (state === "done") {
    const last = current.marks[current.marks.length - 1];
    return last === undefined
      ? labels.checkNow
      : labels.doneAt(last.atLocalTime);
  }
  return labels.checkBefore(endLocalTime(window, current.endMinutes));
}

/**
 * Вторая строка: пропуски и время следующего обхода. Пропуски стоят первыми и всегда
 * названы числом — спрятать их за главной строкой значит потерять единственное, из-за
 * чего сетку вообще заводили.
 */
function noteOf(
  item: ItemRounds,
  offsetMinutes: number,
  state: RoundState,
  labels: RoundsLabels,
): string | null {
  const parts: string[] = [];
  if (item.missedCount > 0) parts.push(labels.missed(item.missedCount));
  // В ожидании время следующего обхода уже стоит главной строкой: повторять его
  // второй раз значит занять место, на котором должны быть пропуски.
  const next = state === "waiting" ? null : nextLocalTime(item, offsetMinutes);
  if (next !== null) parts.push(labels.nextAt(next));
  return parts.length === 0 ? null : parts.join(NOTE_SEPARATOR);
}

export function buildRoundsPanel(
  input: BuildRoundsPanelInput,
): RoundsPanelView {
  // Пункты версии по идентификатору: слой данных названий не носит, а разметке нужны
  // и название, и тип ответа, и требование объяснить провал.
  const byId = new Map<string, Item>(
    flattenItems([...input.sections])
      .filter((item) => hasTitle(item.title))
      .map((item) => [item.id, item]),
  );

  const items: RoundSummaryView[] = [];
  for (const item of input.rounds.items) {
    const source = byId.get(item.itemId);
    if (source === undefined) continue;

    const state = stateOf(item, input.rounds.offsetMinutes);
    items.push({
      itemId: item.itemId,
      title: pickFillText(source.title, input.locales),
      type: source.type,
      commentOnFailure: requiresCommentOnFailure(source),
      state,
      headline: headlineOf(
        item,
        state,
        input.rounds.window,
        input.labels,
        input.rounds.offsetMinutes,
      ),
      note: noteOf(item, input.rounds.offsetMinutes, state, input.labels),
      missedCount: item.missedCount,
      canMark: state === "due",
      marks: marksOf(item, input.labels),
    });
  }

  // Сигнал о просрочке считается здесь же и из того же материала (T138): настройка
  // оповещения лежит на пункте версии, а состояние строки уже посчитано выше. Второй
  // проход по тем же данным в другом месте разошёлся бы с панелью ровно тогда, когда
  // это дороже всего — станция звонила бы о том, чего на экране не видно.
  const overdueItems: OverdueItem[] = items.map((item) => ({
    itemId: item.itemId,
    title: item.title,
    remindEveryMinutes: byId.get(item.itemId)?.remindEveryMinutes,
    state: item.state,
    missedCount: item.missedCount,
  }));
  const signal = buildOverdue({ rounds: input.rounds, items: overdueItems });

  return {
    items,
    missedTotal: items.reduce((total, item) => total + item.missedCount, 0),
    overdue: signal.overdue,
    nextChangeInSeconds: signal.nextChangeInSeconds,
    ringsOnMiss: signal.ringsOnMiss,
  };
}
