// Станции пиццерии и привязка к ним чек-листов. Запросы живут здесь, а не в блоке
// data: туда ходят через его схему и `getDb()`, но собственный CRUD каждого блока
// в нём не собирается (решение D024).
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";

import type { LocalizedText } from "@/blocks/data";
import { checklists, getDb, stations } from "@/blocks/data";

import {
  CatalogError,
  PG_FOREIGN_KEY_VIOLATION,
  PG_UNIQUE_VIOLATION,
  asDeletionConflict,
  pgErrorCode,
  requireName,
} from "./errors";
import { generateStationCode } from "./station-code";

const WHAT = "станция";

// Некорректный uuid доходит до драйвера и падает кодом 22P02 вместо осмысленного
// ответа. Формат проверяется до похода в базу — тем же способом, что в слое заполнений.
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Код станции берётся из 31^10 сочетаний, поэтому совпадение с уже выданным — событие
// астрономической редкости. Но уникальность держит база, а не вероятность: попытки
// повторяются, и только исчерпав их, продукт признаёт отказ вместо молчаливой пятисотки.
const CODE_ATTEMPTS = 5;

export interface StationChecklist {
  id: string;
  title: LocalizedText;
}

export interface StationRow {
  id: string;
  storeId: string;
  name: string;
  code: string;
  codeIssuedAt: Date;
  /** Пустой список — станция без назначенного чек-листа: её QR откроется в пустоту. */
  checklists: StationChecklist[];
}

export interface StationCode {
  code: string;
  issuedAt: Date;
}

function notFound(what: string): CatalogError {
  return new CatalogError("notFound", `${what}: строки с таким id нет`);
}

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/**
 * Выполняет действие со свежим кодом станции, повторяя на столкновении с уже выданным.
 * Уникальность проверяет база (уникальный индекс на `stations.code`), а не выборка
 * перед вставкой: между выборкой и вставкой встаёт другая вставка.
 */
async function withFreshCode<T>(
  action: (code: string) => Promise<T>,
): Promise<T> {
  for (let attempt = 1; attempt <= CODE_ATTEMPTS; attempt += 1) {
    try {
      return await action(generateStationCode());
    } catch (error) {
      if (pgErrorCode(error) !== PG_UNIQUE_VIOLATION) throw error;
    }
  }
  throw new CatalogError(
    "codeCollision",
    `${WHAT}: свободный код не выдан за ${String(CODE_ATTEMPTS)} попыток`,
  );
}

/** Чек-листы станций одним запросом: список станций иначе превратился бы в N+1. */
async function checklistsOfStations(
  stationIds: string[],
): Promise<Map<string, StationChecklist[]>> {
  const grouped = new Map<string, StationChecklist[]>();
  if (stationIds.length === 0) return grouped;

  const rows = await getDb()
    .select({
      id: checklists.id,
      stationId: checklists.stationId,
      title: checklists.title,
    })
    .from(checklists)
    .where(inArray(checklists.stationId, stationIds))
    // Порядок дня, а не алфавит: утренний чек-лист выше вечернего независимо от
    // языка интерфейса. Сортировка по названию требовала бы выбрать язык в запросе.
    .orderBy(asc(checklists.windowStart), asc(checklists.createdAt));

  for (const row of rows) {
    if (row.stationId === null) continue;
    const list = grouped.get(row.stationId) ?? [];
    grouped.set(row.stationId, [...list, { id: row.id, title: row.title }]);
  }
  return grouped;
}

/** Станции пиццерии с назначенными чек-листами. Неизвестная пиццерия — пустой список. */
export async function listStations(storeId: string): Promise<StationRow[]> {
  if (!isUuid(storeId)) return [];

  const rows = await getDb()
    .select({
      id: stations.id,
      storeId: stations.storeId,
      name: stations.name,
      code: stations.code,
      codeIssuedAt: stations.codeIssuedAt,
    })
    .from(stations)
    .where(eq(stations.storeId, storeId))
    .orderBy(asc(stations.name));

  const grouped = await checklistsOfStations(rows.map((row) => row.id));

  return rows.map((row) => ({
    ...row,
    checklists: grouped.get(row.id) ?? [],
  }));
}

export async function createStation(input: {
  storeId: string;
  name: string;
}): Promise<{ id: string; code: string }> {
  const name = requireName(input.name, WHAT);
  if (!isUuid(input.storeId)) throw notFound("пиццерия");

  return withFreshCode(async (code) => {
    try {
      const [row] = await getDb()
        .insert(stations)
        .values({ storeId: input.storeId, name, code })
        .returning({ id: stations.id, code: stations.code });
      if (row === undefined) throw notFound(WHAT);
      return row;
    } catch (error) {
      // Единственный внешний ключ вставки — пиццерия: её нет.
      if (pgErrorCode(error) === PG_FOREIGN_KEY_VIOLATION) {
        throw notFound("пиццерия");
      }
      throw error;
    }
  });
}

