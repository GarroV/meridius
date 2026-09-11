// Уборка за сквозным смоуком и перепись контура (T089).
//
// Смоук проходит продукт настоящими действиями и потому оставляет за собой настоящие
// строки: страну, пиццерию, станцию, чек-лист с версией и заполнение. Убирать их
// средствами самого продукта нельзя, и это не недоделка, а решение: заполнения не
// удаляются вовсе (история неприкосновенна, `on delete restrict` у `submissions`),
// а чек-лист с заполнениями продукт снимает с работы, а не стирает (`removeChecklist`
// в блоке editor). Поэтому уборка идёт через слой доступа, мимо экранов.
//
// Почему уборка «по имени страны» не работала. `checklists.station_id` объявлен
// `on delete set null`: удаление станции отвязывает чек-лист, но не уничтожает его
// историю. Значит, снеся страну со станциями, мы оставляли чек-листы прогонов
// висеть без станции — их уже не найти ни по стране, ни в справочнике, и они копились
// молча (07.09.2026 набралось восемь при трёх настоящих). Отсюда два правила ниже:
// метку смоука несут ВСЕ имена прогона, включая название чек-листа, и снимаются
// чек-листы РАНЬШЕ станций, чтобы отвязанных не появлялось вовсе.
import { count, inArray, isNull, or, sql } from "drizzle-orm";

import type { Database } from "@/blocks/data";
import {
  blocks,
  checklistVersions,
  checklists,
  countries,
  getDb,
  stations,
  storeShiftModes,
  stores,
  submissions,
} from "@/blocks/data";

import { DEMO } from "./dataset";
import type { DemoDataset } from "./model";

/**
 * Метка данных смоука. Одно слово, придуманное и не встречающееся в живых
 * справочниках, — по нему уборка и опознаёт своё. Метку обязаны нести все имена
 * прогона: чек-лист переживает свою станцию, и, не будь метки в его названии,
 * отвязанный чек-лист было бы нечем отличить от чек-листа, который методист
 * сознательно отвязал от станции сам (`detachChecklist` в блоке catalog).
 */
export const SMOKE_MARKER = "Smokeland";

export interface SmokeNames {
  readonly country: string;
  readonly store: string;
  readonly station: string;
  readonly checklist: string;
}

/** Имена одного прогона. Метка и опознаватель прогона — в каждом из них. */
export function smokeNames(label: string): SmokeNames {
  return {
    country: `${SMOKE_MARKER} ${label}`,
    store: `${SMOKE_MARKER}, Harbour ${label}`,
    station: `${SMOKE_MARKER} kitchen ${label}`,
    checklist: `${SMOKE_MARKER} kitchen opening ${label}`,
  };
}

/** Сколько строк снято, по таблицам. Ноль по всем — база и так была чистой. */
export interface SmokeSweep {
  readonly countries: number;
  readonly stores: number;
  readonly stations: number;
  readonly checklists: number;
  readonly versions: number;
  readonly submissions: number;
  readonly shiftModes: number;
  readonly total: number;
}

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Образец поиска метки: `like` по тексту, чтобы опознаватель прогона не мешал. */
const MARKED = `%${SMOKE_MARKER}%`;

/**
 * Снимает данные ВСЕХ прогонов смоука: и текущего, и брошенных прежде.
 *
 * Одной транзакцией и в порядке связей: сначала то, что ссылается. Снятие брошенных
 * прогонов на входе — не роскошь: прогон, убитый по Ctrl-C или упавший вместе с
 * машиной, до своей уборки не доходит, и без этого его строки остались бы навсегда.
 */
export async function sweepSmokeRuns(): Promise<SmokeSweep> {
  return getDb().transaction(async (tx) => sweepInside(tx));
}

