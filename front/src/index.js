// Фронт meridius на Cloudflare — как у Decimus (decimus D236): копия его Worker'а.
//
// В стране пользователя домен sslip.io заблокирован по решению властей, а
// адрес Cloudflare — нет. Worker принимает запрос на своём адресе и пересылает
// его на сервер как есть; ответ возвращает как есть. Своей логики у него нет.
//
// Три правки по дороге, и все три — чтобы сервер не заметил посредника:
//  1. Origin/Referer со своего адреса переписываются на адрес сервера — иначе
//     кабинет отбивал бы каждое серверное действие как пришедшее с чужого сайта. Чужой
//     Origin уходит нетронутым и получает тот же отказ, что и без фронта.
//  2. Адрес посетителя уходит отдельным заголовком вместе с ключом фронта.
//     Вход площадки (Caddy) верит этому адресу ТОЛЬКО при верном ключе — иначе
//     любой мог бы назваться чужим адресом, а счётчик неудачных входов считает
//     попытки по адресу.
//  3. Location с адресом сервера переписывается на адрес фронта, чтобы
//     переход не уводил человека обратно на заблокированный домен.
//
// До сервера Worker идёт туннелем (привязка EDGE — Workers VPC, decimus D304):
// запрос попадает прямо в Caddy на VPS, и имя sslip.io в пути больше не
// участвует — ни его DNS, ни его доступность. Имя остаётся только SNI и Host,
// по которым Caddy выбирает сайт. Если туннель лёг, тот же запрос уходит
// прежним путём через интернет: два независимых пути вместо одной точки отказа.

// Только у демо-Worker'а (`wrangler.demo.jsonc`: RESET_PAGE = "1"): раз в час демо
// пересаживается (`deploy/demo/reset.sh` гасит приложение), и минуту источник отвечает
// 502/503/504 или не отвечает вовсе. Вместо голой ошибки браузеру уходит страница
// «демо обновляется» с автообновлением. Прод-Worker переменной не имеет и отдаёт
// ответ источника как есть.
const RESETTING_STATUSES = [502, 503, 504];
const RESET_RETRY_SECONDS = 20;
const RESET_TEXT = {
  en: {
    title: "Demo is resetting",
    body: "Demo is resetting, back in a minute. This page refreshes itself.",
  },
  ru: {
    title: "Демо обновляется",
    body: "Демо обновляется, через минуту вернётся. Страница обновится сама.",
  },
};

/** Язык страницы: выбор человека (кука продукта), затем язык браузера, затем английский. */
function resetLanguage(request) {
  const cookie = /(?:^|;\s*)NEXT_LOCALE=(ru|en)\b/.exec(
    request.headers.get("Cookie") || "",
  );
  if (cookie) return cookie[1];
  const accept = (request.headers.get("Accept-Language") || "").toLowerCase();
  return accept.trim().startsWith("ru") ? "ru" : "en";
}

/** Человек в браузере, а не скрипт: страницу получает только тот, кто просил HTML. */
function wantsPage(request) {
  return (
    ["GET", "HEAD"].includes(request.method) &&
    (request.headers.get("Accept") || "").includes("text/html")
  );
}

function resetPage(request) {
  const lang = resetLanguage(request);
  const text = RESET_TEXT[lang];
  const html = `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="${RESET_RETRY_SECONDS}">
<title>${text.title}</title>
<style>
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f7f9fb;color:#1b2028;font:16px/1.5 system-ui,sans-serif}
main{max-width:420px;padding:24px;text-align:center}
h1{margin:0 0 8px;font-size:22px}
p{margin:0;color:#5c6672}
</style>
</head>
<body>
<main><h1>${text.title}</h1><p>${text.body}</p></main>
</body>
</html>
`;
  return new Response(request.method === "HEAD" ? null : html, {
    status: 503,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Retry-After": String(RESET_RETRY_SECONDS),
    },
  });
}

const FRONT_KEY_HEADER = "X-Meridius-Front-Key";
const CLIENT_IP_HEADER = "X-Meridius-Client-IP";

export default {
  async fetch(request, env) {
    if (!env.ORIGIN_HOST || !env.FRONT_KEY) {
      // Без настроек не пересылаем вовсе: запрос без ключа выглядел бы на
      // сервере прямым, и счётчик входов свалил бы всех в один адрес.
      return new Response("front is not configured", { status: 503 });
    }
    const front = new URL(request.url);
    const origin = `https://${env.ORIGIN_HOST}`;
    // Хост сервера закреплён, а не собран из пути: `new URL("//evil.com/x", origin)`
    // читает путь как адрес другого сайта, и запрос ушёл бы туда вместе с
    // ключом фронта. Путь только присваивается, итог сверяется ещё раз.
    const upstream = new URL(origin);
    upstream.pathname = front.pathname.replace(/^\/+/, "/");
    upstream.search = front.search;
    if (upstream.origin !== origin) {
      return new Response("bad request", { status: 400 });
    }

    const headers = new Headers(request.headers);
    for (const name of ["Origin", "Referer"]) {
      const value = headers.get(name);
      if (
        value &&
        (value === front.origin || value.startsWith(front.origin + "/"))
      ) {
        headers.set(name, origin + value.slice(front.origin.length));
      }
    }
    headers.set(FRONT_KEY_HEADER, env.FRONT_KEY);
    headers.set(
      CLIENT_IP_HEADER,
      request.headers.get("CF-Connecting-IP") || "",
    );
    headers.delete("Host");

    const hasBody = !["GET", "HEAD"].includes(request.method);
    const fallback = env.EDGE && hasBody ? request.clone() : request;
    const send = (via, from) =>
      via(upstream, {
        method: request.method,
        headers,
        body: hasBody ? from.body : undefined,
        redirect: "manual",
      });
    let response;
    if (env.EDGE) {
      try {
        response = await send((u, init) => env.EDGE.fetch(u, init), request);
      } catch (error) {
        console.error(
          "tunnel failed, falling back to public path",
          String(error),
        );
      }
    }
    const isResetPage = env.RESET_PAGE === "1" && wantsPage(request);
    if (!response) {
      try {
        response = await send(fetch, fallback);
      } catch (error) {
        // Источник не ответил вовсе (приложение погашено): демо-страница вместо ошибки Worker'а.
        if (!isResetPage) throw error;
        console.error("origin unreachable", String(error));
        return resetPage(request);
      }
    }
    if (isResetPage && RESETTING_STATUSES.includes(response.status)) {
      return resetPage(request);
    }

    const location = response.headers.get("Location");
    if (!location || !location.startsWith(origin)) {
      return response;
    }
    const rewritten = new Response(response.body, response);
    rewritten.headers.set(
      "Location",
      front.origin + location.slice(origin.length),
    );
    return rewritten;
  },
};
