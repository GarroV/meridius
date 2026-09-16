import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

import { BUILD_COMMIT_VAR, headCommit } from "./src/blocks/core/build-stamp";
import { PUBLIC_FILL_PREFIX, securityHeaders } from "./src/security-headers";

// Язык определяется по заголовку браузера в src/i18n/request.ts — без маршрутов вида /ru/… и без cookie.
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// В разработке Next собирает страницы на лету: горячая замена модулей ходит по вебсокету
// и выполняет код через eval. Продакшен-сборке ни то, ни другое не нужно, и там этого нет.
const isDevelopment = process.env.NODE_ENV === "development";

// «Любой путь, кроме начинающихся с /s/». Отрицательный просмотр вперёд — единственный
// способ выразить исключение в шаблоне пути Next; сегмент берётся из общей константы,
// чтобы переезд публичного маршрута не оставил здесь забытую строку.
const EVERYTHING_EXCEPT_PUBLIC_FILL = `/:path((?!${PUBLIC_FILL_PREFIX.slice(1)}).*)`;

/**
 * Сами заголовки и обоснование каждой строки политики — в `src/security-headers.ts`.
 * Здесь только развешивание: список один и тот же, ставится в двух местах.
 */
// Площадка публикует продукт не на корне адреса, а на своём пути: у Tailscale всего три
// порта под публикацию, и корень занят соседним сервисом. Пустое значение — обычный корень,
// поэтому разработка и сквозные сценарии живут как раньше (D045).
const basePath = (process.env["BASE_PATH"] ?? "").replace(/\/$/, "");

// Коммит, из которого собран продукт, запекается в сборку (D033) и доезжает до подписи
// в подвале кабинета (T156). Считается от рабочего каталога, а не от пути этого модуля:
// конфигурацию Next собирает во временный файл, и путь от `import.meta.url` указывал бы
// внутрь `.next`. Рабочий каталог у `next dev`, `next build` и `next start` — корень копии.
//
// Пусто — не отказ: на площадке репозитория рядом может не быть вовсе, и продукт скажет
// «сборка не подписана» вместо того, чтобы выдумать коммит.
const buildCommit = headCommit(process.cwd()) ?? "";

const nextConfig: NextConfig = {
  ...(basePath === "" ? {} : { basePath }),
  env: { [BUILD_COMMIT_VAR]: buildCommit },
  typedRoutes: true,
  // Next 16 иначе кладёт в корень свои AGENTS.md и CLAUDE.md — инструкции агентам ведём мы, не сборщик.
  agentRules: false,
  // На всё приложение целиком, КРОМЕ публичного маршрута заполнения: там политику
  // ставит `src/proxy.ts`, потому что она несёт одноразовый ключ, а ключ рождается
  // на запрос и статической настройке недоступен (T071). Исключение записано здесь,
  // а не «поверх»: два заголовка Content-Security-Policy на одном ответе браузер
  // применяет пересечением, и разбираться, что именно сработало, стало бы гаданием.
  headers: () => [
    {
      source: EVERYTHING_EXCEPT_PUBLIC_FILL,
      headers: securityHeaders({ isDevelopment }),
    },
  ],
};

export default withNextIntl(nextConfig);
