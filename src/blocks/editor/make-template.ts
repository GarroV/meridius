// «Сделать шаблоном» (D174): чек-лист станции даёт шаблон УК — без станции и без страны.
//
// Зачем обратный ход. Шаблоны родились позже чек-листов: всё, что сеть уже отладила в
// пилоте, живёт чек-листами конкретных станций, а раздел «Шаблоны» пуст. Переписывать
// их руками заново — значит получить второй, чуть другой экземпляр того же списка.
//
// Исходный чек-лист после этого — копия нового шаблона версии 1 (D155): он и есть тот
// самый экземпляр, с которого шаблон снят. Поэтому потом ему придёт «шаблон обновился»,
// как любой другой копии. Опубликованное на станции не трогается.
//
// Источник у шаблона не записывается: `sourceChecklistId` у чек-листа значит «я копия
// этого шаблона», и обратная ссылка с шаблона на станцию дала бы петлю, в которой
// «шаблон обновился» пришёл бы самому шаблону.
import { randomUUID } from "node:crypto";

import { and, desc, eq, exists, isNotNull, isNull } from "drizzle-orm";

import { hqTenantId } from "@/blocks/auth/accounts";
import {
  checklistVersions,
  checklists,
  getDb,
  type LocalizedText,
  stations,
} from "@/blocks/data";

import { isUuid } from "./validation";

/** Первая версия шаблона: он рождается опубликованным — иначе его нечем раздавать. */
const FIRST_VERSION = 1;

export type MakeTemplateRefusal =
  "notChecklist" | "noPublishedVersion" | "alreadyFromTemplate";

/** Отказ с причиной, которую можно показать человеку. */
// Поле объявлено явно, а не свойством в параметре конструктора: скрипт пачки
// (`templates-from-store.mjs`) грузит модуль node без сборки, а node разбирает TypeScript
// только срезанием типов и свойства в параметрах не понимает.
export class MakeTemplateError extends Error {
  readonly reason: MakeTemplateRefusal;

  constructor(reason: MakeTemplateRefusal) {
    super(reason);
    this.reason = reason;
    this.name = "MakeTemplateError";
  }
}

async function readSource(checklistId: string) {
  if (!isUuid(checklistId)) throw new MakeTemplateError("notChecklist");
  const db = getDb();

  const [source] = await db
    .select({
      id: checklists.id,
      title: checklists.title,
      windowStart: checklists.windowStart,
      windowEnd: checklists.windowEnd,
      isTemplate: checklists.isTemplate,
      archivedAt: checklists.archivedAt,
      sourceChecklistId: checklists.sourceChecklistId,
    })
    .from(checklists)
    .where(eq(checklists.id, checklistId))
    .limit(1);

  if (source === undefined || source.isTemplate || source.archivedAt !== null) {
    throw new MakeTemplateError("notChecklist");
  }
  // Уже копия шаблона — значит шаблон у этого списка есть: либо он из шаблона взят,
  // либо шаблон из него уже сделан. Второй шаблон был бы дублем в разделе.
  if (source.sourceChecklistId !== null) {
    throw new MakeTemplateError("alreadyFromTemplate");
  }

  const [version] = await db
    .select({ sections: checklistVersions.sections })
    .from(checklistVersions)
    .where(
      and(
        eq(checklistVersions.checklistId, checklistId),
        eq(checklistVersions.status, "published"),
        isNotNull(checklistVersions.versionNumber),
      ),
    )
    // Последняя опубликованная: шаблон снимает то, что сейчас видят на станции.
    .orderBy(desc(checklistVersions.versionNumber))
    .limit(1);

  // Черновик шаблоном не становится: пустой или недоделанный шаблон разъехался бы по
  // станциям и выглядел бы поломкой продукта.
  if (version === undefined) throw new MakeTemplateError("noPublishedVersion");

  return { ...source, sections: version.sections };
}

/** Сделать из чек-листа шаблон. Возвращает идентификатор шаблона. */
export async function makeTemplateFromChecklist(
  checklistId: string,
  now: Date = new Date(),
): Promise<string> {
  const source = await readSource(checklistId);
  // Шаблоны — общее для всей сети и принадлежат УК (D145, D149), чей бы чек-лист ни был
  // исходником.
  const tenantId = await hqTenantId();
  // Идентификатор задаётся здесь, а не читается из `returning`: версии и обратной ссылке
  // исходника он нужен сразу, и ветки «база не вернула строку» просто нет.
  const templateId = randomUUID();

  await getDb().transaction(async (tx) => {
    await tx.insert(checklists).values({
      id: templateId,
      title: source.title,
      windowStart: source.windowStart,
      windowEnd: source.windowEnd,
      stationId: null,
      isTemplate: true,
      tenantId,
    });

    // Пункты сохраняют опознаватели: по ним потом видно, что в копиях изменили.
    await tx.insert(checklistVersions).values({
      checklistId: templateId,
      versionNumber: FIRST_VERSION,
      status: "published",
      stationId: null,
      sections: [...source.sections],
      publishedAt: now,
    });

    await tx
      .update(checklists)
      .set({ sourceChecklistId: templateId, sourceVersion: FIRST_VERSION })
      .where(eq(checklists.id, source.id));
  });

  return templateId;
}

export interface TemplateCandidate {
  readonly checklistId: string;
  readonly title: LocalizedText;
  readonly stationName: string;
}

/**
 * Чек-листы пиццерии, из которых можно сделать шаблоны пачкой (D174): живые, не шаблоны,
 * без источника и с опубликованной версией — ровно те, кого примет
 * `makeTemplateFromChecklist`. Пачкой пользуется скрипт `templates-from-store.mjs`.
 */
export async function listTemplateCandidates(
  storeId: string,
): Promise<readonly TemplateCandidate[]> {
  if (!isUuid(storeId)) return [];

  return getDb()
    .select({
      checklistId: checklists.id,
      title: checklists.title,
      stationName: stations.name,
    })
    .from(checklists)
    .innerJoin(stations, eq(stations.id, checklists.stationId))
    .where(
      and(
        eq(stations.storeId, storeId),
        eq(checklists.isTemplate, false),
        isNull(checklists.archivedAt),
        isNull(checklists.sourceChecklistId),
        exists(
          getDb()
            .select({ id: checklistVersions.id })
            .from(checklistVersions)
            .where(
              and(
                eq(checklistVersions.checklistId, checklists.id),
                eq(checklistVersions.status, "published"),
              ),
            ),
        ),
      ),
    )
    .orderBy(stations.name);
}
