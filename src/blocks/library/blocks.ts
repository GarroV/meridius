// Блоки библиотеки: заведение, чтение, правка, список (D011, T027).
//
// Блок — это название и пункты, и больше ничего: секцией он становится только внутри
// чек-листа, при вставке. Правка блока меняет ровно эту строку и ни одной строки версий —
// в черновики она приезжает подстановкой на чтении (`editor/library-links`), а в
// опубликованные версии не приезжает никогда (принцип 3, D002).
//
// Свои запросы, а не функции в блоке `data`: так решено D024 — иначе `data` собрал бы
// в себе CRUD всех блоков продукта.
import { eq, sql } from "drizzle-orm";

import type { Item, LocalizedText } from "@/blocks/data";
import { blocks, getDb } from "@/blocks/data";

import type { BlockInput } from "./parsing";
import {
  EditorInputError,
  isUuid,
  parseBlockItems,
  parseBlockTitle,
} from "./parsing";

/** Строка списка библиотеки: название, сколько пунктов и в скольких чек-листах вставлен. */
export interface BlockSummary {
  id: string;
  title: LocalizedText;
  itemCount: number;
  /**
   * В скольких чек-листах блок вставлен — черновики и опубликованные версии вместе.
   * Ноль означает «нигде»: экран обязан показать это явно (критерий готовности 5).
   */
  usageCount: number;
}

/** Блок целиком: то, что правится на экране. */
export interface BlockDetail {
  id: string;
  title: LocalizedText;
  items: Item[];
}

// Индексная сигнатура — требование db.execute: без неё тип не проходит его ограничение.
interface SummaryRow extends Record<string, unknown> {
  id: string;
  title: LocalizedText;
  item_count: number;
  usage_count: string;
}

/**
 * Условие «этот блок вставлен в эту версию»: у секции версии в JSONB лежит
 * `source.blockId`. Снятые с работы чек-листы (D049) не считаются — их нет ни в списке,
 * ни на станции, и обещать методисту, что правка их «затронет», было бы неправдой.
 */
const LINKED_VERSIONS = sql`
  from checklist_versions v
  join checklists c on c.id = v.checklist_id
 where c.archived_at is null
   and v.status in ('draft', 'published')`;

/**
 * Список библиотеки. Пункты блоков на экран не тянутся: у списка их незачем показывать,
 * а десяток блоков по два десятка пунктов — это десятки килобайт на каждый заход.
 */
export async function listBlocks(): Promise<BlockSummary[]> {
  const rows = await getDb().execute<SummaryRow>(sql`
    select b.id::text as id, b.title,
      jsonb_array_length(b.items) as item_count,
      (select count(distinct v.checklist_id) ${LINKED_VERSIONS}
          and exists (select 1
                        from jsonb_array_elements(v.sections) s
                       where s->'source'->>'blockId' = b.id::text)) as usage_count
      from blocks b
     order by b.created_at`);

  return rows.rows.map((row) => ({
    id: row.id,
    title: row.title,
    // `jsonb_array_length` — обычное целое, драйвер отдаёт его числом; `count()` —
    // bigint, и он приходит строкой, поэтому приведение нужно только второму.
    itemCount: row.item_count,
    usageCount: Number(row.usage_count),
  }));
}

/** Блок по опознавателю. Неизвестный или непохожий на uuid — `null`, а не отказ драйвера. */
export async function getBlock(blockId: string): Promise<BlockDetail | null> {
  if (!isUuid(blockId)) return null;

  const rows = await getDb()
    .select({ id: blocks.id, title: blocks.title, items: blocks.items })
    .from(blocks)
    .where(eq(blocks.id, blockId))
    .limit(1);

  return rows[0] ?? null;
}

/**
 * Заводит блок. Пустым: пункты набираются сразу после, на том же экране, — форма
 * заведения с пунктами была бы вторым редактором пунктов рядом с первым.
 */
export async function createBlock(title: LocalizedText): Promise<string> {
  const rows = await getDb()
    .insert(blocks)
    .values({ title: parseBlockTitle(title), items: [] })
    .returning({ id: blocks.id });

  const row = rows[0];
  if (row === undefined) throw new Error("Блок библиотеки не вставился");
  return row.id;
}

/**
 * Правка блока. Затрагивает одну строку: версии чек-листов не трогаются вовсе, и
 * именно поэтому опубликованное остаётся прежним, а черновики видят новое (T029).
 *
 * Отметка времени берётся из `now()` базы, а не с устройства: на устройстве часы чужие.
 */
export async function saveBlock(
  blockId: string,
  input: BlockInput,
): Promise<void> {
  if (!isUuid(blockId)) {
    throw new EditorInputError("notFound", `Блока ${blockId} нет`);
  }

  const updated = await getDb()
    .update(blocks)
    .set({
      title: parseBlockTitle(input.title),
      items: parseBlockItems(input.items),
      updatedAt: sql`now()`,
    })
    .where(eq(blocks.id, blockId))
    .returning({ id: blocks.id });

  if (updated.length === 0) {
    throw new EditorInputError("notFound", `Блока ${blockId} нет`);
  }
}
