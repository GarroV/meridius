"use server";

import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

import { PUBLIC_STATION_PATH } from "@/blocks/core/public-routes";

import { pairTablet } from "../pair";

const MINUTE_SECONDS = 60;

/** Что показать в форме. Успех сюда не доходит: он уводит на вкладку. */
export interface PairRefusal {
  readonly notice: string;
}

/**
 * Ввод пина на планшете. Серверное действие, а не обработчик маршрута: `page.tsx` и
 * `route.ts` в одном сегменте Next иметь не даёт, а адрес `/pair` набирают руками — он
 * должен остаться коротким.
 *
 * Успех уводит на вкладку прямо отсюда, а не возвратом в форму: куку выставляет тот же
 * ответ, и переход по нему уже несёт её. Возврат «привязано» заставил бы браузер решать
 * это вторым шагом, а между шагами планшет успевает уснуть.
 */
export async function pairAction(input: unknown): Promise<PairRefusal> {
  const outcome = await pairTablet(input, new Date());
  // Без `redirectPath`: внутри серверного действия базовый путь площадки приставляет
  // сам клиентский роутер, и приставленный вручную дал бы `/qr/qr/station` (D045).
  if (outcome.kind === "paired") redirect(PUBLIC_STATION_PATH);

  // Текст отказа собирается здесь, а не в форме: склонение минут («через 2 минуты»)
  // решает словарь языка устройства, а он есть у сервера. Отдавать форме число значило
  // бы уносить в браузер ещё и правила склонения.
  const t = await getTranslations("device.pair");
  if (outcome.kind === "tooOften") {
    return {
      notice: t("tooOften", {
        minutes: Math.max(
          1,
          Math.ceil(outcome.retryAfterSeconds / MINUTE_SECONDS),
        ),
      }),
    };
  }
  // «Истёк», «неверен» и «уже съеден» — один и тот же текст: разные рассказали бы
  // подбору, какой код существует.
  return { notice: outcome.kind === "refused" ? t("refused") : t("broken") };
}
