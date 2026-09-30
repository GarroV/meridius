import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { ReactElement } from "react";

import { PUBLIC_PAIR_PATH } from "@/blocks/core/public-routes";
import { publicBasePath } from "@/blocks/qr/sticker-origin";
import { scanOrigin } from "@/blocks/qr/ui/origin";
import { StationScreen } from "@/blocks/stations/ui/StationScreen";

/**
 * Полный адрес страницы привязки — тот, что набирают на планшете (D167: «с реальным
 * адресом»). Собирается тем же правилом, что ссылка на QR-наклейке: адрес площадки из
 * окружения или из запроса, плюс базовый путь.
 *
 * Негодный адрес площадки — не повод ронять карточку: инструкция тогда называет путь,
 * а причина уходит в журнал. Лист наклеек на том же значении откажет громко — и там
 * это верно: наклейка печатается один раз.
 */
function pairAddress(requestHeaders: Headers): string {
  try {
    const origin = scanOrigin(requestHeaders, process.env);
    return `${origin}${publicBasePath(process.env)}${PUBLIC_PAIR_PATH}`;
  } catch (error) {
    console.error(
      "Станции: адрес страницы привязки не собрался, показан путь",
      error,
    );
    return PUBLIC_PAIR_PATH;
  }
}

/**
 * Карточка станции. Вопросы — перевыпуск кода и отвязка планшета — живут в адресе
 * (`?confirm=reissue`, `?confirm=<id планшета>`): вопрос переживает перезагрузку, а
 * ссылку на него можно прислать. Неудавшаяся отвязка — `?failed=1`.
 */
export default async function StationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactElement> {
  const { id } = await params;
  const { confirm, failed } = await searchParams;

  const screen = await StationScreen({
    stationId: id,
    confirm: typeof confirm === "string" ? confirm : undefined,
    unlinkFailed: failed === "1",
    pairAddress: pairAddress(await headers()),
  });

  // Станции с таким id нет — обычная 404 продукта, а не пустая карточка: пустая
  // выглядит как «станция есть, но ничего про неё не известно», и это неправда.
  if (screen === null) notFound();

  return screen;
}
