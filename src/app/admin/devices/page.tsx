import { requireAdmin } from "@/blocks/auth/guard";
import { listPairedDevices } from "@/blocks/device/devices";
import { DevicesScreen } from "@/blocks/device/ui/DevicesScreen";

type SearchParams = Record<string, string | string[] | undefined>;

const CONFIRM = "confirm";
const FAILED = "failed";

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Экран «Устройства» кабинета (T297): привязанные планшеты сети.
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

  const devices = await listPairedDevices();
  const params = await searchParams;
  const confirmId = single(params[CONFIRM]) ?? null;
  const failed = single(params[FAILED]) === "1";

  return (
    <DevicesScreen devices={devices} confirmId={confirmId} failed={failed} />
  );
}
