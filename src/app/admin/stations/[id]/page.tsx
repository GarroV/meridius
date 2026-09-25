import { notFound } from "next/navigation";
import type { ReactElement } from "react";

import { StationScreen } from "@/blocks/stations/ui/StationScreen";

/**
 * Карточка станции. Подтверждение отвязки живёт в адресе (`?confirm=<id>`), как и в
 * разделе устройств: вопрос переживает перезагрузку, а ссылку на него можно прислать.
 */
export default async function StationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactElement> {
  const { id } = await params;
  const { confirm } = await searchParams;

  const screen = await StationScreen({
    stationId: id,
    confirmUnlink: typeof confirm === "string" ? confirm : undefined,
  });

  // Станции с таким id нет — обычная 404 продукта, а не пустая карточка: пустая
  // выглядит как «станция есть, но ничего про неё не известно», и это неправда.
  if (screen === null) notFound();

  return screen;
}
