// Сеть одним чтением: каждая станция вместе с тем, чем она закрыта и как на ней живут.
//
// Зачем отдельно от `catalog/stations.ts`. Тот отвечает на вопрос «какие станции у этой
// пиццерии» — он обслуживает справочник, где человек уже выбрал страну и пиццерию.
// Раздел станций спрашивает обратное: «где по всей сети дырки». Собирать такой ответ
// перебором пиццерий значит сделать N+1 запрос и показать человеку опись вместо дырок.
//
// Запрос один на весь экран, и это не оптимизация впрок, а условие существования
// экрана: при 147 пиццериях по три станции перебор — это 441 поход в базу на каждую
// отрисовку списка.
import { asc, eq, sql } from "drizzle-orm";

import {
  checklists,
  countries,
  devices,
  getDb,
  stations,
  stores,
  submissions,
} from "@/blocks/data";
import { countryCondition, type Scope } from "@/blocks/auth/scope";

import { type StationGap, gapsOf } from "./gaps";

/** Станция сети со всем, что про неё нужно знать списку. */
export interface NetworkStation {
  readonly id: string;
  readonly name: string;
  readonly code: string;
  readonly storeId: string;
  readonly storeName: string;
  readonly countryId: string;
  readonly countryName: string;
  /** Сколько чек-листов назначено. Ноль виден человеку как «нет чек-листа». */
  readonly checklistCount: number;
  /** Сколько планшетов привязано. Ноль — заполняют только с телефона по наклейке. */
  readonly deviceCount: number;
  /** Когда заполняли в последний раз, либо `null` — ни разу. */
  readonly lastSubmissionAt: Date | null;
  /** Чем станция не закрыта. Пустой список — всё в порядке. */
  readonly gaps: readonly StationGap[];
}

/**
 * Считанные подзапросом, а не соединением. Соединить три таблицы «один ко многим» в
 * один `join` — значит размножить строки друг на друга: станция с двумя чек-листами и
 * двумя планшетами вернулась бы четырьмя строками, и любой счёт по ним стал бы вдвое
 * больше правды. Молча: запрос отработает и отдаст красивое неверное число.
 */
// `::int` — не украшение. `count()` в PostgreSQL возвращает bigint, а драйвер отдаёт
// bigint СТРОКОЙ: восьмибайтное число не влезает в `number` без потерь, и решать за
// вызывающего драйвер не берётся. Тип `sql<number>` — это обещание, которое TypeScript
// принимает на веру и проверить не может, поэтому обещание надо делать правдой в самом
// SQL. Иначе сравнение `checklistCount === 0` в `gaps.ts` ловит строку "0", молча не
// срабатывает, и экран показывает «разрывов нет» ровно там, где станция стоит без
// чек-листа. Поймано на себе: линт счёл обёртку `Number()` лишней, потому что верил типу.
//
// Считаются только действующие чек-листы. Удаление чек-листа с заполнениями лишь ставит
// `archived_at` и оставляет `station_id` (`editor/removal.ts`), поэтому без условия станция
// с одним снятым с работы чек-листом выглядела бы закрытой, хотя наклейка открывает пустоту
// (#193).
const checklistCount = sql<number>`(
  select count(*)::int from ${checklists}
  where ${checklists.stationId} = ${stations.id} and ${checklists.archivedAt} is null
)`;

const deviceCount = sql<number>`(
  select count(*)::int from ${devices} where ${devices.stationId} = ${stations.id}
)`;

/**
 * Время берётся у `submittedAt`, а не у начала заполнения: «молчит» — это про то, когда
 * станция в последний раз ОТЧИТАЛАСЬ, а начатое и брошенное заполнение отчётом не
 * является. Повторные отправки (`duplicate`) не отсеиваются намеренно: они всё равно
 * доказывают, что на станции кто-то был, а это ровно то, о чём спрашивает признак.
 *
 * `mapWith` — по той же причине, что `::int` у счётчиков: подзапрос возвращает сырое
 * значение, и драйвер отдаёт `timestamptz` СТРОКОЙ, а `sql<Date>` только обещает дату.
 * `mapWith` прогоняет значение через разбор самой колонки. Без него экран падал на
 * первой же станции, где кто-то уже заполнял чек-лист (`since.getTime is not a function`).
 */
const lastSubmissionAt = sql<Date | null>`(
  select max(${submissions.submittedAt}) from ${submissions}
  where ${submissions.stationId} = ${stations.id}
)`.mapWith(submissions.submittedAt);

/**
 * Все станции сети, отсортированные так, как человек их ищет: страна, пиццерия,
 * станция. Порядок задаётся базой, а не разметкой: иначе дерево пересобиралось бы
 * на каждой отрисовке и разъезжалось между экраном и печатью наклеек.
 */
export async function listNetworkStations(
  scope: Scope,
  now: Date = new Date(),
): Promise<readonly NetworkStation[]> {
  const rows = await getDb()
    .select({
      id: stations.id,
      name: stations.name,
      code: stations.code,
      createdAt: stations.createdAt,
      storeId: stores.id,
      storeName: stores.name,
      countryId: countries.id,
      countryName: countries.name,
      checklistCount,
      deviceCount,
      lastSubmissionAt,
    })
    .from(stations)
    .innerJoin(stores, eq(stations.storeId, stores.id))
    .innerJoin(countries, eq(stores.countryId, countries.id))
    // Область видимости (D145): партнёр видит станции своих стран, УК — всю сеть.
    .where(countryCondition(scope, stores.countryId))
    .orderBy(asc(countries.name), asc(stores.name), asc(stations.name));

  return rows.map(({ createdAt, ...row }) => ({
    ...row,
    checklistCount: row.checklistCount,
    deviceCount: row.deviceCount,
    lastSubmissionAt: row.lastSubmissionAt,
    gaps: gapsOf(
      {
        checklistCount: row.checklistCount,
        lastSubmissionAt: row.lastSubmissionAt,
        createdAt,
      },
      now,
    ),
  }));
}

/** Счёт дырок по сети — то, что главная кабинета показывает первой строкой. */
export function countGaps(
  rows: readonly NetworkStation[],
): Readonly<Record<StationGap, number>> {
  return {
    noChecklist: rows.filter((row) => row.gaps.includes("noChecklist")).length,
    silent: rows.filter((row) => row.gaps.includes("silent")).length,
  };
}
