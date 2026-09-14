// Режим смены пиццерии: что выбрали на сегодня и что из этого следует показывать.
//
// Таблица только пополняется — перестановка режима это новая строка, а не правка
// прежней. Так требует D055: гейта на выбор режима нет сознательно (D052), и
// единственное, что удерживает от привычки сокращать чек-лист каждый день, — то,
// что каждая перестановка остаётся видимой управляющему.
import { and, desc, eq, sql } from "drizzle-orm";

import { getDb } from "./client";
import type { StoreShiftMode } from "./schema";
import { storeShiftModes, stores } from "./schema";
import type { ShiftMode } from "./types";

/** Режим по умолчанию: сокращение обязано быть осознанным действием, а не молчанием. */
const DEFAULT_MODE: ShiftMode = "normal";

export interface ShiftModeState {
  readonly mode: ShiftMode;
  /** Местная дата пиццерии в виде "YYYY-MM-DD" — сутки, к которым относится режим. */
  readonly localDate: string;
  /** Выбирали ли режим сегодня вообще. `false` — работает значение по умолчанию. */
  readonly chosen: boolean;
  readonly staffPresent: number | null;
  readonly staffExpected: number | null;
  readonly setAt: Date | null;
}

export interface SetShiftModeInput {
  readonly storeId: string;
  readonly mode: ShiftMode;
  readonly staffPresent?: number | undefined;
  readonly staffExpected?: number | undefined;
}

/**
 * Местная дата пиццерии для момента `at`. Считается базой, а не в JavaScript:
 * часовой пояс лежит в `stores.timezone` строкой IANA, и правильно применить его
 * умеет PostgreSQL — а сутки смены заканчиваются там, где смена работает (D026).
 */
function localDateSql(at: Date) {
  return sql<string>`(${at.toISOString()}::timestamptz at time zone ${stores.timezone})::date`;
}

/**
 * Действующий режим пиццерии на момент `at`.
 *
 * `null` — такой пиццерии нет. Отсутствие выбора и отсутствие пиццерии — разные
 * ответы: первый значит «работаем полной сменой», второй — «спрашивать не о чем».
 */
export async function getShiftMode(
  storeId: string,
  at: Date,
): Promise<ShiftModeState | null> {
  const localDate = localDateSql(at);

  const [row] = await getDb()
    .select({
      localDate,
      mode: storeShiftModes.mode,
      staffPresent: storeShiftModes.staffPresent,
      staffExpected: storeShiftModes.staffExpected,
      setAt: storeShiftModes.setAt,
    })
    .from(stores)
    .leftJoin(
      storeShiftModes,
      and(
        eq(storeShiftModes.storeId, stores.id),
        eq(storeShiftModes.localDate, localDate),
      ),
    )
    .where(eq(stores.id, storeId))
    // Действует последняя перестановка: строки только добавляются, и свежая сверху.
    .orderBy(desc(storeShiftModes.setAt))
    .limit(1);

  if (row === undefined) return null;

  return {
    mode: row.mode ?? DEFAULT_MODE,
    localDate: row.localDate,
    chosen: row.mode !== null,
    staffPresent: row.staffPresent,
    staffExpected: row.staffExpected,
    setAt: row.setAt,
  };
}

/**
 * Режим пиццерии на КОНКРЕТНЫЕ местные сутки.
 *
 * Нужен там, где сутки уже известны и не совпадают с сегодняшними: проход окна через
 * полночь начался вчера, и режим у него вчерашний (D055) — иначе перестановка режима
 * после полуночи задним числом меняла бы, каких обходов ждали от вечерней смены.
 *
 * Выбора на эти сутки не делали — значит полная смена: сокращение всегда осознанное
 * действие, а не значение по умолчанию.
 */
export async function getShiftModeOnDate(
  storeId: string,
  localDate: string,
): Promise<ShiftMode> {
  const [row] = await getDb()
    .select({ mode: storeShiftModes.mode })
    .from(storeShiftModes)
    .where(
      and(
        eq(storeShiftModes.storeId, storeId),
        eq(storeShiftModes.localDate, localDate),
      ),
    )
    // Действует последняя перестановка: строки только добавляются, и свежая сверху.
    .orderBy(desc(storeShiftModes.setAt))
    .limit(1);

  return row?.mode ?? DEFAULT_MODE;
}

/**
 * Ставит режим на текущие местные сутки пиццерии. Прежний выбор не переписывается:
 * добавляется новая строка, и обе остаются в истории.
 *
 * Дата берётся не из аргумента, а вычисляется базой из часового пояса пиццерии —
 * иначе смена в стране со сдвигом ставила бы режим на чужие сутки.
 */
export async function setShiftMode(
  input: SetShiftModeInput,
  at: Date,
): Promise<ShiftModeState | null> {
  const db = getDb();

  const [target] = await db
    .select({ localDate: localDateSql(at) })
    .from(stores)
    .where(eq(stores.id, input.storeId))
    .limit(1);

  if (target === undefined) return null;

  await db.insert(storeShiftModes).values({
    storeId: input.storeId,
    localDate: target.localDate,
    mode: input.mode,
    staffPresent: input.staffPresent ?? null,
    staffExpected: input.staffExpected ?? null,
  });

  return getShiftMode(input.storeId, at);
}

/** Все перестановки режима за текущие местные сутки, свежие сверху. */
export async function listShiftModeChanges(
  storeId: string,
  at: Date,
): Promise<StoreShiftMode[]> {
  const [target] = await getDb()
    .select({ localDate: localDateSql(at) })
    .from(stores)
    .where(eq(stores.id, storeId))
    .limit(1);

  if (target === undefined) return [];

  return getDb()
    .select()
    .from(storeShiftModes)
    .where(
      and(
        eq(storeShiftModes.storeId, storeId),
        eq(storeShiftModes.localDate, target.localDate),
      ),
    )
    .orderBy(desc(storeShiftModes.setAt));
}