async function sweepInside(tx: Transaction): Promise<SmokeSweep> {
  const smokeCountries = await tx
    .select({ id: countries.id })
    .from(countries)
    .where(sql`${countries.name} like ${MARKED}`);
  const countryIds = smokeCountries.map((row) => row.id);

  const smokeStores =
    countryIds.length === 0
      ? []
      : await tx
          .select({ id: stores.id })
          .from(stores)
          .where(inArray(stores.countryId, countryIds));
  const storeIds = smokeStores.map((row) => row.id);

  const smokeStations =
    storeIds.length === 0
      ? []
      : await tx
          .select({ id: stations.id })
          .from(stations)
          .where(inArray(stations.storeId, storeIds));
  const stationIds = smokeStations.map((row) => row.id);

  // Чек-листы прогона ищутся И по станции, И по метке в названии. Второе условие
  // забирает ровно те остатки, ради которых задача заведена: чек-лист, переживший
  // свою станцию, по станции уже не находится.
  const smokeChecklists = await tx
    .select({ id: checklists.id })
    .from(checklists)
    .where(
      or(
        sql`${checklists.title}::text like ${MARKED}`,
        ...(stationIds.length > 0
          ? [inArray(checklists.stationId, stationIds)]
          : []),
      ),
    );
  const checklistIds = smokeChecklists.map((row) => row.id);

  const versionConditions = [
    ...(checklistIds.length > 0
      ? [inArray(checklistVersions.checklistId, checklistIds)]
      : []),
    ...(stationIds.length > 0
      ? [inArray(checklistVersions.stationId, stationIds)]
      : []),
  ];
  const smokeVersions =
    versionConditions.length === 0
      ? []
      : await tx
          .select({ id: checklistVersions.id })
          .from(checklistVersions)
          .where(or(...versionConditions));
  const versionIds = smokeVersions.map((row) => row.id);

  const submissionConditions = [
    ...(stationIds.length > 0
      ? [inArray(submissions.stationId, stationIds)]
      : []),
    ...(versionIds.length > 0
      ? [inArray(submissions.versionId, versionIds)]
      : []),
  ];
  const removedSubmissions =
    submissionConditions.length === 0
      ? []
      : await tx
          .delete(submissions)
          .where(or(...submissionConditions))
          .returning({ id: submissions.id });

  const removedVersions =
    versionIds.length === 0
      ? []
      : await tx
          .delete(checklistVersions)
          .where(inArray(checklistVersions.id, versionIds))
          .returning({ id: checklistVersions.id });

  const removedChecklists =
    checklistIds.length === 0
      ? []
      : await tx
          .delete(checklists)
          .where(inArray(checklists.id, checklistIds))
          .returning({ id: checklists.id });

  // Режимы смены держат пиццерию внешним ключом: без их снятия удаление пиццерии
  // упёрлось бы в него и откатило бы всю уборку.
  const removedShiftModes =
    storeIds.length === 0
      ? []
      : await tx
          .delete(storeShiftModes)
          .where(inArray(storeShiftModes.storeId, storeIds))
          .returning({ id: storeShiftModes.id });

  const removedStations =
    stationIds.length === 0
      ? []
      : await tx
          .delete(stations)
          .where(inArray(stations.id, stationIds))
          .returning({ id: stations.id });

  const removedStores =
    storeIds.length === 0
      ? []
      : await tx
          .delete(stores)
          .where(inArray(stores.id, storeIds))
          .returning({ id: stores.id });

  const removedCountries =
    countryIds.length === 0
      ? []
      : await tx
          .delete(countries)
          .where(inArray(countries.id, countryIds))
          .returning({ id: countries.id });

  const swept = {
    countries: removedCountries.length,
    stores: removedStores.length,
    stations: removedStations.length,
    checklists: removedChecklists.length,
    versions: removedVersions.length,
    submissions: removedSubmissions.length,
    shiftModes: removedShiftModes.length,
  };

  return {
    ...swept,
    total: Object.values(swept).reduce((sum, value) => sum + value, 0),
  };
}

/** Сколько строк лежит в базе — по каждой таблице контура, без разбора чьи они. */
export interface Census {
  readonly countries: number;
  readonly stores: number;
  readonly stations: number;
  readonly blocks: number;
  readonly checklists: number;
  readonly versions: number;
  readonly submissions: number;
  readonly shiftModes: number;
}

/** Перепись базы: столько строк в ней есть сейчас. */
export async function readCensus(): Promise<Census> {
  const db = getDb();
  const of = async (
    table:
      | typeof countries
      | typeof stores
      | typeof stations
      | typeof blocks
      | typeof checklists
      | typeof checklistVersions
      | typeof submissions
      | typeof storeShiftModes,
  ): Promise<number> => {
    const rows = await db.select({ value: count() }).from(table);
    return rows[0]?.value ?? 0;
  };

  return {
    countries: await of(countries),
    stores: await of(stores),
    stations: await of(stations),
    blocks: await of(blocks),
    checklists: await of(checklists),
    versions: await of(checklistVersions),
    submissions: await of(submissions),
    shiftModes: await of(storeShiftModes),
  };
}

/**
 * Перепись, которую даёт описание контура. Считается из самого описания, а не записана
 * числами: иначе первое же добавленное показательное заполнение сделало бы проверку
 * ложной, и её отключили бы вместо того, чтобы поправить.
 */
export function contourCensus(data: DemoDataset = DEMO): Census {
  return {
    countries: 1,
    stores: data.stores.length,
    stations: data.stations.length,
    blocks: data.blocks.length,
    checklists: data.checklists.length,
    // Версии = черновик на каждый чек-лист плюс все опубликованные и архивные.
    versions:
      data.checklists.length +
      data.checklists.reduce(
        (total, checklist) => total + checklist.versions.length,
        0,
      ),
    submissions: data.submissions.length,
    shiftModes: data.shiftModes.length,
  };
}

const CENSUS_TITLES: Readonly<Record<keyof Census, string>> = {
  countries: "стран",
  stores: "пиццерий",
  stations: "станций",
  blocks: "блоков библиотеки",
  checklists: "чек-листов",
  versions: "версий",
  submissions: "заполнений",
  shiftModes: "режимов смены",
};

/**
 * Чем перепись базы разошлась с описанием контура — человеческим текстом, а не
 * сравнением объектов: сообщение читают в консоли смоука, и «ожидалось 3, лежит 11»
 * должно называть таблицу словом.
 */
export function censusDifferences(actual: Census, expected: Census): string[] {
  return (Object.keys(CENSUS_TITLES) as (keyof Census)[])
    .filter((key) => actual[key] !== expected[key])
    .map(
      (key) =>
        `${CENSUS_TITLES[key]}: в базе ${String(actual[key])}, в контуре ${String(expected[key])}`,
    );
}

/**
 * Сколько чек-листов лежит без станции. В демонстрационном контуре таких нет вовсе,
 * поэтому число выводится рядом с расхождением переписи: именно оно объясняет,
 * почему чек-листов больше, чем в контуре.
 */
export async function countDetachedChecklists(): Promise<number> {
  const rows = await getDb()
    .select({ value: count() })
    .from(checklists)
    .where(isNull(checklists.stationId));
  return rows[0]?.value ?? 0;
}
