"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { isLocale, LOCALE_COOKIE } from "../locale";

// Год: выбор языка — не сессия. Человек выбирает его один раз и не ожидает, что кабинет
// однажды снова заговорит по-английски, потому что кука протухла.
const CHOICE_LIFETIME_SECONDS = 60 * 60 * 24 * 365;

/**
 * Запоминает выбранный язык кабинета.
 *
 * Действие серверное и вызывается формой, а не скриптом: переключатель обязан работать
 * без JavaScript — ровно как боковое меню рядом с ним, которое ради этого же не стало
 * выезжающей шторкой.
 *
 * Чужая метка отбрасывается молча и намеренно: форму отправляет кто угодно чем угодно,
 * а показывать человеку отказ на кнопке языка не за что — прежний язык просто остаётся.
 *
 * `httpOnly` у этой куки нет: язык не секрет, и разметке он виден и так.
 */
export async function chooseLocale(formData: FormData): Promise<void> {
  const chosen = formData.get("locale");
  if (typeof chosen !== "string" || !isLocale(chosen)) return;

  (await cookies()).set(LOCALE_COOKIE, chosen, {
    path: "/",
    maxAge: CHOICE_LIFETIME_SECONDS,
    sameSite: "lax",
  });
  // Язык решается при отрисовке на сервере, то есть закэшированная разметка осталась бы
  // на прежнем языке — целиком, включая меню, откуда её и переключили.
  revalidatePath("/", "layout");
}
