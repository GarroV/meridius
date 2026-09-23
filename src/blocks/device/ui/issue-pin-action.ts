"use server";

// Выпуск пина из кабинета: действие экрана чек-листа.
import { requireAdmin } from "@/blocks/auth/guard";

import { isUuid } from "../devices";
import { issuePairingPin } from "../pairing";
import { PIN_TTL_SECONDS } from "../pin";

const SECONDS_IN_MINUTE = 60;

/** Чем кончился выпуск: код с его сроком или отказ, который экран покажет словами. */
export type IssuePinOutcome =
  | {
      readonly kind: "issued";
      readonly code: string;
      /** Сколько минут живёт код — для подписи под ним; считается здесь, склоняется на экране. */
      readonly minutes: number;
    }
  | { readonly kind: "broken" };

/**
 * Выпускает пин для станции чек-листа.
 *
 * Станция приезжает ПРИВЯЗАННЫМ аргументом (`bind` на сервере), а не полем формы:
 * так её значение не проходит через браузер и подменить его нельзя. Проверка вида
 * всё равно стоит — действие вызывает кто угодно, а не только наша кнопка, и
 * значение не того вида уронило бы запрос ошибкой типа вместо внятного отказа.
 *
 * Охрана кабинета — первой строкой: тело действия идёт мимо разметки `/admin`,
 * и без неё выпуск пина был бы публичным.
 */
export async function issuePinAction(
  stationId: string,
): Promise<IssuePinOutcome> {
  await requireAdmin();

  if (typeof stationId !== "string" || !isUuid(stationId)) {
    return { kind: "broken" };
  }

  const pin = await issuePairingPin(stationId, new Date());

  return {
    kind: "issued",
    code: pin.code,
    minutes: PIN_TTL_SECONDS / SECONDS_IN_MINUTE,
  };
}
