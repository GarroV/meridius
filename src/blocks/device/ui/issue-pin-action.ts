"use server";

// Выпуск пина из кабинета: действие карточки станции и панели раздела «Устройства».
import { canSee } from "@/blocks/auth/access";
import { requireAdmin } from "@/blocks/auth/guard";

import { isUuid } from "../devices";
import { classifyIssueFailure, type IssueFailure } from "../issue-failure";
import { issuePairingPin } from "../pairing";
import { PIN_TTL_SECONDS } from "../pin";
import { checkIssueAllowed } from "../rate-limit";

const SECONDS_IN_MINUTE = 60;

/** Чем кончился выпуск: код с его сроком или отказ, который экран покажет словами. */
export type IssuePinOutcome =
  | {
      readonly kind: "issued";
      readonly code: string;
      /** Сколько минут живёт код — для подписи под ним; считается здесь, склоняется на экране. */
      readonly minutes: number;
      /** Когда код перестанет работать — для обратного отсчёта рядом с ним. ISO-строкой. */
      readonly expiresAt: string;
    }
  /**
   * Отказ с причиной (#162): экран говорит «попробуйте через минуту» только там, где
   * повтор помогает, а не на любую ошибку базы.
   */
  | { readonly kind: "failed"; readonly reason: IssueFailure }
  /**
   * Эта учётка выпустила слишком много кодов подряд (#144). Бюджет свой, а не общий с
   * вводом на `/pair`: перебор на планшетной странице выпуск в кабинете не запирает.
   */
  | { readonly kind: "tooOften"; readonly minutes: number };

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
 *
 * Сбой базы не бросается дальше, а разбирается: брошенное исключение клиент видит
 * одной и той же строкой, и отсутствующая таблица на стенде выглядела как «попробуйте
 * ещё раз» (#162). Подробности уходят в журнал сервера — экрану нужна только причина.
 */
export async function issuePinAction(
  stationId: string,
): Promise<IssuePinOutcome> {
  const viewer = await requireAdmin();

  if (typeof stationId !== "string" || !isUuid(stationId)) {
    return { kind: "failed", reason: "broken" };
  }
  // Чужая станция — тот же отказ, что и станция не того вида (D145): код не выпускается.
  if (!(await canSee(viewer, "station", stationId))) {
    return { kind: "failed", reason: "broken" };
  }

  try {
    const now = new Date();
    // Учётка — из подписанной сессии, подделать её нельзя. У УК из окружения площадки
    // строки учётки нет, и её счёт ведётся по логину.
    const verdict = await checkIssueAllowed(
      viewer.accountId ?? `login:${viewer.login}`,
      now,
    );
    if (!verdict.allowed) {
      return {
        kind: "tooOften",
        minutes: Math.max(
          1,
          Math.ceil(verdict.retryAfterSeconds / SECONDS_IN_MINUTE),
        ),
      };
    }
    const pin = await issuePairingPin(stationId, now);
    return {
      kind: "issued",
      code: pin.code,
      minutes: PIN_TTL_SECONDS / SECONDS_IN_MINUTE,
      expiresAt: pin.expiresAt.toISOString(),
    };
  } catch (error) {
    const reason = classifyIssueFailure(error);
    console.error(
      `Привязка планшета: код для станции ${stationId} не выпущен (${reason})`,
      error,
    );
    return { kind: "failed", reason };
  }
}
