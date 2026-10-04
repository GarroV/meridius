// Модель экрана пиццерии раздела «Статистика» (D179): что посчитано для разметки.
import type { FeedModel } from "./model";
import type { SubmissionSummary } from "./stats-breakdown";
import type { StatsModel } from "./stats-model";
import type { TodayStatus } from "./today-status";

/** Строка чек-листа: статистика за период и статус на сегодня. */
export interface StoreChecklistRow {
  readonly checklistId: string;
  /** Название на языке интерфейса. */
  readonly title: string;
  readonly stationName: string;
  /** Окно местным временем: «06:00–12:00». */
  readonly window: string;
  readonly status: TodayStatus;
  readonly summary: SubmissionSummary;
  /** Чек-лист в редакторе. */
  readonly href: string;
}

export interface StoreStatsModel {
  readonly storeId: string;
  readonly storeName: string;
  readonly countryName: string | null;
  /** Пояс пиццерии: в нём подписано всё время экрана. */
  readonly timeZone: string;
  /** Назад — к плиткам её страны. */
  readonly backHref: string;
  /** Отчёт по обходам этой пиццерии. */
  readonly reportHref: string;
  /** Сводка пиццерии за период (D150, D170). */
  readonly stats: StatsModel;
  readonly checklists: readonly StoreChecklistRow[];
  /** Тревоги и лента заполнений этой пиццерии — переехали сюда из «Заполнений». */
  readonly feed: FeedModel;
}
