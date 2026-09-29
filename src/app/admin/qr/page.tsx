import { redirect } from "next/navigation";

import { requireAdmin } from "@/blocks/auth/guard";
import { redirectPath } from "@/blocks/core/base-path";
import { listStations } from "@/blocks/catalog";
import { legacyQrTarget } from "@/blocks/stations/ui/legacy-routes";

/**
 * Бывший экран «QR-коды» (T312, D163). Наклейку станции печатают, скачивают и
 * перевыпускают на карточке станции, лист на несколько станций — из колонки раздела
 * «Станции». Адрес остаётся живым ради закладок и ссылок: станция из адреса ведёт на
 * её карточку, пиццерия — на лист наклеек её станций, без них — в список станций.
 *
 * Вложенные адреса (`screen`, `code`, `sticker`) остаются на месте: это экран кода на
 * планшете, его опрос и файл наклейки, на них ведёт карточка станции.
 *
 * `requireAdmin()` — первой строкой, как у любой страницы кабинета: гость уходит на
 * вход, а не узнаёт из перенаправления, что станция с таким id существует.
 */
export default async function QrPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const target = await legacyQrTarget(await searchParams, listStations);
  redirect(redirectPath(target));
}
