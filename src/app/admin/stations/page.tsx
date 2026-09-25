import type { ReactElement } from "react";

import { StationsScreen } from "@/blocks/stations/ui/StationsScreen";

/**
 * Раздел «Станции». Фильтр живёт в адресе, а не в состоянии экрана: ссылка на «станции
 * без чек-листа» должна открываться уже отфильтрованной — главная кабинета ведёт сюда
 * именно так, и приводить человека в общий список, где ещё искать, нельзя.
 */
export default async function StationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactElement> {
  const { gap } = await searchParams;

  return <StationsScreen gap={typeof gap === "string" ? gap : undefined} />;
}
