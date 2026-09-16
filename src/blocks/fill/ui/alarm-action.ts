"use server";

import { dropAlarm, setAlarm } from "../alarms";
import type { AlarmOutcome } from "../alarms";

/**
 * Заведение и снятие будильника. Серверные действия по той же причине, что приём
 * заполнения и отметка обхода: они уходят POST-запросом на тот же адрес `/s/<код>`,
 * а `page.tsx` и `route.ts` в одном сегменте Next не уживаются.
 *
 * Тело действия вызывает кто угодно, а не только наш экран: всё, что приходит,
 * проверяется на границе внутри `setAlarm` и `dropAlarm`. Здесь проверок нет
 * намеренно — иначе их было бы две в разных местах и они бы разъехались.
 */
export async function setAlarmAction(input: unknown): Promise<AlarmOutcome> {
  return await setAlarm(input, new Date());
}

export async function dropAlarmAction(input: unknown): Promise<AlarmOutcome> {
  return await dropAlarm(input, new Date());
}
