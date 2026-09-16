"use server";

import { markRound } from "../rounds";
import type { RoundOutcome } from "../rounds";

/**
 * Приём отметки обхода. Серверное действие по той же причине, что и приём заполнения:
 * оно уходит POST-запросом на тот же адрес `/s/<код станции>`, а `page.tsx` и `route.ts`
 * в одном сегменте Next иметь не даёт.
 *
 * Тело действия вызывает кто угодно, а не только наш экран: всё, что приходит,
 * проверяется на границе внутри `markRound`, здесь проверок нет намеренно — иначе их
 * было бы две в разных местах и они бы разъехались.
 */
export async function markRoundAction(input: unknown): Promise<RoundOutcome> {
  return await markRound(input, new Date());
}
