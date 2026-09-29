import { redirect } from "next/navigation";

import { requireAdmin } from "@/blocks/auth/guard";
import { redirectPath } from "@/blocks/core/base-path";
import { legacyStationTarget } from "@/blocks/stations/ui/legacy-routes";

/**
 * Бывший экран «Устройства» (T312, D163). Привязанный планшет — свойство станции, а не
 * отдельная сущность: его привязывают и отвязывают на карточке станции. Адрес остаётся
 * живым ради закладок и ссылок: `?station=<id>` ведёт на карточку этой станции, без
 * станции — в список станций.
 *
 * `requireAdmin()` — первой строкой, как у любой страницы кабинета.
 */
export default async function DevicesPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  redirect(redirectPath(legacyStationTarget(await searchParams)));
}
