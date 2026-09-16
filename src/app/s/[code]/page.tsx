import type { Metadata } from "next";

import { CHECKLIST_PARAM } from "@/blocks/fill/params";
import { FillScreen } from "@/blocks/fill/ui/FillScreen";

/**
 * Единственный адрес продукта, открытый интернету: `/s/<код станции>` — тот самый,
 * что печатается внутри QR-наклейки (`stationScanUrl` блока `qr`). Наклейка живёт
 * годами, поэтому путь менять нельзя, и совпадение проверяется сквозным сценарием.
 *
 * Экран сам ходит за данными и сам решает, что показать: чек-лист, отказ по коду
 * или «сейчас заполнять нечего». Странице собирать нечего.
 */

// Отказ по неизвестному коду отдаётся с обычным кодом ответа и такой же страницей,
// как всё остальное: разный код ответа сам по себе рассказал бы перебору, какой
// код существует, а какой нет.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "MERIDIUS",
  // Публичная ссылка не должна попадать в поисковую выдачу.
  robots: { index: false, follow: false },
};

export default async function StationFillPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ code: string }>;
  /**
   * `?c=<id>` — какой из открытых сейчас чек-листов станции показать. Параметр
   * появляется только после выбора на самой странице; повторённый или чужой
   * идентификатор экран отбрасывает сам и снова показывает выбор.
   */
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { code } = await params;
  const chosen = (await searchParams)[CHECKLIST_PARAM];
  return (
    <FillScreen
      code={code}
      checklistId={typeof chosen === "string" ? chosen : undefined}
    />
  );
}
