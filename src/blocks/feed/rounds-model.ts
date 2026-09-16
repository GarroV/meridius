// Модель экрана отчёта об обходах: то, что страница посчитала, а разметка только рисует.
//
// Символ клетки выбирается ЗДЕСЬ, а не в разметке: «в какие часы обход сыпется» — это
// вопрос к данным, и ответ на него обязан быть проверяем тестом, а не прочитан с экрана.
import type { Severity } from "@/blocks/data";

import type { FeedSelection } from "./model";

/**
 * Что показывает клетка сетки.
 * `none` — в этот час обход не ждали вовсе; `missed` — есть пропуски, и их число
 * и есть ответ; `done` — всё закрытое сделано; `pending` — проход ещё впереди.
 */
type RoundsCellKind = "none" | "done" | "missed" | "pending";

export interface RoundsReportCell {
  readonly kind: RoundsCellKind;
  readonly done: number;
  readonly missed: number;
  /** Интервал ещё идёт или не начинался: пропуском он не считается. */
  readonly pending: number;
}

export interface RoundsReportRow {
  readonly key: string;
  /** Название пункта на языке экрана. */
  readonly title: string;
  readonly severity: Severity;
  /** Где этот обход делают: пиццерия, станция и чек-лист. */
  readonly storeName: string;
  readonly stationName: string;
  readonly checklistTitle: string;
  readonly cells: readonly RoundsReportCell[];
  readonly doneCount: number;
  readonly missedCount: number;
}

/**
 * Почему сетка пуста. Три разные причины и три разных совета: «расширьте период» там,
 * где надо настроить расписание, — совет невпопад, и он хуже отсутствия совета.
 */
export type RoundsEmptyKind = "noChecklists" | "noSchedule" | "noPasses";

export interface RoundsReportModel {
  readonly selection: FeedSelection;
  /** Пояс, в котором посчитан период. */
  readonly timeZone: string;
  readonly timeZoneAmbiguous: boolean;
  readonly periodFrom: Date;
  readonly periodTo: Date;
  /** Часы прохода, «08:00»: объединение по всем строкам, по возрастанию. */
  readonly columns: readonly string[];
  readonly rows: readonly RoundsReportRow[];
  readonly doneCount: number;
  readonly missedCount: number;
  /**
   * Отметки, не легшие ни в один интервал сетки: методист сменил шаг посреди смены.
   * Обход БЫЛ сделан, и потерять его молча хуже, чем сказать число вслух.
   */
  readonly strayMarkCount: number;
  /** Пиццерии, чей пояс база не знает: их обходы в отчёт не попали (T062). */
  readonly unknownTimezoneStores: number;
  readonly emptyKind: RoundsEmptyKind | null;
}
