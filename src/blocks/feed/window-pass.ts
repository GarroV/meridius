// Проход окна чек-листа в местном времени пиццерии — выражениями SQL.
//
// Один набор выражений на всех, кто спрашивает «было ли окно и заполнили ли его»: тревоги
// (`alarms.ts`: пропущенный чек-лист и критичный пункт без ответа) и статус чек-листа на
// сегодня (`today-windows.ts`). Держать их одним куском обязательно — правило подъёма у
// них общее (D054), а две копии этого счёта разъехались бы на первой же правке, и
// разъехались бы молча: обе продолжали бы что-то показывать.
//
// Местное время считает база, а не JavaScript: сутки смены заканчиваются там, где смена
// работает (D026). Пояс берётся из присоединённого списка зон (`timezoneNames`), а НЕ из
// `stores.timezone`: выборки идут по многим пиццериям сразу, и одно незнакомое базе имя
// роняло бы весь запрос. С присоединённым именем такая пиццерия даёт NULL и выпадает.
import { sql, type SQL } from "drizzle-orm";

import {
  checklists,
  storeShiftModes,
  stores,
  submissions,
  timezoneNames,
} from "@/blocks/data";
import type { ShiftMode } from "@/blocks/data";

/** Местное время пиццерии для момента `at`. */
export function localNowSql(at: Date): SQL {
  return sql`(${at.toISOString()}::timestamptz at time zone ${timezoneNames.name})`;
}

/** Один проход окна: границы в местном времени пиццерии. */
export interface WindowPass {
  /** Проход уже закрылся к моменту `at`. */
  readonly closed: SQL;
  /** Начало прохода в местном времени. У окна через полночь — может быть вчера. */
  readonly startLocal: SQL;
  /** Конец прохода в местном времени. */
  readonly endLocal: SQL;
  /**
   * Границы секундами эпохи, а не отметкой времени: для node-postgres drizzle отключает
   * разбор дат драйвером и сам разбирает только СВОИ колонки, поэтому сырое выражение
   * вернулось бы строкой «2026-09-06 12:00:00+00». Число не зависит ни от разборщика,
   * ни от локали.
   */
  readonly startEpoch: SQL<number>;
  readonly endEpoch: SQL<number>;
}

function epochOf(local: SQL): SQL<number> {
  return sql<number>`extract(epoch from (${local} at time zone ${timezoneNames.name}))::float8`;
}

function passOf(startLocal: SQL, endLocal: SQL, at: Date): WindowPass {
  return {
    closed: sql`${localNowSql(at)} >= ${endLocal}`,
    startLocal,
    endLocal,
    startEpoch: epochOf(startLocal),
    endEpoch: epochOf(endLocal),
  };
}

/**
 * Проход, закончившийся (или заканчивающийся) СЕГОДНЯ по местному времени пиццерии.
 *
 * Берётся именно заканчивающийся проход, а не начавшийся: у окна через полночь
 * (20:00–00:00) проход, начатый сегодня, кончается завтра, и по началу вечернее
 * закрытие не порождало бы тревоги никогда — а именно оно и есть самое важное.
 */
export function windowPassEndingToday(at: Date): WindowPass {
  const localDate = sql`${localNowSql(at)}::date`;
  const startLocal = sql`(case
        when ${checklists.windowStart} <= ${checklists.windowEnd}
          then ${localDate} + ${checklists.windowStart}
        else (${localDate} - 1) + ${checklists.windowStart}
      end)`;
  const endLocal = sql`(${localDate} + ${checklists.windowEnd})`;
  return passOf(startLocal, endLocal, at);
}

/**
 * Проход, начинающийся СЕГОДНЯ. У обычного окна это тот же проход, что заканчивается
 * сегодня; у окна через полночь — следующий, вечерний: в 23:00 открыт именно он, и
 * статус «сейчас» обязан говорить о нём, а не о вчерашнем вечере.
 */
export function windowPassStartingToday(at: Date): WindowPass {
  const localDate = sql`${localNowSql(at)}::date`;
  const startLocal = sql`(${localDate} + ${checklists.windowStart})`;
  const endLocal = sql`(case
        when ${checklists.windowStart} <= ${checklists.windowEnd}
          then ${localDate} + ${checklists.windowEnd}
        else (${localDate} + 1) + ${checklists.windowEnd}
      end)`;
  return passOf(startLocal, endLocal, at);
}

/** Заполнение попало в этот проход окна: между открытием и закрытием. */
export function submittedInPass(pass: WindowPass): SQL[] {
  return [
    sql`(${submissions.submittedAt} at time zone ${timezoneNames.name}) >= ${pass.startLocal}`,
    sql`(${submissions.submittedAt} at time zone ${timezoneNames.name}) < ${pass.endLocal}`,
  ];
}

/**
 * Режим смены прохода. Берётся за те сутки, в которых проход НАЧАЛСЯ: чек-лист ждали от
 * той смены, которая его и открыла, а не от той, что пришла после полуночи (D055).
 */
export function passShiftModeSql(pass: WindowPass): SQL<ShiftMode | null> {
  return sql<ShiftMode | null>`(
      select ${storeShiftModes.mode}
      from ${storeShiftModes}
      where ${storeShiftModes.storeId} = ${stores.id}
        and ${storeShiftModes.localDate} = ${pass.startLocal}::date
      order by ${storeShiftModes.setAt} desc
      limit 1
    )`;
}