export async function updateStation(
  id: string,
  input: { name: string },
): Promise<void> {
  const name = requireName(input.name, WHAT);
  if (!isUuid(id)) throw notFound(WHAT);

  const [row] = await getDb()
    .update(stations)
    .set({ name })
    .where(eq(stations.id, id))
    .returning({ id: stations.id });
  if (row === undefined) throw notFound(WHAT);
}

/**
 * Удаляет станцию. Чек-листы при этом отвязываются (`on delete set null` в схеме),
 * а заполнения удалить не дают (`on delete restrict`): история неприкосновенна,
 * и отказ обязан дойти до человека текстом, а не пятисоткой.
 */
export async function deleteStation(id: string): Promise<void> {
  if (!isUuid(id)) throw notFound(WHAT);

  try {
    const [row] = await getDb()
      .delete(stations)
      .where(eq(stations.id, id))
      .returning({ id: stations.id });
    if (row === undefined) throw notFound(WHAT);
  } catch (error) {
    if (error instanceof CatalogError) throw error;
    asDeletionConflict(error, WHAT);
  }
}

/**
 * Выдаёт станции новый код. Старый перестаёт открывать чек-лист в тот же миг:
 * публичный маршрут ищет станцию по коду в этой же колонке, а не по списку выданных.
 * Это и есть отзыв ссылки (D006) — единственная мера против уехавшей фотографии
 * наклейки, потому что заполняющий не опознаётся вовсе (D001, D021).
 */
export async function reissueStationCode(
  stationId: string,
): Promise<StationCode> {
  if (!isUuid(stationId)) throw notFound(WHAT);

  return withFreshCode(async (code) => {
    const [row] = await getDb()
      .update(stations)
      // Время выпуска — серверное `now()`, а не время машины, которая нажала кнопку.
      .set({ code, codeIssuedAt: sql`now()` })
      .where(eq(stations.id, stationId))
      .returning({ code: stations.code, issuedAt: stations.codeIssuedAt });
    if (row === undefined) throw notFound(WHAT);
    return row;
  });
}

/**
 * Привязывает чек-лист к станции. Привязка живёт в `checklists.station_id`:
 * у станции чек-листов может быть несколько (утренний и вечерний), у чек-листа
 * станция одна.
 */
export async function assignChecklist(
  stationId: string,
  checklistId: string,
): Promise<void> {
  if (!isUuid(stationId)) throw notFound(WHAT);
  if (!isUuid(checklistId)) throw notFound("чек-лист");

  const [station] = await getDb()
    .select({ id: stations.id })
    .from(stations)
    .where(eq(stations.id, stationId));
  if (station === undefined) throw notFound(WHAT);

  // Снятый с работы чек-лист привязать нельзя: методист убрал его из работы, и привязка
  // вернула бы его на станцию молча. Условие стоит в самой записи, а не проверкой до неё:
  // чек-лист снимают с работы и в ту минуту, когда справочник уже показал список.
  const [row] = await getDb()
    .update(checklists)
    .set({ stationId })
    .where(and(eq(checklists.id, checklistId), isNull(checklists.archivedAt)))
    .returning({ id: checklists.id });
  if (row === undefined) {
    // Запись не тронута по двум разным причинам, и человеку они говорят разное.
    const [existing] = await getDb()
      .select({ archivedAt: checklists.archivedAt })
      .from(checklists)
      .where(eq(checklists.id, checklistId));
    if (existing === undefined) throw notFound("чек-лист");
    throw new CatalogError(
      "checklistArchived",
      `чек-лист ${checklistId}: снят с работы, привязать его к станции нельзя`,
    );
  }
}

/** Снимает привязку. Чек-лист остаётся, но его QR больше не открывается ниоткуда. */
export async function detachChecklist(checklistId: string): Promise<void> {
  if (!isUuid(checklistId)) throw notFound("чек-лист");

  const [row] = await getDb()
    .update(checklists)
    .set({ stationId: null })
    .where(eq(checklists.id, checklistId))
    .returning({ id: checklists.id });
  if (row === undefined) throw notFound("чек-лист");
}

/**
 * Чек-листы, которые ещё не привязаны ни к одной станции: их и предлагает экран.
 *
 * Снятые с работы сюда не попадают, хотя станции у них тоже нет. Снос пиццерии отвязывает
 * её чек-листы (`on delete set null`), и архивные оседали в этом списке как мусор, который
 * никто не видит: у методиста в его списке их нет, а справочник предлагал привязать их
 * заново — то есть вернуть в работу снятое.
 */
export async function listUnassignedChecklists(): Promise<StationChecklist[]> {
  return getDb()
    .select({ id: checklists.id, title: checklists.title })
    .from(checklists)
    .where(and(isNull(checklists.stationId), isNull(checklists.archivedAt)))
    .orderBy(asc(checklists.createdAt));
}
