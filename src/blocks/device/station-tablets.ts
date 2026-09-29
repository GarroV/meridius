// Станции сети вместе с их планшетами — то, на что смотрит раздел «Устройства» (D163).
//
// Отдельно от `devices.ts`: там — жизнь одной привязки (опознать, завести, снять), здесь —
// ответ кабинету «кому что привязано и где планшета нет». Запрос свой, а не заказан в
// блоке `data` (D024), и не взят у `stations/overview.ts`: блок `device` на `stations`
// ссылаться не может (`.dependency-cruiser.cjs`), да и вопрос у раздела станций другой —
// «где по сети дырки», а не «какой планшет где стоит».
import { and, asc, eq, sql } from "drizzle-orm";

import {
  checklists,
  countries,
  devices,
  getDb,
  stations,
  stores,
} from "@/blocks/data";
import { countryCondition, type Scope } from "@/blocks/auth/scope";

import { isUuid } from "./devices";

/** Планшет станции: когда привязали и когда он последний раз открывал чек-лист. */
interface StationTablet {
  readonly id: string;
  readonly pairedAt: Date;
  readonly lastSeenAt: Date;
}

/** Станция со всем путём до неё и её планшетами. Пустой `tablets` — планшета нет. */
export interface StationTablets {
  readonly stationId: string;
  readonly stationName: string;
  readonly storeId: string;
  readonly storeName: string;
  readonly countryId: string;
  readonly countryName: string;
  /**
   * Сколько чек-листов назначено станции. Ноль важен и здесь: привязанный к такой
   * станции планшет покажет «заполнять нечего», и управляющий решит, что сломан планшет.
   */
  readonly checklistCount: number;
  /** По порядку привязки: первым — тот, что стоит дольше всех. */
  readonly tablets: readonly StationTablet[];
}

/**
 * Подзапросом, а не соединением, и с `::int`: соединение с чек-листами размножило бы
 * строки планшетов, а `count()` без приведения приходит от драйвера строкой, и "0"
 * на экране читался бы как «чек-лист есть» (разбор — `stations/overview.ts`).
 */
const checklistCount = sql<number>`(
  select count(*)::int from ${checklists} where ${checklists.stationId} = ${stations.id}
)`;

interface Row {
  readonly stationId: string;
  readonly stationName: string;
  readonly storeId: string;
  readonly storeName: string;
  readonly countryId: string;
  readonly countryName: string;
  readonly checklistCount: number;
  readonly deviceId: string | null;
  readonly pairedAt: Date | null;
  readonly lastSeenAt: Date | null;
}

function selectRows() {
  // Соединение с планшетами ЛЕВОЕ: станция без планшета — главный ответ раздела, и
  // внутреннее соединение выбросило бы её молча.
  return getDb()
    .select({
      stationId: stations.id,
      stationName: stations.name,
      storeId: stores.id,
      storeName: stores.name,
      countryId: countries.id,
      countryName: countries.name,
      checklistCount,
      deviceId: devices.id,
      pairedAt: devices.pairedAt,
      lastSeenAt: devices.lastSeenAt,
    })
    .from(stations)
    .innerJoin(stores, eq(stations.storeId, stores.id))
    .innerJoin(countries, eq(stores.countryId, countries.id))
    .leftJoin(devices, eq(devices.stationId, stations.id));
}

/**
 * Сворачивает строки «станция × планшет» в станции. Строки уже отсортированы так, что
 * станция идёт подряд (по идентификатору после имени — две станции с одним именем не
 * склеиваются), поэтому хватает сравнения с предыдущей.
 */
function foldRows(rows: readonly Row[]): StationTablets[] {
  const result: StationTablets[] = [];
  let tablets: StationTablet[] = [];

  for (const row of rows) {
    if (result.at(-1)?.stationId !== row.stationId) {
      tablets = [];
      result.push({
        stationId: row.stationId,
        stationName: row.stationName,
        storeId: row.storeId,
        storeName: row.storeName,
        countryId: row.countryId,
        countryName: row.countryName,
        checklistCount: row.checklistCount,
        tablets,
      });
    }
    if (
      row.deviceId !== null &&
      row.pairedAt !== null &&
      row.lastSeenAt !== null
    ) {
      tablets.push({
        id: row.deviceId,
        pairedAt: row.pairedAt,
        lastSeenAt: row.lastSeenAt,
      });
    }
  }

  return result;
}

/** Все станции сети с планшетами: страна, пиццерия, станция — так их ищет человек. */
export async function listStationTablets(
  scope: Scope,
): Promise<StationTablets[]> {
  // Область видимости (D145): партнёр видит станции своих стран, УК — всю сеть.
  const rows = await selectRows()
    .where(countryCondition(scope, stores.countryId))
    .orderBy(
      asc(countries.name),
      asc(countries.id),
      asc(stores.name),
      asc(stores.id),
      asc(stations.name),
      asc(stations.id),
      asc(devices.pairedAt),
    );
  return foldRows(rows);
}

/**
 * Одна станция для выдвижной панели. `null` — станции нет: удалили, пока панель была
 * открыта, или в адресе мусор. Значение приходит из адреса, поэтому вид проверяется до
 * базы: `uuid` не того вида уронил бы запрос ошибкой типа вместо «станции нет».
 */
export async function findStationTablets(
  stationId: string,
  scope: Scope,
): Promise<StationTablets | null> {
  if (!isUuid(stationId)) return null;

  // Чужая станция — «станции нет», как и удалённая (D145).
  const rows = await selectRows()
    .where(
      and(
        eq(stations.id, stationId),
        countryCondition(scope, stores.countryId),
      ),
    )
    .orderBy(asc(devices.pairedAt));
  return foldRows(rows)[0] ?? null;
}
