import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactElement } from "react";

import { requireAdmin } from "@/blocks/auth/guard";
import { redirectPath } from "@/blocks/core/base-path";
import { publicBasePath } from "@/blocks/qr/sticker-origin";
import { scanOrigin } from "@/blocks/qr/ui/origin";
import { StickerSheetScreen } from "@/blocks/stations/ui/StickerSheetScreen";
import { STATION_IDS_PARAM, STICKERS_PATH } from "@/blocks/stations/ui/view";

/**
 * Лист наклеек на станции, отмеченные галочками в колонке (T311). Выбор приходит в
 * адресе (`?stationIds=…&stationIds=…`), а не в состоянии экрана: лист переживает
 * перезагрузку, а ссылку на него можно отправить тому, кто стоит у принтера.
 */
export default async function StationStickersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactElement> {
  await requireAdmin();

  const params = await searchParams;
  const raw = params[STATION_IDS_PARAM];
  const stationIds = raw === undefined ? [] : [raw].flat();

  // Форма выбора общая с раскаткой, и GET уносит в адрес всё её содержимое: шаблон и
  // служебное поле серверного действия React. Ссылку на лист отправляют тому, кто стоит
  // у принтера, поэтому лишнее снимается одним перенаправлением на чистый адрес.
  if (Object.keys(params).some((key) => key !== STATION_IDS_PARAM)) {
    const clean = new URLSearchParams(
      stationIds.map((id) => [STATION_IDS_PARAM, id]),
    );
    redirect(redirectPath(`${STICKERS_PATH}?${clean.toString()}`));
  }
  const requestHeaders = await headers();

  return (
    <StickerSheetScreen
      stationIds={stationIds}
      origin={scanOrigin(requestHeaders, process.env)}
      basePath={publicBasePath(process.env)}
      acceptLanguage={requestHeaders.get("accept-language")}
    />
  );
}
