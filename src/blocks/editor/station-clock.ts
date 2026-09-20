// Часы пиццерии, к станции которой привязан чек-лист: «сколько сейчас на той кухне».
//
// Время берётся у ПИЦЦЕРИИ, а не у браузера методиста, и это не придирка: методист
// сидит в другом городе (а в сети — и в другой стране), и «сейчас» у него и у кухни
// разное ровно на разницу поясов. Предупреждение о закрытом окне, посчитанное по
// часам методиста, называло бы не тот час — то есть врало бы именно в том случае,
// ради которого оно и завелось.
//
// Считает время PostgreSQL из `stores.timezone` (D026). Второго календаря в
// JavaScript продукт не заводит: два способа посчитать местное время расходятся на
// переводе часов и расходятся молча.
import { eq, sql } from "drizzle-orm";

import { checklists, getDb, stations, stores } from "@/blocks/data";

import { isUuid } from "./validation";
import type { WindowValue } from "./window-field";
import type { ClosedWindow } from "./window-visibility";
import { closedWindowNotice } from "./window-visibility";

/**
 * Местное время пиццерии «ЧЧ:ММ» — выражение для выборки, в которой уже соединён
 * `stores`. Одно на весь блок: та же строка, написанная во второй раз, — это второе
 * определение того, что значит «сейчас в пиццерии».
 *
 * Без станции (левое соединение не нашло пиццерию) приходит `null`: часов у чек-листа
 * без станции нет, и выдумывать их нельзя.
 */
export const STATION_LOCAL_TIME = sql<
  string | null
>`to_char(now() at time zone ${stores.timezone}, 'HH24:MI')`;

/**
 * Местное время пиццерии этого чек-листа — свежее, на миг вызова.
 *
 * Отдельный запрос, а не значение, привезённое с отрисовки экрана: между открытием
 * редактора и нажатием «Опубликовать» проходят минуты, и именно в них живёт случай
 * T275 — страница нарисована в 10:50 (окно 06:00–11:00 ещё идёт), а публикация
 * случилась в 11:30, когда окно уже закрылось.
 */
async function stationLocalTime(checklistId: string): Promise<string | null> {
  if (!isUuid(checklistId)) return null;

  const rows = await getDb()
    .select({ localTime: STATION_LOCAL_TIME })
    .from(checklists)
    .innerJoin(stations, eq(checklists.stationId, stations.id))
    .innerJoin(stores, eq(stations.storeId, stores.id))
    .where(eq(checklists.id, checklistId))
    .limit(1);

  return rows[0]?.localTime ?? null;
}

/**
 * Закрыто ли окно чек-листа прямо сейчас — по часам его пиццерии.
 *
 * `null` означает «сказать нечего»: окно открыто, станции нет или время непонятно.
 * Отличать эти случаи друг от друга экрану после публикации незачем — говорить он
 * должен ровно тогда, когда версия опубликована в закрытое окно.
 */
export async function closedWindowNow(
  checklistId: string,
  window: WindowValue,
): Promise<ClosedWindow | null> {
  const localTime = await stationLocalTime(checklistId);
  if (localTime === null) return null;

  return closedWindowNotice(window, localTime);
}
