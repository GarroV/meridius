// Модель экрана библиотеки: всё уже посчитано и переведено на язык интерфейса,
// разметке остаётся рисовать. Так экран проверяется тестами без браузера, а разметка
// не решает, что считать использованием блока.
import type { Item } from "@/blocks/data";

import type { UsageImpact } from "../usages";

/** Строка списка блоков слева. */
export interface LibraryBlockRow {
  id: string;
  title: string;
  itemCount: number;
  /** В скольких чек-листах вставлен; ноль — «нигде», и это показывается явно. */
  usageCount: number;
  selected: boolean;
  /** Адрес редактора блока; `null` — вошедшему блок не открыть (партнёр, T338). */
  href: string | null;
}

/** Чек-лист в карточке «Где используется»: ссылка ведёт в его редактор. */
export interface LibraryUsageRow {
  checklistId: string;
  /** Подпись ссылки: «Открытие кухни · Алматы». */
  label: string;
  href: string;
  /** Блок входит в текущую опубликованную версию — она останется как есть. */
  published: boolean;
}

/** Открытый блок: то, что правится, и последствия правки. */
export interface LibrarySelection {
  id: string;
  title: string;
  items: Item[];
  usages: LibraryUsageRow[];
  impact: UsageImpact;
}

export interface LibraryModel {
  /**
   * Может ли вошедший менять библиотеку. Блок общий на всю сеть, и правка доезжает до
   * черновиков всех стран, поэтому правит только УК (D145).
   */
  canEdit: boolean;
  blocks: LibraryBlockRow[];
  /**
   * Открытый в редакторе блок. `null` — в библиотеке ещё нет ни одного блока или
   * вошедший её не правит: партнёру редактор не открывается вовсе (T338).
   */
  selection: LibrarySelection | null;
}
