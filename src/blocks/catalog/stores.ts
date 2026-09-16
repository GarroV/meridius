// Справочник пиццерий: список внутри страны, создание, правка и удаление вместе
// со станциями.
//
// Часовой пояс проверяется здесь, на записи, а не при чтении: окно чек-листа
// сравнивается с местным временем пиццерии (D026), перевод делает PostgreSQL внутри
// выборки, и незнакомое имя зоны роняет публичный маршрут ВСЕХ станций этой пиццерии
// на каждом сканировании (T062). Проверка стоит в слое, а не в форме, потому что
// форма — не единственный путь записи: есть сид, миграция данных и будущий импорт.
import { asc, count, eq } from "drizzle-orm";

import {
  countries,
  getDb,
  stations,
  storeShiftModes,
  stores,
} from "@/blocks/data";

import { CatalogError, asDeletionConflict, requireName } from "./errors";
import { assertKnownTimezone } from "./timezone";

// Тот же приём, что в submissions.ts: некорректный id не должен доходить до драйвера
// и падать кодом 22P02 — по контракту это `notFound`/пустой список, а не исключение.
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const WHAT_STORE = "пиццерия";

export interface StoreRow {
  id: string;
  countryId: string;
  name: string;
  timezone: string;
  stationCount: number;
}

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function storeNotFound(id: string): CatalogError {
  return new CatalogError("notFound", `Пиццерия не найдена: ${id}`);
}

function countryNotFoundForStore(countryId: string): CatalogError {
  return new CatalogError("notFound", `Страна не найдена: ${countryId}`);
}

/**
 * Пиццерии одной страны, отсортированные по имени. `stationCount` считается одним
 * запросом с группировкой (левое соединение со `stations`), как и `storeCount`
 * в countries.ts. Неизвестный или некорректный `countryId` даёт пустой список:
 * справочнику незачем различать «страны нет» и «в ней пока пусто».
 */
export async function listStores(countryId: string): Promise<StoreRow[]> {
  if (!isUuid(countryId)) return [];

  return getDb()
    .select({
      id: stores.id,
      countryId: stores.countryId,
      name: stores.name,
      timezone: stores.timezone,
      stationCount: count(stations.id),
    })
    .from(stores)
    .leftJoin(stations, eq(stations.storeId, stores.id))
    .where(eq(stores.countryId, countryId))
    .groupBy(stores.id)
    .orderBy(asc(stores.name));
}

export async function createStore(input: {
  countryId: string;
  name: string;
  timezone: string;
}): Promise<string> {
  const name = requireName(input.name, WHAT_STORE);
  const timezone = await assertKnownTimezone(input.timezone);
  if (!isUuid(input.countryId)) throw countryNotFoundForStore(input.countryId);

  const db = getDb();
  const countryRows = await db
    .select({ id: countries.id })
    .from(countries)
    .where(eq(countries.id, input.countryId));
  if (countryRows.length === 0) throw countryNotFoundForStore(input.countryId);

  const [row] = await db
    .insert(stores)
    .values({ countryId: input.countryId, name, timezone })
    .returning({ id: stores.id });
  if (row === undefined) throw new Error("Пиццерия не сохранилась");
  return row.id;
}

export async function updateStore(
  id: string,
  input: { name: string; timezone: string },
): Promise<void> {
  if (!isUuid(id)) throw storeNotFound(id);
  const name = requireName(input.name, WHAT_STORE);
  const timezone = await assertKnownTimezone(input.timezone);

  const rows = await getDb()
    .update(stores)
    .set({ name, timezone })
    .where(eq(stores.id, id))
    .returning({ id: stores.id });
  if (rows.length === 0) throw storeNotFound(id);
}

/** Сколько станций у пиццерии. Нужно экрану, чтобы спросить подтверждение по числу («в пиццерии 3 станции»). */
export async function countStationsOfStore(id: string): Promise<number> {
  if (!isUuid(id)) return 0;

  const rows = await getDb()
    .select({ stationCount: count(stations.id) })
    .from(stations)
    .where(eq(stations.storeId, id));
  return rows[0]?.stationCount ?? 0;
}

/**
 * Удаляет пиццерию. Если у неё есть станции, а `confirmed` не передан — отказ
 * `confirmationRequired`, и ничего не удаляется. С подтверждением режим смены, станции
 * и сама пиццерия удаляются в одной транзакции: отказ на любом шаге (станцию или
 * пиццерию не пустить не даёт история заполнений и отметки обходов, `on delete restrict`)
 * откатывает все удаления разом, и висячих станций после неудачи не остаётся.
 *
 * Режим смены снимается вместе с пиццерией, потому что он её НАСТРОЙКА, а не история
 * работы: строка в `store_shift_modes` говорит, как работать сегодня, и без пиццерии не
 * значит ничего. Ссылка оттуда стоит `restrict` и до T154 запрещала удаление навсегда —
 * пиццерию с однажды заданным режимом нельзя было удалить даже при нуле заполнений.
 * Заполнения и отметки обходов, наоборот, остаются неприкосновенными (принцип 3, D002):
 * они помнят, что происходило на смене, и удаление справочника их не отменяет.
 */
export async function deleteStore(
  id: string,
  options: { confirmed: boolean },
): Promise<void> {
  if (!isUuid(id)) throw storeNotFound(id);

  const stationCount = await countStationsOfStore(id);
  if (stationCount > 0 && !options.confirmed) {
    throw new CatalogError(
      "confirmationRequired",
      `Пиццерия ${id}: в ней ${String(stationCount)} станций — удаление требует подтверждения`,
    );
  }

  let deletedRows: { id: string }[];
  try {
    deletedRows = await getDb().transaction(async (tx) => {
      await tx.delete(storeShiftModes).where(eq(storeShiftModes.storeId, id));
      await tx.delete(stations).where(eq(stations.storeId, id));
      return tx
        .delete(stores)
        .where(eq(stores.id, id))
        .returning({ id: stores.id });
    });
  } catch (error) {
    asDeletionConflict(error, WHAT_STORE);
  }
  if (deletedRows.length === 0) throw storeNotFound(id);
}
