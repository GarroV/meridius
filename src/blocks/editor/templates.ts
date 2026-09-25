// Копирование шаблона на станции (D149, D155) — механика раскатки на страну.
//
// Почему копия, а не назначение. Чек-лист принадлежит одной станции: `station_id` —
// колонка, а не связь «многие ко многим». Значит «повесить один чек-лист на сорок
// станций» физически невозможно, и попытка сделать это назначением молча перевесила бы
// его с предыдущей станции на следующую, оставив тридцать девять пиццерий ни с чем.
// Раскатка — это сорок копий, и каждая дальше живёт своей жизнью, как и решил владелец:
// «страны их не меняют, а создают копии».
//
// Копия помнит источник и номер его версии (D155). Это не живая ссылка: правка шаблона
// копию не трогает. Номер нужен, чтобы отличить свежую копию от отставшей и сказать
// стране «шаблон обновился» — приглашением, а не требованием (D154: шаблон ничего не
// предписывает).
import { and, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";

import {
  checklistVersions,
  checklists,
  getDb,
  type LocalizedText,
  type Section,
} from "@/blocks/data";

/** Первая версия копии. Копия начинает жизнь опубликованной — иначе станция пуста. */
const FIRST_VERSION = 1;

export interface TemplateSnapshot {
  readonly id: string;
  readonly title: LocalizedText;
  readonly windowStart: string;
  readonly windowEnd: string;
  /** Номер версии шаблона, с которой снимается копия. */
  readonly versionNumber: number;
  readonly sections: readonly Section[];
}

/**
 * Кому копировать. Отдельно от базы, потому что ошибка здесь тихая: лишняя копия — это
 * второй такой же чек-лист на станции, и сотрудник видит два одинаковых списка, не
 * понимая, какой заполнять; пропущенная — станция, которая осталась без чек-листа после
 * раскатки, а человек уверен, что раскатал.
 */
export function plannedCopies({
  stationIds,
  alreadyHave,
}: {
  /** Кого выбрал человек. Повторы в выборе не редкость: дерево выбирают группами. */
  readonly stationIds: readonly string[];
  /** У кого копия этого шаблона уже есть. */
  readonly alreadyHave: readonly string[];
}): readonly string[] {
  const have = new Set(alreadyHave);
  const seen = new Set<string>();

  return stationIds.filter((id) => {
    if (have.has(id) || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

/** Шаблон в списке выбора: столько, сколько нужно, чтобы его назвать. */
export interface TemplateRow {
  readonly id: string;
  readonly title: LocalizedText;
}

/**
 * Шаблоны, готовые к раскатке.
 *
 * Только опубликованные: шаблон без опубликованной версии копировать нечем, и место
 * ему не в списке с отказом при нажатии, а вне списка. Отказ, которого можно было не
 * допустить, — это работа, переложенная на человека.
 */
export async function listTemplates(): Promise<readonly TemplateRow[]> {
  return await getDb()
    .selectDistinct({ id: checklists.id, title: checklists.title })
    .from(checklists)
    .innerJoin(
      checklistVersions,
      eq(checklistVersions.checklistId, checklists.id),
    )
    .where(
      and(
        eq(checklists.isTemplate, true),
        isNull(checklists.archivedAt),
        eq(checklistVersions.status, "published"),
      ),
    )
    .orderBy(checklists.title);
}

/** Отказ копирования — с причиной, которую можно показать человеку. */
export class TemplateCopyError extends Error {
  constructor(readonly reason: "notTemplate" | "noPublishedVersion") {
    super(reason);
    this.name = "TemplateCopyError";
  }
}

/**
 * Шаблон и его последняя опубликованная версия.
 *
 * Неопубликованный шаблон копировать нельзя, и это отказ, а не пустая копия: пустая
 * доедет до станций, откроется у сотрудника пустым экраном и будет выглядеть поломкой
 * продукта, а не недоделанной работой методиста.
 */
export async function readTemplate(
  templateId: string,
): Promise<TemplateSnapshot> {
  const db = getDb();

  const [template] = await db
    .select({
      id: checklists.id,
      title: checklists.title,
      windowStart: checklists.windowStart,
      windowEnd: checklists.windowEnd,
      isTemplate: checklists.isTemplate,
    })
    .from(checklists)
    .where(eq(checklists.id, templateId))
    .limit(1);

  if (template === undefined || !template.isTemplate) {
    throw new TemplateCopyError("notTemplate");
  }

  const [version] = await db
    .select({
      versionNumber: checklistVersions.versionNumber,
      sections: checklistVersions.sections,
    })
    .from(checklistVersions)
    .where(
      and(
        eq(checklistVersions.checklistId, templateId),
        eq(checklistVersions.status, "published"),
        isNotNull(checklistVersions.versionNumber),
      ),
    )
    // По убыванию: нужна ПОСЛЕДНЯЯ опубликованная версия. По возрастанию сюда приехала
    // бы самая первая — копия сняла бы шаблон в том виде, в каком он был при рождении,
    // и все позднейшие правки методиста УК до станций не доехали бы. Молча и
    // правдоподобно: копия создалась, чек-лист на станции есть, содержимое старое.
    .orderBy(desc(checklistVersions.versionNumber))
    .limit(1);

  if (version?.versionNumber == null) {
    throw new TemplateCopyError("noPublishedVersion");
  }

  return {
    id: template.id,
    title: template.title,
    windowStart: template.windowStart,
    windowEnd: template.windowEnd,
    versionNumber: version.versionNumber,
    sections: version.sections,
  };
}

/** Станции, у которых копия этого шаблона уже есть. */
async function stationsWithCopy(
  templateId: string,
  stationIds: readonly string[],
): Promise<readonly string[]> {
  if (stationIds.length === 0) return [];

  const rows = await getDb()
    .select({ stationId: checklists.stationId })
    .from(checklists)
    .where(
      and(
        eq(checklists.sourceChecklistId, templateId),
        inArray(checklists.stationId, [...stationIds]),
      ),
    );

  return rows.flatMap((row) => (row.stationId === null ? [] : [row.stationId]));
}

export interface CopyOutcome {
  /** Куда копия легла. */
  readonly copied: readonly string[];
  /** Кого пропустили: копия этого шаблона там уже есть. */
  readonly skipped: readonly string[];
}

/**
 * Разложить шаблон копиями по выбранным станциям.
 *
 * Одной транзакцией: половина раскатки хуже, чем ни одной, — человек видит «готово»,
 * а часть пиццерий осталась ни с чем, и заметит это не он, а смена через неделю.
 */
export async function copyTemplateToStations(
  templateId: string,
  stationIds: readonly string[],
  now: Date = new Date(),
): Promise<CopyOutcome> {
  const template = await readTemplate(templateId);
  const alreadyHave = await stationsWithCopy(templateId, stationIds);
  const targets = plannedCopies({ stationIds, alreadyHave });

  if (targets.length === 0) return { copied: [], skipped: alreadyHave };

  await getDb().transaction(async (tx) => {
    for (const stationId of targets) {
      const [copy] = await tx
        .insert(checklists)
        .values({
          title: template.title,
          windowStart: template.windowStart,
          windowEnd: template.windowEnd,
          stationId,
          sourceChecklistId: template.id,
          sourceVersion: template.versionNumber,
        })
        .returning({ id: checklists.id });

      if (copy === undefined) {
        throw new Error("Копия чек-листа не создалась: база не вернула строку");
      }

      // Станция записывается и в версию: она замораживается публикацией и больше не
      // читается из `checklists.station_id` (принцип 3) — иначе перенос чек-листа задним
      // числом уводил бы уже принятые заполнения в чужую историю.
      await tx.insert(checklistVersions).values({
        checklistId: copy.id,
        versionNumber: FIRST_VERSION,
        status: "published",
        stationId,
        sections: [...template.sections],
        publishedAt: now,
      });
    }
  });

  return { copied: targets, skipped: alreadyHave };
}
