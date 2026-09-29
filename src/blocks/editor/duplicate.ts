// Дублирование чек-листа целиком: название, окно, разметка и перенос на другую станцию.
//
// История заполнений копии не наследуется никогда (принцип 3, D002): у копии всегда ровно
// один черновик и ноль опубликованных версий — публикует методист сам, отдельным действием.
import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import type { Item, LocalizedText, Section } from "@/blocks/data";
import { checklistVersions, checklists, getDb } from "@/blocks/data";
import { hqTenantId } from "@/blocks/auth/accounts";

import { EditorInputError, isUuid, parseRequiredText } from "./validation";

export interface DuplicateOptions {
  /** Куда перенести копию. `undefined` — оставить станцию исходного чек-листа, `null` — без станции. */
  toStationId?: string | null;
  /** Название копии. По умолчанию — название исходного с суффиксом (см. `titleSuffix`). */
  title?: LocalizedText;
  /**
   * Чей будет новый чек-лист (D145). Не задан — УК: так ведут себя проверки и сид, а
   * экраны кабинета передают тенант вошедшего всегда.
   */
  ownerTenantId?: string;
}

// Суффикс по языку продукта (D009): третий язык добавляется словарём, а не веткой кода,
// поэтому список короткий и рядом с единственным местом, где он нужен.
const TITLE_SUFFIX: Record<string, string> = { ru: " (копия)", en: " (copy)" };

function suffixedTitle(original: LocalizedText): LocalizedText {
  const result: LocalizedText = {};
  for (const [locale, value] of Object.entries(original)) {
    const suffix = TITLE_SUFFIX[locale] ?? " (copy)";
    result[locale] = `${value}${suffix}`;
  }
  return result;
}

/** Пункт с новым опознавателем: тот же ответ, но своя строка в базе для двух чек-листов. */
function copyItem(item: Item): Item {
  return { ...item, id: randomUUID() };
}

/**
 * Секция с новым опознавателем и своими пунктами. `source` копируется как есть: вставленный
 * блок библиотеки остаётся вставленным блоком с той же ссылкой (`blockId`), меняется только
 * опознаватель самой секции — он не имеет отношения к тому, откуда взяты пункты (D011).
 */
function copySection(section: Section): Section {
  return {
    ...section,
    id: randomUUID(),
    items: section.items.map(copyItem),
  };
}

interface SourceChecklist {
  title: LocalizedText;
  stationId: string | null;
  windowStart: string;
  windowEnd: string;
}

async function loadSourceChecklist(
  checklistId: string,
): Promise<SourceChecklist> {
  const rows = await getDb()
    .select({
      title: checklists.title,
      stationId: checklists.stationId,
      windowStart: checklists.windowStart,
      windowEnd: checklists.windowEnd,
    })
    .from(checklists)
    .where(eq(checklists.id, checklistId))
    .limit(1);
  const row = rows[0];
  if (row === undefined) {
    throw new EditorInputError("notFound", `Чек-листа ${checklistId} нет`);
  }
  return row;
}

/**
 * Разметка источника: черновик, если он есть, иначе опубликованная версия, иначе пусто.
 * Порядок — контракт дублирования, а не случайность: черновик несёт последнюю правку
 * методиста, и она приоритетнее того, что уже роздано станциям.
 */
async function loadSourceSections(checklistId: string): Promise<Section[]> {
  const draftRows = await getDb()
    .select({ sections: checklistVersions.sections })
    .from(checklistVersions)
    .where(
      and(
        eq(checklistVersions.checklistId, checklistId),
        eq(checklistVersions.status, "draft"),
      ),
    )
    .limit(1);
  if (draftRows[0] !== undefined) return draftRows[0].sections;

  const publishedRows = await getDb()
    .select({ sections: checklistVersions.sections })
    .from(checklistVersions)
    .where(
      and(
        eq(checklistVersions.checklistId, checklistId),
        eq(checklistVersions.status, "published"),
      ),
    )
    .limit(1);
  return publishedRows[0]?.sections ?? [];
}

function resolveStationId(
  source: SourceChecklist,
  toStationId: string | null | undefined,
): string | null {
  if (toStationId === undefined) return source.stationId;
  if (toStationId === null) return null;
  if (!isUuid(toStationId)) {
    throw new EditorInputError("badFormat", "Непонятная станция");
  }
  return toStationId;
}

/**
 * Дублирует чек-лист целиком: название, окно, разметку и (по выбору) станцию. Возвращает
 * id новой строки. Копия — всегда черновик; заполнения исходного её не касаются никак.
 */
export async function duplicateChecklist(
  checklistId: string,
  options?: DuplicateOptions,
): Promise<string> {
  if (!isUuid(checklistId)) {
    throw new EditorInputError("notFound", `Чек-листа ${checklistId} нет`);
  }

  const source = await loadSourceChecklist(checklistId);
  const stationId = resolveStationId(source, options?.toStationId);
  const title =
    options?.title === undefined
      ? suffixedTitle(source.title)
      : parseRequiredText(options.title);
  const sourceSections = await loadSourceSections(checklistId);
  const sections = sourceSections.map(copySection);
  const tenantId = options?.ownerTenantId ?? (await hqTenantId());

  return getDb().transaction(async (tx) => {
    const inserted = await tx
      .insert(checklists)
      .values({
        title,
        stationId,
        tenantId,
        windowStart: source.windowStart,
        windowEnd: source.windowEnd,
      })
      .returning({ id: checklists.id });
    const copy = inserted[0];
    if (copy === undefined) {
      throw new Error("Копия чек-листа не вставилась");
    }

    await tx.insert(checklistVersions).values({
      checklistId: copy.id,
      status: "draft",
      sections,
    });
    return copy.id;
  });
}
