import { getTranslations } from "next-intl/server";

import { enterDemo } from "@/blocks/auth/demo-entry";
import { ADMIN_HOME_PATH } from "@/blocks/auth/routes";
import { redirectPath } from "@/blocks/core/base-path";
import { DEMO_PATH } from "@/blocks/core/demo";

// Вход в демо выбранной ролью (D194). Обработчик маршрута, а не серверное действие: сессионную
// куку ставит `setSessionCookie`, а он вынесен из `actions.ts` — всё, что экспортирует файл
// «use server», браузер вправе вызвать. Решение — в `auth/demo-entry.ts`, здесь только ответ.
export const dynamic = "force-dynamic";

const SEE_OTHER = 303;
const SERVICE_UNAVAILABLE = 503;
const FORBIDDEN = 403;
const NOT_FOUND = 404;
const RETRY_AFTER_SECONDS = "30";

function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        ch
      ] ?? ch,
  );
}

/** Страница «демо готовится»: без стилей и скриптов — под любой политикой заголовков. */
async function preparingPage(): Promise<Response> {
  const t = await getTranslations("demo");
  const html =
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>${escapeHtml(t("preparingTitle"))}</title>` +
    `<main style="font-family:system-ui,sans-serif;max-width:32rem;margin:20vh auto;padding:0 1rem">` +
    `<h1>${escapeHtml(t("preparingTitle"))}</h1><p>${escapeHtml(t("preparingText"))}</p>` +
    `<p><a href="${escapeHtml(redirectPath(DEMO_PATH))}">${escapeHtml(t("preparingRetry"))}</a></p></main>`;
  return new Response(html, {
    status: SERVICE_UNAVAILABLE,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "retry-after": RETRY_AFTER_SECONDS,
    },
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ role: string }> },
): Promise<Response> {
  const { role } = await context.params;
  const outcome = await enterDemo({
    roleKey: role,
    origin: request.headers.get("origin"),
    host: request.headers.get("host"),
    forwardedHost: request.headers.get("x-forwarded-host"),
  });

  switch (outcome.kind) {
    case "not-found":
      return new Response("Not Found", { status: NOT_FOUND });
    case "foreign-origin": {
      const t = await getTranslations("demo");
      return new Response(t("foreignOrigin"), {
        status: FORBIDDEN,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }
    case "preparing":
      return preparingPage();
    case "entered":
      // Относительный адрес: за прокси свой адрес сервер знает неверно.
      return new Response(null, {
        status: SEE_OTHER,
        headers: { location: redirectPath(ADMIN_HOME_PATH) },
      });
  }
}
