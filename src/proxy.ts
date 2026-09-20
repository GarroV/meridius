import { NextResponse, type NextRequest } from "next/server";

import { sessionSecret } from "@/blocks/auth/config";
import { PUBLIC_FILL_ROOT } from "@/blocks/core/public-routes";
import {
  FILL_STATION_CODE_HEADER,
  stationCodeFromPath,
} from "@/blocks/fill/params";
import { PUBLIC_FILL_PREFIX, securityHeaders } from "@/security-headers";
import { LOGIN_PATH } from "@/blocks/auth/routes";
import { SESSION_COOKIE_NAME, readSessionToken } from "@/blocks/auth/session";

/**
 * Первая преграда перед админкой: отказ выдаётся до того, как что-либо отрендерится.
 *
 * Почему одной охраны в `src/app/admin/layout.tsx` мало: разметка и страница рендерятся
 * параллельно, поэтому `redirect()` из разметки не отменяет рендер страницы — при запросе
 * клиентской навигации (заголовок `RSC`) её содержимое уезжало в теле ответа вместе с
 * редиректом. Найдено ревью безопасности, закрыто здесь, проверяется `e2e/admin-guard.spec.ts`.
 *
 * Охрана в разметке при этом остаётся: два независимых рубежа лучше одного,
 * и второй продолжает работать, даже если этот файл когда-нибудь потеряют.
 */
export const config = {
  // Админка — ради охраны выше. Публичный маршрут заполнения — ради одноразового ключа
  // в политике безопасности: выдать ключ на запрос больше некому (T071). О входе этот
  // маршрут по-прежнему не знает и ни одной куки не читает — ветка для него первая
  // и заканчивается раньше, чем начинается что-либо про сессию.
  matcher: ["/admin/:path*", "/s/:path*"],
};

const NONCE_BYTES = 16;

/** Одноразовый ключ запроса: случайный, свой на каждый ответ. */
function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
  return btoa(String.fromCharCode(...bytes));
}

/**
 * Публичный маршрут заполнения: политика безопасности с одноразовым ключом.
 *
 * Ключ кладётся и в заголовок ЗАПРОСА, и в заголовок ответа. В запрос — потому что
 * оттуда его читает сам Next и проставляет своим инлайновым скриптам; без этого
 * строгая политика отбила бы полезную нагрузку RSC и страница осталась бы мёртвой.
 * В ответ — потому что политику применяет браузер.
 *
 * Заголовки этого маршрута ставятся здесь целиком, а не поверх общих из `next.config.ts`:
 * там `/s/*` из источника исключён нарочно. Два заголовка политики на одном ответе
 * браузер применяет пересечением, и понять, что именно сработало, было бы гаданием.
 */
function publicFillResponse(
  request: NextRequest,
  pathname: string,
): NextResponse {
  const nonce = createNonce();
  const isDevelopment = process.env.NODE_ENV === "development";
  const headers = securityHeaders({ nonce, isDevelopment });

  const requestHeaders = new Headers(request.headers);
  for (const header of headers) requestHeaders.set(header.key, header.value);

  // Код станции для корневой разметки: язык ДОКУМЕНТА этой поверхности принадлежит
  // пиццерии (D122), а знает её только база — сюда посреднику хода нет. Поэтому
  // посредник называет код, а язык по нему считает сама разметка (`fill/document.ts`).
  // Прежде здесь ехал готовый язык, посчитанный из `Accept-Language`, и это и был
  // дефект T270: документ объявлял язык телефона поверх текста на языке пиццерии.
  //
  // `set`/`delete`, а не `append`: значение клиента здесь всегда затирается своим —
  // иначе заголовок с чужого адреса доехал бы до разметки как наш.
  const stationCode = stationCodeFromPath(pathname);
  if (stationCode === null) requestHeaders.delete(FILL_STATION_CODE_HEADER);
  else requestHeaders.set(FILL_STATION_CODE_HEADER, stationCode);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  for (const header of headers) response.headers.set(header.key, header.value);
  return response;
}

export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  // Первым делом и без единого обращения к сессии: публичный маршрут о входе не знает.
  if (pathname.startsWith(PUBLIC_FILL_PREFIX))
    return publicFillResponse(request, pathname);

  // Обрезанная ссылка станции (`/s/` браузер приводит к `/s`) — тоже публичная сторона,
  // а не кабинет: человек с кухни обязан увидеть «такого адреса нет», а не пароль
  // админки, которого у него нет и не должно быть (T187). Ответ идёт обычным путём, то
  // есть под общей политикой заголовков из `next.config.ts`: одноразовый ключ здесь
  // некому тратить — страницы заполнения на этом адресе нет, а два заголовка политики на
  // одном ответе браузер применил бы пересечением, и разбирать потом было бы нечего.
  if (pathname === PUBLIC_FILL_ROOT) return NextResponse.next();

  // Форма входа — единственный адрес под /admin, доступный без сессии.
  if (pathname === LOGIN_PATH || pathname.startsWith(`${LOGIN_PATH}/`)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  // Без секрета подписи проверить куку нечем: падаем, а не пускаем.
  const session =
    token === undefined
      ? null
      : readSessionToken(token, sessionSecret(), new Date());

  if (session !== null) return NextResponse.next();

  const target = request.nextUrl.clone();
  target.pathname = LOGIN_PATH;
  // Запрошенный адрес в ссылку на вход не переносим: возвращать по параметру некуда,
  // а открытый редирект — это ровно та дыра, которую такой параметр обычно и приносит.
  target.search = "";

  return NextResponse.redirect(target, 307);
}
