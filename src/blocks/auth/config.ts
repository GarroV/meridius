// Значения живут только в окружении: в git попадает лишь .env.example с именами (принципы проекта).
const HASH_VARIABLE = "ADMIN_PASSWORD_HASH";
const SECRET_VARIABLE = "SESSION_SECRET";
const DEMO_VARIABLE = "DEMO_MODE";
const DEMO_URL_VARIABLE = "DEMO_URL";

// 32 знака ≈ 192 бита при base64: подпись сессии перестаёт быть подбираемой.
const MIN_SECRET_LENGTH = 32;

// Ни одно сообщение об ошибке не печатает значение переменной: они уезжают в логи сервера
// и в текст пятисотки, а это ровно те два места, где секрету быть нельзя.
function requiredVariable(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(
      `${name}: переменная окружения не задана, вход в админку невозможен. См. .env.example`,
    );
  }
  return value;
}

/**
 * Значения из `.env.example`. Файл лежит в git, поэтому и пароль под этим хэшем, и этот
 * секрет знает всякий, кто видел репозиторий: для локальной разработки годятся, для
 * площадки — нет. Забытый в проде пример открыл бы админку любому читателю репозитория,
 * поэтому на `NODE_ENV=production` вход с ними отказывает.
 *
 * Что константы всё ещё совпадают с самим файлом, проверяет `config.test.ts`: разъехаться
 * молча они не могут.
 */
const PUBLISHED_DEV_HASH =
  "scrypt.32768.8.3.XmUdnCU87hnNNA5iIjXFew.Vhk7VwZ5pnHes93VeQcPkmaoajfjfhP1oTiQdhY7-9Y";
const PUBLISHED_DEV_SECRET =
  "local-development-only-session-secret-not-a-secret";

function rejectPublishedExample(
  name: string,
  value: string,
  published: string,
): string {
  if (value === published && process.env.NODE_ENV === "production") {
    throw new Error(
      `${name}: значение взято из .env.example — оно опубликовано в git и на площадке вход не открывает. Задайте своё, см. .env.example`,
    );
  }
  return value;
}

/** Хэш пароля единственного администратора. Сам пароль нигде не хранится. */
export function adminPasswordHash(): string {
  return rejectPublishedExample(
    HASH_VARIABLE,
    requiredVariable(HASH_VARIABLE),
    PUBLISHED_DEV_HASH,
  );
}

/** Секрет подписи сессионной куки. Разный на каждой площадке. */
export function sessionSecret(): string {
  const value = rejectPublishedExample(
    SECRET_VARIABLE,
    requiredVariable(SECRET_VARIABLE),
    PUBLISHED_DEV_SECRET,
  );
  if (value.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `${SECRET_VARIABLE}: короче ${String(MIN_SECRET_LENGTH)} знаков — подпись сессии подбирается. Сгенерировать: openssl rand -base64 48`,
    );
  }
  return value;
}

/**
 * Стенд открытого демо (D194): `DEMO_MODE=1`. Включает вход `/demo` без пароля, плашку
 * «Демо» и запреты на всё, что меняет доступ или выходит наружу. Любое другое значение,
 * включая пустое и «true», — выключено: флаг, который включается случайной опечаткой в
 * `.env` прода, открыл бы кабинет всем.
 */
export function isDemoMode(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env[DEMO_VARIABLE] === "1";
}

/**
 * Адрес демо для кнопки на экране входа прода (`DEMO_URL`). Не задан или не адрес
 * http(s) — null, и кнопки нет: `javascript:` и прочее в `href` не попадает никогда.
 */
export function demoUrl(
  env: Record<string, string | undefined> = process.env,
): string | null {
  const raw = (env[DEMO_URL_VARIABLE] ?? "").trim();
  if (raw === "") return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}
