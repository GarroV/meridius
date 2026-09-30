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

import {
  CatalogError,
  PG_UNIQUE_VIOLATION,
  asDeletionConflict,
  pgErrorCode,
  requireName,
} from "./errors";
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
  /** Город — отдельно от названия (#141). `null` — не заведён. */
  city: string | null;
  /** Код точки: опознаватель в справочнике сети, уникален в стране. `null` — нет кода. */
  code: string | null;
  stationCount: number;
}

/**
 * Город и код точки на записи. `undefined` — поле не трогается: форма экрана и сид
 * о них не знают, и их правка не должна отвязать пиццерию от справочника сети (#141).
 * Пустая строка и `null` — снять значение.
 */
interface StoreLocation {
  city?: string | null;
  code?: string | null;
}

/** Срезает пробелы по краям; пустое значение хранится как отсутствие. */
function optionalText(
  value: string | null | undefined,
): string | null | undefined {
  if (value === undefined || value === null) return value;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function locationValues(input: StoreLocation): {
  city?: string | null;
  code?: string | null;
} {
  const city = optionalText(input.city);
  const code = optionalText(input.code);
  return {
    ...(city === undefined ? {} : { city }),
    ...(code === undefined ? {} : { code }),
  };
}

/**
 * Занятый в стране код точки — отказ `storeCodeTaken`, а не пятисотка: уникальность
 * держит индекс `stores_country_code_uq`, и другого нарушения уникальности у `stores` нет.
 */
async function withCodeGuard<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (error) {
    if (pgErrorCode(error) === PG_UNIQUE_VIOLATION) {
      throw new CatalogError(
        "storeCodeTaken",
        "Код точки уже занят другой пиццерией этой страны",
      );
    }
    throw error;
  }
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
      city: stores.city,
      code: stores.code,
      stationCount: count(stations.id),
    })
    .from(stores)
    .leftJoin(stations, eq(stations.storeId, stores.id))
    .where(eq(stores.countryId, countryId))
    .groupBy(stores.id)
    .orderBy(asc(stores.name));
}

export async function createStore(
  input: {
    countryId: string;
    name: string;
    timezone: string;
  } & StoreLocation,
): Promise<string> {
  const name = requireName(input.name, WHAT_STORE);
  const timezone = await assertKnownTimezone(input.timezone);
  if (!isUuid(input.countryId)) throw countryNotFoundForStore(input.countryId);

  const db = getDb();
  const countryRows = await db
    .select({ id: countries.id })
    .from(countries)
    .where(eq(countries.id, input.countryId));
  if (countryRows.length === 0) throw countryNotFoundForStore(input.countryId);

  const [row] = await withCodeGuard(() =>
    db
      .insert(stores)
      .values({
        countryId: input.countryId,
        name,
        timezone,
        ...locationValues(input),
      })
      .returning({ id: stores.id }),
  );
  if (row === undefined) throw new Error("Пиццерия не сохранилась");
  return row.id;
}

export async function updateStore(
  id: string,
  input: { name: string; timezone: string } & StoreLocation,
): Promise<void> {
  if (!isUuid(id)) throw storeNotFound(id);
  const name = requireName(input.name, WHAT_STORE);
  const timezone = await assertKnownTimezone(input.timezone);

  const rows = await withCodeGuard(() =>
    getDb()
      .update(stores)
      .set({ name, timezone, ...locationValues(input) })
      .where(eq(stores.id, id))
      .returning({ id: stores.id }),
  );
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
