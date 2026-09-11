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
  href: string;
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
  blocks: LibraryBlockRow[];
  /** `null` — в библиотеке ещё нет ни одного блока. */
  selection: LibrarySelection | null;
}
