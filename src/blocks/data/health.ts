// Жива ли база — вопрос проверки здоровья контейнера (`/healthz`).
//
// Отдельной функцией, а не `getDb()` в маршруте: в базу ходит только блок data (границы
// модулей), и «жив» здесь значит ровно одно — запрос дошёл до сервера и вернулся.
import { sql } from "drizzle-orm";

import { getDb } from "./client";

/** Один круг до базы. Бросает то же, что бросил бы драйвер: причину решает вызывающий. */
export async function pingDatabase(): Promise<void> {
  await getDb().execute(sql`select 1`);
}
