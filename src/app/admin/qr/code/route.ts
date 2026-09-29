import { listStations } from "@/blocks/catalog";
import { canSee } from "@/blocks/auth/access";
import { requireAdmin } from "@/blocks/auth/guard";
import { parseStationRef, type SearchParams } from "@/blocks/qr/ui/view";

/**
 * Код станции для планшета. Экран опрашивает этот адрес и, увидев новый код,
 * перерисовывает себя — иначе после перевыпуска (D006) на планшете висел бы
 * мёртвый QR до тех пор, пока кто-нибудь не подойдёт и не обновит страницу руками.
 *
 * `requireAdmin()` зовётся здесь сам: обработчик выполняется мимо разметки, и охрана
 * `src/app/admin/layout.tsx` его не закрывает (проверяется `e2e/admin-guard.spec.ts`).
 *
 * Наружу отдаётся только код своей станции и время его выпуска — ни списка станций,
 * ни чего-либо о пиццерии.
 */
export async function GET(request: Request): Promise<Response> {
  const viewer = await requireAdmin();

  const params: SearchParams = Object.fromEntries(
    new URL(request.url).searchParams,
  );
  const ref = parseStationRef(params);
  if (ref === null) {
    return Response.json({ error: "badRequest" }, { status: 400 });
  }

  // Чужая пиццерия отвечает тем же, что и несуществующая (D145).
  if (!(await canSee(viewer, "store", ref.storeId))) {
    return Response.json({ error: "notFound" }, { status: 404 });
  }

  const stations = await listStations(ref.storeId);
  const station = stations.find((candidate) => candidate.id === ref.stationId);
  if (station === undefined) {
    return Response.json({ error: "notFound" }, { status: 404 });
  }

  return Response.json(
    { code: station.code, issuedAt: station.codeIssuedAt.toISOString() },
    // Ответ живёт ровно один опрос: закэшированный код — это ровно тот мёртвый QR,
    // ради которого всё и затевалось.
    { headers: { "cache-control": "no-store" } },
  );
}
