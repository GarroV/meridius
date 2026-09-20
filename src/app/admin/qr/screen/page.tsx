import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { requireAdmin } from "@/blocks/auth/guard";
import { buildScreenModel } from "@/blocks/qr/ui/build-model";
import { publicBasePath } from "@/blocks/qr/sticker-origin";
import { scanOrigin } from "@/blocks/qr/ui/origin";
import { StationScreen } from "@/blocks/qr/ui/StationScreen";
import { parseStationRef, type SearchParams } from "@/blocks/qr/ui/view";

/**
 * Полноэкранный QR станции — то, что открывают на планшете и оставляют висеть.
 * Станции нет или она из другой пиццерии — 404, а не чужой код на весь экран.
 */
export default async function QrStationScreenPage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  await requireAdmin();

  const ref = parseStationRef(await searchParams);
  if (ref === null) notFound();

  const requestHeaders = await headers();
  const model = await buildScreenModel(ref, {
    origin: scanOrigin(requestHeaders, process.env),
    basePath: publicBasePath(process.env),
    acceptLanguage: requestHeaders.get("accept-language"),
  });
  if (model === null) notFound();

  return <StationScreen model={model} />;
}
