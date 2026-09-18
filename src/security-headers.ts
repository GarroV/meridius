// Заголовки безопасности продукта в одном месте: их ставят двое — `next.config.ts`
// на всё приложение и `src/proxy.ts` на публичный маршрут заполнения. Два списка
// в двух файлах разъехались бы молча, и разъехались бы именно там, где это дороже
// всего: на единственном адресе, открытом интернету.

// Префикс публичного маршрута реэкспортируется, а не объявляется: один факт живёт в
// `core/public-routes` (T120). Реэкспорт оставлен ради потребителя `src/proxy.ts` —
// переучивать его на второй источник в этой задаче незачем.
// Путь ОТНОСИТЕЛЬНЫЙ, и это не небрежность: `next.config.ts` импортирует этот файл как
// `./src/security-headers`, то есть исполняется вне TS-алиасов, и `@/…` отсюда не
// резолвится — сборка падает с «Cannot find module». Поймано прогоном при T120.
export { PUBLIC_FILL_PREFIX } from "./blocks/core/public-routes";

export interface PolicyOptions {
  /**
   * Одноразовый ключ запроса. Задан — политика строгая: инлайновые скрипты
   * разрешены только с этим ключом. Не задан — политика прежняя, с `'unsafe-inline'`.
   */
  readonly nonce?: string | undefined;
  readonly isDevelopment: boolean;
}

/**
 * Политика подобрана прогоном на настоящем браузере (`e2e/security-headers.spec.ts`),
 * а не по памяти.
 *
 * **Про `script-src`.** Next кладёт полезную нагрузку RSC инлайновым `<script>`,
 * поэтому без `'unsafe-inline'` приложение не работает — а с ним политика не мешает
 * ни одному чужому скрипту, который дотянется до разметки. Строгий вариант — ключ
 * на запрос: Next видит его в заголовке запроса и проставляет своим скриптам.
 * `'strict-dynamic'` рядом с ключом нужен потому, что бутстрап догружает остальные
 * файлы уже сам; в браузерах, знающих CSP 3, он заодно отменяет `'self'` и любые
 * списки доменов — то есть «свой домен» перестаёт быть пропуском.
 *
 * Ключ выдаётся только там, где его есть кому выдать: `proxy.ts` включён на `/admin/*`
 * и на публичном `/s/*`. На остальных адресах политика остаётся прежней — это
 * сознательный компромисс, а не забывчивость: ослабление касается страниц, которые
 * из интернета не открываются.
 *
 * **Про остальное.** `style-src 'unsafe-inline'` оставлен: атрибут `style` у React
 * встречается на каждом втором экране (ширина шкалы, отметка выполненного пункта),
 * и политика, которая ломает следующий же экран, будет снята целиком, а не ослаблена.
 * `img-src data:` нужен QR-кодам и той самой отметке. `font-src 'self'` — шрифты
 * раздаёт само приложение (T064), сторонний домен не нужен.
 */
function contentSecurityPolicy(options: PolicyOptions): string {
  const { nonce, isDevelopment } = options;

  // В разработке Next собирает страницы на лету: горячая замена ходит по вебсокету
  // и выполняет код через eval. Продакшен-сборке ни то, ни другое не нужно.
  const scriptSource =
    nonce === undefined
      ? `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ""}`
      : `script-src 'nonce-${nonce}' 'strict-dynamic'${isDevelopment ? " 'unsafe-eval'" : ""}`;

  return [
    "default-src 'self'",
    scriptSource,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src 'self'${isDevelopment ? " ws:" : ""}`,
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
  ].join("; ");
}

export interface SecurityHeader {
  readonly key: string;
  readonly value: string;
}

export function securityHeaders(options: PolicyOptions): SecurityHeader[] {
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(options) },
    // То же, что frame-ancestors, для браузеров, которые его не знают. Публичный
    // маршрут заполнения открыт по ссылке из QR — во фрейме его быть не должно нигде.
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    // Камера в продукте не нужна: QR-наклейку читает камера телефона снаружи браузера,
    // а не страница. Геолокацию не спрашиваем вовсе — это решение продукта (D003),
    // и заголовок делает его правилом браузера, а не обещанием кода.
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=()",
    },
  ];
}

/**
 * Одноразовый ключ из политики, какой её получила разметка.
 *
 * Зачем читать обратно то, что сами и написали. На публичном маршруте заполнения
 * политика строгая (`script-src 'nonce-…' 'strict-dynamic'`), а разметке нужно
 * поставить свой инлайновый скрипт — тот, что довключает тёмную тему до первой
 * отрисовки. Ключ выдаётся на запрос и живёт только в его заголовках; `src/proxy.ts`
 * кладёт политику и в заголовки ЗАПРОСА, поэтому разметка достаёт ключ оттуда.
 *
 * Ключа нет — значит, маршрут идёт под общей политикой из `next.config.ts`, где
 * инлайновые скрипты разрешены `'unsafe-inline'`, и атрибут не нужен вовсе.
 */
export function nonceFromPolicy(
  policy: string | null | undefined,
): string | undefined {
  if (policy === null || policy === undefined) return undefined;
  const found = /script-src [^;]*'nonce-([^']+)'/.exec(policy);
  return found === null ? undefined : found[1];
}
