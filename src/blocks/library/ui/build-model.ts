// Сборка модели экрана библиотеки за один заход: список блоков, открытый блок и то,
// что затронет его правка.
//
// Список и сводка считаются из ОДНОГО прочитанного списка использования (`usageImpact`
// — чистая функция над ним): два запроса про одно и то же расходятся между собой, и
// экран показывал бы список из одного, а число из другого.
import type { LocalizedText } from "@/blocks/data";
import { checklistPath } from "@/blocks/editor/routes";

import { getBlock, listBlocks } from "../blocks";
import { libraryBlockPath } from "../routes";
import type { BlockUsage } from "../usages";
import { listUsages, usageImpact } from "../usages";
import type { LibraryModel, LibrarySelection, LibraryUsageRow } from "./model";
import type { LibraryView } from "./view";

/** Название на языке интерфейса; нет — первое, что есть: блок мог начаться на другом языке. */
export function pickText(text: LocalizedText, locale: string): string {
  return text[locale] ?? Object.values(text)[0] ?? "";
}

/**
 * Подпись ссылки на чек-лист: «Открытие кухни · Алматы». Пиццерия рядом с названием
 * потому, что «Открытие кухни» есть в каждой пиццерии сети (та же причина, что в D032).
 */
export function usageLabel(usage: BlockUsage, locale: string): string {
  const title = pickText(usage.title, locale);
  return usage.store === null ? title : `${title} · ${usage.store}`;
}

function usageRow(usage: BlockUsage, locale: string): LibraryUsageRow {
  return {
    checklistId: usage.checklistId,
    label: usageLabel(usage, locale),
    href: checklistPath(usage.checklistId),
    published: usage.published,
  };
}

async function buildSelection(
  blockId: string,
  locale: string,
): Promise<LibrarySelection | null> {
  const block = await getBlock(blockId);
  if (block === null) return null;

  const usages = await listUsages(blockId);
  return {
    id: block.id,
    title: pickText(block.title, locale),
    items: block.items,
    usages: usages.map((usage) => usageRow(usage, locale)),
    impact: usageImpact(usages),
  };
}

/**
 * Модель экрана. Блок из адреса открывается, если он ещё существует; иначе открывается
 * первый в списке — экран с пустой правой половиной при непустой библиотеке выглядел бы
 * сломанным, а не «ничего не выбрано».
 */
export async function buildLibraryModel(
  view: LibraryView,
  locale: string,
): Promise<LibraryModel> {
  const blocks = await listBlocks();

  const requested =
    view.blockId !== undefined &&
    blocks.some((block) => block.id === view.blockId)
      ? view.blockId
      : blocks[0]?.id;

  const selection =
    requested === undefined ? null : await buildSelection(requested, locale);

  return {
    blocks: blocks.map((block) => ({
      id: block.id,
      title: pickText(block.title, locale),
      itemCount: block.itemCount,
      usageCount: block.usageCount,
      selected: block.id === selection?.id,
      href: libraryBlockPath(block.id),
    })),
    selection,
  };
}
