import { headers } from "next/headers";

import { canSee } from "@/blocks/auth/access";
import { requireAdmin } from "@/blocks/auth/guard";
import { listStations } from "@/blocks/catalog";
import { publicBasePath } from "@/blocks/qr/sticker-origin";
import { stationStickerSvg } from "@/blocks/qr/svg";
import { scanOrigin } from "@/blocks/qr/ui/origin";
import { parseStationRef, type SearchParams } from "@/blocks/qr/ui/view";

/**
 * Наклейка станции файлом. Показать код на экране мало: его нужно отдать в печать, вложить
 * в инструкцию, отправить управляющему — для этого нужен файл, а не картинка на странице.
 *
 * Формат — SVG, то есть вектор: наклейку печатают и 30 мм на полке, и во весь лист на дверь
 * холодильника, а растровая картинка на втором размере рассыпается, и код перестаёт читаться
 * камерой. Ровно та же геометрия, что на экране и на печатном листе — один код станции,
 * а не три разных.
 *
 * `requireAdmin()` зовётся здесь сам: обработчик выполняется мимо разметки, и охрана
 * `src/app/admin/layout.tsx` его не закрывает (проверяется `e2e/admin-guard.spec.ts`).
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

  // Имя файла: станция и код. Пробелы и всё, что путает файловые системы и оболочки,
  // заменяется дефисом — файл уходит человеку и живёт дальше своей жизнью, в том числе
  // в командной строке и в письмах.
  const readableName = `qr-${station.name}-${station.code}.svg`.replace(
    /[\s"'\\/:*?<>|]+/g,
    "-",
  );

  const origin = scanOrigin(await headers(), process.env);
  const svg = stationStickerSvg(
    station.code,
    origin,
    publicBasePath(process.env),
  );

  return new Response(svg, {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      // Имя файла в двух видах: ASCII по коду станции — для программ, которые
      // `filename*` не понимают, и полное имя со станцией — для всех остальных.
      // Без ASCII-варианта такие программы сохраняют файл под именем маршрута.
      "content-disposition": `attachment; filename="qr-${station.code}.svg"; filename*=UTF-8''${encodeURIComponent(readableName)}`,
      // Код станции перевыпускается (D006), и закэшированный файл — это ровно тот
      // мёртвый QR, ради которого перевыпуск и нужен.
      "cache-control": "no-store",
    },
  });
}
