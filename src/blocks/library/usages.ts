// «Где используется» и цена правки блока (T030, критерии готовности 2 и 3).
//
// Перед сохранением методист обязан видеть, что он затронет. Ответ считается по живому:
// черновик и текущая опубликованная версия каждого чек-листа. Архивные версии не в счёт —
// они не меняются никогда и ни на одной станции не открываются, поэтому «затронуть» их
// нельзя даже теоретически (принцип 3, D002).
import { sql } from "drizzle-orm";

import type { LocalizedText } from "@/blocks/data";
import { getDb } from "@/blocks/data";

import { isUuid } from "./parsing";

/** Чек-лист, в который вставлен блок: куда вести ссылку и что правка с ним сделает. */
export interface BlockUsage {
  checklistId: string;
  title: LocalizedText;
  /** Станция и пиццерия чек-листа: «Кухня» есть в каждой пиццерии (D032). */
  station: string | null;
  store: string | null;
  /** Блок вставлен в черновик — правка блока придёт сюда. */
  draft: boolean;
  /** Блок входит в текущую опубликованную версию — она останется как есть. */
  published: boolean;
}

/** Сводка для предупреждения над кнопкой сохранения. */
export interface UsageImpact {
  checklists: number;
  drafts: number;
  published: number;
}

// Индексная сигнатура — требование db.execute: без неё тип не проходит его ограничение.
interface UsageRow extends Record<string, unknown> {
  checklist_id: string;
  title: LocalizedText;
  station: string | null;
  store: string | null;
  in_draft: boolean;
  in_published: boolean;
}

/**
 * Чек-листы, в которых вставлен блок. Запрос параметризованный: опознаватель приходит
 * из адреса, то есть от кого угодно, и склеивать из него текст запроса нельзя даже
 * после проверки формата.
 */
export async function listUsages(blockId: string): Promise<BlockUsage[]> {
  if (!isUuid(blockId)) return [];

  const rows = await getDb().execute<UsageRow>(sql`
    select c.id::text as checklist_id, c.title,
           st.name as station, s.name as store,
           bool_or(v.status = 'draft') as in_draft,
           bool_or(v.status = 'published') as in_published
      from checklist_versions v
      join checklists c on c.id = v.checklist_id
      left join stations st on st.id = c.station_id
      left join stores s on s.id = st.store_id
     where c.archived_at is null
       and v.status in ('draft', 'published')
       and exists (select 1
                     from jsonb_array_elements(v.sections) sec
                    where sec->'source'->>'blockId' = ${blockId}::text)
     group by c.id, c.title, st.name, s.name
     order by s.name nulls last, c.created_at`);

  return rows.rows.map((row) => ({
    checklistId: row.checklist_id,
    title: row.title,
    station: row.station,
    store: row.store,
    draft: row.in_draft,
    published: row.in_published,
  }));
}

/**
 * Что затронет правка. Чистая функция над уже прочитанным списком, а не второй запрос:
 * два запроса про одно и то же расходятся между собой, а экран показал бы список из
 * одного и число из другого.
 */
export function usageImpact(usages: readonly BlockUsage[]): UsageImpact {
  return {
    checklists: usages.length,
    drafts: usages.filter((usage) => usage.draft).length,
    published: usages.filter((usage) => usage.published).length,
  };
}
