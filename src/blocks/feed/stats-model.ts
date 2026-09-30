// Модель экрана статистики: что посчитано для разметки (D150, D170).
import type { FeedStoreOption, FilterOption } from "./model";
import type { StatsPeriodDays } from "./stats-view";

export interface StatsSelection {
  readonly countryId: string | null;
  readonly storeId: string | null;
  readonly days: StatsPeriodDays;
  readonly countries: readonly FilterOption[];
  readonly stores: readonly FeedStoreOption[];
}

interface StatsFailedItem {
  readonly itemId: string;
  readonly title: string;
  readonly failures: number;
  readonly storeCount: number;
}

interface StatsSilentStation {
  readonly stationId: string;
  readonly stationName: string;
  readonly storeName: string;
  /** Пояс пиццерии: в нём подписан последний сигнал. */
  readonly timeZone: string;
  /** Сколько часов молчит, целых. */
  readonly silentHours: number;
  readonly lastSignalAt: Date | null;
}

export interface StatsModel {
  readonly selection: StatsSelection;
  readonly from: Date;
  readonly to: Date;
  /** Пояс подписи периода: пиццерии, страны (если он у неё один) или площадки. */
  readonly timeZone: string;
  readonly submissionCount: number;
  readonly criticalFailedCount: number;
  readonly criticalFailedShare: number | null;
  readonly alarmCount: number;
  readonly topFailedItems: readonly StatsFailedItem[];
  readonly silentStationCount: number;
  readonly silentStations: readonly StatsSilentStation[];
  /** Считать нечего вовсе: ни заполнений, ни будильников, ни ожидаемых сигналов. */
  readonly isEmpty: boolean;
}
