// Что видит экран заполнения. Тексты здесь уже выбраны по языку и склеены:
// разметке остаётся только показать строки, а вся работа с языками и формат
// подсказок живут в одном месте (`view.ts`) и проверяются модульными тестами.
import type { ItemType, LocalizedText, Severity } from "@/blocks/data";

export interface FillItemView {
  readonly id: string;
  readonly title: string;
  readonly type: ItemType;
  readonly severity: Severity;
  readonly min?: number;
  readonly max?: number;
  /** Подсказка методиста и диапазон одной строкой; `null` — строки нет. */
  readonly hint: string | null;
}

export interface FillSectionView {
  readonly id: string;
  readonly title: string;
  readonly items: readonly FillItemView[];
}

export interface FillScreenView {
  readonly checklistTitle: string;
  /** «Пиццерия · Станция · 06:00–12:00» — вторая строка шапки эталона. */
  readonly where: string;
  /**
   * «06:00–12:00» отдельной строкой: часы работы чек-листа нужны панели будильников,
   * которая ими и ограничена (D090). Из `where` их не выковырять — там они склеены
   * с названиями, а разбирать собранную строку обратно значит гадать.
   */
  readonly window: string;
  readonly sections: readonly FillSectionView[];
  readonly totalItems: number;
}

/**
 * Один чек-лист в списке выбора, ещё на всех языках: так его отдаёт слой данных.
 * Живёт здесь, а не в `station.ts`, чтобы сборка вида не зависела от загрузки, —
 * иначе `view.ts` и `station.ts` ссылались бы друг на друга по кругу.
 */
export interface FillChoiceOption {
  readonly checklistId: string;
  readonly title: LocalizedText;
  /** «08:00–23:00»: по окну сотрудник и узнаёт нужный чек-лист. */
  readonly window: string;
}

/** Экран выбора: несколько чек-листов станции открыты в одну и ту же минуту. */
interface FillChoiceItemView {
  readonly checklistId: string;
  readonly title: string;
  readonly window: string;
}

export interface FillChoiceView {
  /** «Пиццерия · Станция» — без окна: у каждого чек-листа в списке оно своё. */
  readonly where: string;
  readonly options: readonly FillChoiceItemView[];
}

/** Подписи диапазона: приходят из словаря, чтобы `view.ts` не знал о next-intl. */
export interface FillViewLabels {
  readonly range: (min: number, max: number) => string;
  readonly rangeFrom: (min: number) => string;
  readonly rangeTo: (max: number) => string;
}

/** Одна отметка обхода в развёрнутом списке: когда ждали, когда сделали и что ответили. */
export interface RoundMarkView {
  /** Проход, к которому отнесена отметка: «08:00». */
  readonly interval: string;
  /** Фактическое местное время отметки: «08:12». */
  readonly at: string;
  /** Ответ словами: «да» / «нет» / число / текст сотрудника. */
  readonly value: string;
  readonly comment: string | null;
  /** Ответ отрицательный: проход сделали и нашли непорядок. */
  readonly failed: boolean;
}

/**
 * Состояние обхода одной строкой (D076): столько, сколько нужно, чтобы решить,
 * идти сейчас или нет. Сетка часов на экран не возвращается — она уехала в отчёт (D065).
 */
/**
 * `due` — проход идёт и не отмечен, `done` — отмечен, `waiting` — сейчас прохода нет,
 * но сегодня ещё будет (в расписании пункта пауза), `finished` — на сегодня всё.
 * Разделять последние два обязательно: «Обходы закончены» рядом со «Следующий в 11:00»
 * это две противоположные вещи в одной строке.
 */
export type RoundState = "due" | "done" | "waiting" | "finished";

export interface RoundSummaryView {
  readonly itemId: string;
  readonly title: string;
  /** Тип ответа: «да/нет» отмечают двумя кнопками, число и текст — полем. */
  readonly type: ItemType;
  /** Провал этого уровня требует объяснения — то же обещание, что в форме (D056). */
  readonly commentOnFailure: boolean;
  readonly state: RoundState;
  /** Главная строка: «Проверить до 12:00» / «Сделано в 11:05» / «Обходы закончены». */
  readonly headline: string;
  /** Вторая строка: «Пропущено 2» и/или «Следующий в 12:00»; `null` — сказать нечего. */
  readonly note: string | null;
  readonly missedCount: number;
  /** Идёт проход, который ещё не отметили: только тогда кнопка что-то делает. */
  readonly canMark: boolean;
  /** Отметки за текущие местные сутки, свежие сверху (D077). */
  readonly marks: readonly RoundMarkView[];
}

export interface RoundsPanelView {
  readonly items: readonly RoundSummaryView[];
  readonly missedTotal: number;
}

/** Подписи панели обходов: приходят из словаря, чтобы сборка не знала о next-intl. */
export interface RoundsLabels {
  readonly checkBefore: (time: string) => string;
  readonly checkNow: string;
  readonly doneAt: (time: string) => string;
  readonly nextAt: (time: string) => string;
  readonly finished: string;
  readonly missed: (count: number) => string;
  readonly yes: string;
  readonly no: string;
}
