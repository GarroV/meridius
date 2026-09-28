import type { ReactElement } from "react";

import { StationsScreen } from "@/blocks/stations/ui/StationsScreen";

/**
 * Раздел «Станции» без выбранной станции: колонка слева (её рисует `./layout.tsx`),
 * справа — зачем раздел и раскатка шаблона. Фильтр живёт в адресе, а не в состоянии
 * экрана: ссылка на «станции без чек-листа» должна открываться уже отфильтрованной —
 * главная кабинета ведёт сюда именно так. Читает его сама колонка; странице остаётся
 * шаблон, выбранный заранее в разделе «Шаблоны».
 */
export default async function StationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactElement> {
  const { template } = await searchParams;

  return (
    <StationsScreen
      template={typeof template === "string" ? template : undefined}
    />
  );
}
