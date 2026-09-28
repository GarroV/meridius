import { headers } from "next/headers";

import { requireAdmin } from "@/blocks/auth/guard";
import { PUBLIC_PAIR_PATH } from "@/blocks/core/public-routes";
import {
  findStationTablets,
  listStationTablets,
} from "@/blocks/device/station-tablets";
import { DevicesScreen } from "@/blocks/device/ui/DevicesScreen";
import { publicBasePath } from "@/blocks/qr/sticker-origin";
import { scanOrigin } from "@/blocks/qr/ui/origin";

type SearchParams = Record<string, string | string[] | undefined>;

const STATION = "station";
const CONFIRM = "confirm";
const FAILED = "failed";

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Полный адрес страницы привязки — тот, что набирают на планшете (D163: «с реальным
 * адресом»). Собирается тем же правилом, что ссылка на QR-наклейке: адрес площадки из
 * окружения или из запроса, плюс базовый путь. Страница собирает его здесь, в `app`,
 * потому что блок `device` на `qr` ссылаться не может (`.dependency-cruiser.cjs`).
 *
 * Негодный адрес площадки — не повод ронять раздел: инструкция тогда называет путь, а
 * причина уходит в журнал. Лист QR на том же значении откажет громко — и там это верно:
 * наклейка печатается один раз.
 */
function pairAddress(requestHeaders: Headers): string {
  try {
    const origin = scanOrigin(requestHeaders, process.env);
    return `${origin}${publicBasePath(process.env)}${PUBLIC_PAIR_PATH}`;
  } catch (error) {
    console.error(
      "Устройства: адрес страницы привязки не собрался, показан путь",
      error,
    );
    return PUBLIC_PAIR_PATH;
  }
}

/**
 * Экран «Устройства» кабинета (T297, D163): станции сети с их планшетами и выдвижная
 * панель станции (`?station=<id>`).
 *
 * `requireAdmin()` зовётся здесь, а не только в разметке `src/app/admin/layout.tsx`:
 * разметка и страница рендерятся параллельно, поэтому без этой строки страница успела
 * бы сходить в базу до того, как охрана уведёт гостя на вход (тот же приём, что у
 * `src/app/admin/qr/page.tsx`).
 */
export const dynamic = "force-dynamic";

export default async function DevicesPage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  await requireAdmin();

  const params = await searchParams;
  const stationId = single(params[STATION]);
  const [stations, selected] = await Promise.all([
    listStationTablets(),
    stationId === undefined ? undefined : findStationTablets(stationId),
  ]);

  return (
    <DevicesScreen
      stations={stations}
      selected={selected}
      confirmId={single(params[CONFIRM]) ?? null}
      failed={single(params[FAILED]) === "1"}
      pairAddress={pairAddress(await headers())}
      now={new Date()}
    />
  );
}
