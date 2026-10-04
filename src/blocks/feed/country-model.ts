// Модель экрана страны раздела «Статистика» (D179): что посчитано для разметки.
import type { StatsModel } from "./stats-model";
import type { DayRange, PeriodNav } from "./period";
import type { TodayCounts } from "./today-status";

/** Строка колонки стран. */
export interface CountryRow {
  readonly id: string;
  readonly name: string;
  readonly storeCount: number;
}

/** Плитка пиццерии: статус на сегодня и пара цифр за период. */
export interface StoreTile {
  readonly storeId: string;
  readonly name: string;
  readonly href: string;
  /** Статусы её живых чек-листов на сегодня. */
  readonly today: TodayCounts;
  /** Тревоги на сейчас (D053): та же полоса, что на экране пиццерии; у плитки это горизонт «сегодня», подписанный на ней. */
  readonly alarmCount: number;
  readonly submissionCount: number;
  readonly criticalFailedCount: number;
}

export interface CountryStatsModel {
  readonly countries: readonly CountryRow[];
  /** Выбранная страна; `null` — стран в области видимости нет вовсе. */
  readonly countryId: string | null;
  readonly countryName: string | null;
  /** Страна выбрана в адресе, а не подставлена первой: на телефоне открыта рабочая зона. */
  readonly isExplicit: boolean;
  /** Период экрана датами и куда ведут стрелки. */
  readonly period: DayRange;
  readonly periodNav: PeriodNav;
  /** Сводка по стране (D150, D170); `null` — стран нет. */
  readonly summary: StatsModel | null;
  readonly stores: readonly StoreTile[];
  /** Прочитан предел живых чек-листов или тревог: цифры плиток могут быть неполными. */
  readonly capped: boolean;
  /** Пиццерии, чей пояс база не знает: статус их чек-листов посчитать нечем (T062). */
  readonly unknownTimezoneStores: number;
}
