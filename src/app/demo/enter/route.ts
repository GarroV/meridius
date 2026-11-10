import { loadViewer } from "@/blocks/auth/accounts";
import { sessionSecret } from "@/blocks/auth/config";
import { ADMIN_HOME_PATH } from "@/blocks/auth/routes";
import { setSessionCookie } from "@/blocks/auth/session-cookie";
import { redirectPath } from "@/blocks/core/base-path";
import { DEMO_PATH, isDemoMode } from "@/blocks/core/demo-mode";
import { findDemoRole } from "@/blocks/demo";

// Вход выбором роли (D193): ставит сессию демо-учётки и ведёт в кабинет. Без DEMO_MODE=1 — 404.
export const dynamic = "force-dynamic";

const SEE_OTHER = 303;
const NOT_FOUND = 404;
const BAD_REQUEST = 400;
const UNAVAILABLE = 503;

/** Перенаправление относительным адресом: за прокси свой адрес сервер знает неверно. */
function goTo(location: string): Response {
  return new Response(null, { status: SEE_OTHER, headers: { location } });
}

export async function POST(request: Request): Promise<Response> {
  if (!isDemoMode()) return new Response(null, { status: NOT_FOUND });

  const form = await request.formData();
  const role = findDemoRole(form.get("role"));
  if (role === undefined) return new Response(null, { status: BAD_REQUEST });

  const issuedAt = new Date();
  // Учётки нет — посев не запускали: честный отказ вместо куки, которая ни во что не ведёт.
  const viewer = await loadViewer({ subject: role.accountId, issuedAt });
  if (viewer === null) {
    return new Response(
      "Demo accounts are not seeded: run `npm run seed:demo`",
      { status: UNAVAILABLE },
    );
  }

  await setSessionCookie(role.accountId, sessionSecret(), issuedAt);
  return goTo(redirectPath(ADMIN_HOME_PATH));
}

/** Адрес только для POST; GET ведёт на экран выбора, а не отвечает 405 посетителю. */
export function GET(): Response {
  if (!isDemoMode()) return new Response(null, { status: NOT_FOUND });
  return goTo(redirectPath(DEMO_PATH));
}
