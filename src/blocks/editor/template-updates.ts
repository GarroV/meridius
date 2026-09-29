// «Шаблон обновился» на копии (D154, D155, T336): строка происхождения, отличия,
// «Взять изменения» через черновик копии и «Оставить как есть».
//
// Приглашение, а не требование (D154): шаблон ничего не предписывает, поэтому
// ни одно действие здесь не публикует копию. Взятое ложится в ЧЕРНОВИК — методист
// страны видит его в редакторе и сам решает, публиковать ли. Отклонённое помнится
// номером версии: строка гаснет до следующего обновления шаблона, а не навсегда.
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";

import {
  checklistVersions,
  checklists,
  getDb,
  type LocalizedText,
  type Section,
} from "@/blocks/data";

import { saveDraft } from "./drafts";
import {
  applyTemplateChanges,
  diffTemplateVersions,
  type TemplateChange,
} from "./template-diff";
import { isUuid } from "./validation";

/** Откуда копия и не ушёл ли шаблон вперёд. */
export interface TemplateOrigin {
  readonly templateId: string;
  readonly templateTitle: LocalizedText;
  /** С какой версии шаблона снято содержимое копии. */
  readonly sourceVersion: number;
  /** Последняя опубликованная версия шаблона. */
  readonly latestVersion: number;
  /** Шаблон ушёл вперёд, и эту его версию страна ещё не отклоняла. */
  readonly hasUpdate: boolean;
}

export interface TemplateUpdate {
  readonly origin: TemplateOrigin;
  readonly changes: readonly TemplateChange[];
}

interface CopyRow {
  readonly templateId: string;
  readonly sourceVersion: number;
  readonly seenVersion: number | null;
}

async function copyRow(copyId: string): Promise<CopyRow | null> {
  if (!isUuid(copyId)) return null;
  const [row] = await getDb()
    .select({
      templateId: checklists.sourceChecklistId,
      sourceVersion: checklists.sourceVersion,
      seenVersion: checklists.sourceSeenVersion,
    })
    .from(checklists)
    .where(eq(checklists.id, copyId))
    .limit(1);
  // Удалённый шаблон (`set null`) и свой чек-лист выглядят одинаково: происхождения нет.
  if (row?.templateId == null || row.sourceVersion === null) return null;
  return {
    templateId: row.templateId,
    sourceVersion: row.sourceVersion,
    seenVersion: row.seenVersion,
  };
}

/** Секции версии шаблона по номеру; `null` — такой версии нет. */
async function templateSections(
  templateId: string,
  versionNumber: number,
): Promise<Section[] | null> {
  const [row] = await getDb()
    .select({ sections: checklistVersions.sections })
    .from(checklistVersions)
    .where(
      and(
        eq(checklistVersions.checklistId, templateId),
        eq(checklistVersions.versionNumber, versionNumber),
      ),
    )
    .limit(1);
  return row?.sections ?? null;
}

async function latestTemplate(
  templateId: string,
): Promise<{ title: LocalizedText; number: number } | null> {
  const [row] = await getDb()
    .select({
      title: checklists.title,
      number: checklistVersions.versionNumber,
    })
    .from(checklists)
    .innerJoin(
      checklistVersions,
      eq(checklistVersions.checklistId, checklists.id),
    )
    .where(
      and(
        eq(checklists.id, templateId),
        eq(checklists.isTemplate, true),
        isNotNull(checklistVersions.versionNumber),
        sql`${checklistVersions.status} <> 'draft'`,
      ),
    )
    .orderBy(desc(checklistVersions.versionNumber))
    .limit(1);
  if (row?.number == null) return null;
  return { title: row.title, number: row.number };
}

function originOf(
  copy: CopyRow,
  latest: { title: LocalizedText; number: number },
): TemplateOrigin {
  const seen = Math.max(copy.sourceVersion, copy.seenVersion ?? 0);
  return {
    templateId: copy.templateId,
    templateTitle: latest.title,
    sourceVersion: copy.sourceVersion,
    latestVersion: latest.number,
    hasUpdate: latest.number > seen,
  };
}

/** Строка происхождения копии. `null` — это не копия шаблона (или шаблон удалён). */
export async function loadTemplateOrigin(
  copyId: string,
): Promise<TemplateOrigin | null> {
  const copy = await copyRow(copyId);
  if (copy === null) return null;
  const latest = await latestTemplate(copy.templateId);
  return latest === null ? null : originOf(copy, latest);
}

/**
 * Отличия шаблона с версии копии до последней. Отличия видны и после «оставить как
 * есть»: отклонение гасит приглашение, а не право посмотреть.
 */
export async function loadTemplateUpdate(
  copyId: string,
): Promise<TemplateUpdate | null> {
  const copy = await copyRow(copyId);
  if (copy === null) return null;
  const latest = await latestTemplate(copy.templateId);
  if (latest === null) return null;

  const [before, after] = await Promise.all([
    templateSections(copy.templateId, copy.sourceVersion),
    templateSections(copy.templateId, latest.number),
  ]);
  // Версии шаблона не удаляются (D002), так что пустота здесь — порча данных, а не
  // обычное состояние; отличий от неё не посчитать, и приглашать не к чему.
  if (before === null || after === null) return null;

  return {
    origin: originOf(copy, latest),
    changes: diffTemplateVersions(before, after),
  };
}

/**
 * «Оставить как есть». Версия приходит из формы: отклоняется только настоящая версия
 * шаблона, иначе присланное «99» заглушило бы все будущие обновления разом.
 */
export async function dismissTemplateUpdate(
  copyId: string,
  version: number,
): Promise<void> {
  const copy = await copyRow(copyId);
  if (copy === null || !Number.isInteger(version)) return;
  const latest = await latestTemplate(copy.templateId);
  if (latest === null || version > latest.number) return;

  await getDb()
    .update(checklists)
    .set({ sourceSeenVersion: version })
    .where(eq(checklists.id, copyId));
}

/** Содержимое, на которое ложится перенос: черновик страны, а без него — её публикация. */
async function copyContent(copyId: string): Promise<Section[]> {
  const rows = await getDb()
    .select({
      status: checklistVersions.status,
      sections: checklistVersions.sections,
    })
    .from(checklistVersions)
    .where(eq(checklistVersions.checklistId, copyId));
  const draft = rows.find((row) => row.status === "draft");
  const published = rows.find((row) => row.status === "published");
  return draft?.sections ?? published?.sections ?? [];
}

/**
 * «Взять изменения»: выбранные отличия — в черновик копии, копия запоминает, что теперь
 * снята с версии `version`. Публикации нет: это решение страны, а не шаблона.
 *
 * `version` — версия, отличия которой человек видел. Шаблон успел уйти дальше — отказ
 * `stale`: переносить то, чего человек не видел, значит решить за него.
 */
export async function takeTemplateChanges(
  copyId: string,
  version: number,
  itemIds: readonly string[],
): Promise<"taken" | "stale"> {
  const update = await loadTemplateUpdate(copyId);
  if (update?.origin.latestVersion !== version) return "stale";

  const after = await templateSections(update.origin.templateId, version);
  if (after === null) return "stale";

  const merged = applyTemplateChanges(
    await copyContent(copyId),
    after,
    update.changes,
    itemIds,
  );
  await saveDraft(copyId, merged);
  await getDb()
    .update(checklists)
    .set({ sourceVersion: version, sourceSeenVersion: null })
    .where(eq(checklists.id, copyId));
  return "taken";
}
