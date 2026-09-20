import { headers } from "next/headers";

import { requireAdmin } from "@/blocks/auth/guard";
import { buildQrModel } from "@/blocks/qr/ui/build-model";
import { publicBasePath } from "@/blocks/qr/sticker-origin";
import { scanOrigin } from "@/blocks/qr/ui/origin";
import { QrSheetScreen } from "@/blocks/qr/ui/QrSheetScreen";
import { parseQrView, type SearchParams } from "@/blocks/qr/ui/view";

/**
 * Экран QR-кодов станций: лист A4 для печати наклеек и карточка планшета.
 *
 * `requireAdmin()` зовётся здесь, а не только в разметке `src/app/admin/layout.tsx`:
 * разметка и страница рендерятся параллельно, поэтому без этой строки страница успела
 * бы сходить в базу до того, как охрана уведёт гостя на вход.
 */
export default async function QrPage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  await requireAdmin();

  const view = parseQrView(await searchParams);
  const requestHeaders = await headers();
  const model = await buildQrModel(view, {
    origin: scanOrigin(requestHeaders, process.env),
    basePath: publicBasePath(process.env),
    // Язык устройства методиста — не ответ о языке листа, а только последнее звено
    // цепочки для случая «пиццерия не выбрана» (T273, `core/store-locale.ts`).
    acceptLanguage: requestHeaders.get("accept-language"),
  });

  return <QrSheetScreen model={model} />;
}
