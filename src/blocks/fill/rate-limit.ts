/**
 * Ограничение частоты на публичном маршруте (D021, третья мера защиты ссылки).
 *
 * Почему свой счётчик, а не тот, что уже есть в блоке `auth`: границы модулей запрещают
 * `fill` зависеть от `auth` — публичный маршрут не имеет права знать о входе в админку
 * (правило `public-route-has-no-auth` в `.dependency-cruiser.cjs`). Считается здесь и
 * другое: у входа считаются НЕудачи (успех говорит, что пароль знают), а здесь —
 * все обращения подряд: заполнение всегда «удачно», и считать в нём нечего, кроме частоты.
 *
 * Хранилище — память процесса, как и у входа. Отсюда два честных ограничения: счётчики
 * теряются при перезапуске и не общие у нескольких экземпляров приложения. Для одного
 * экземпляра MVP этого достаточно; таблицу ради счётчика в схему не заводим — схему
 * ведёт блок `data`, и ради предела частоты её трогать дороже, чем польза.
 */

export interface RateVerdict {
  readonly allowed: boolean;
  readonly retryAfterSeconds: number;
}

export interface RateLimiterOptions {
  /** Сколько обращений в окне пропускается. */
  readonly maxHits: number;
  readonly windowSeconds: number;
  /** Потолок числа ключей в памяти: ключ приходит снаружи и подделывается. */
  readonly maxTrackedKeys: number;
}

export interface RateLimiter {
  /** Засчитать обращение и сказать, пропускать ли его. */
  hit: (key: string, now: Date) => RateVerdict;
  size: () => number;
  clearAll: () => void;
}

interface HitWindow {
  readonly startedAt: number;
  readonly hits: number;
}

const ALLOWED: RateVerdict = { allowed: true, retryAfterSeconds: 0 };
const MILLISECONDS = 1000;

/**
 * Окно фиксированное: отсчёт идёт от первого обращения, а не от последнего. Так отказ
 * гарантированно кончается в названный срок — иначе поток запросов продлевал бы
 * блокировку сотруднику, который просто пытается отправить свой чек-лист.
 */
export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  const windows = new Map<string, HitWindow>();
  const windowMs = options.windowSeconds * MILLISECONDS;

  function liveWindow(key: string, at: number): HitWindow | undefined {
    const found = windows.get(key);
    if (found === undefined) return undefined;
    if (at - found.startedAt >= windowMs) {
      windows.delete(key);
      return undefined;
    }
    return found;
  }

  function dropExpired(at: number): void {
    for (const [key, window] of windows) {
      if (at - window.startedAt >= windowMs) windows.delete(key);
    }
  }

  // Map хранит ключи в порядке первой вставки: первый ключ — самое старое окно.
  function evictOverflow(): void {
    while (windows.size > options.maxTrackedKeys) {
      const oldest = windows.keys().next().value;
      if (oldest === undefined) return;
      windows.delete(oldest);
    }
  }

  return {
    hit(key, now) {
      const at = now.getTime();
      dropExpired(at);
      const window = liveWindow(key, at);

      if (window === undefined) {
        windows.set(key, { startedAt: at, hits: 1 });
        evictOverflow();
        return ALLOWED;
      }

      if (window.hits >= options.maxHits) {
        // Счётчик не растёт: отказ не должен продлевать окно.
        return {
          allowed: false,
          retryAfterSeconds: Math.ceil(
            (window.startedAt + windowMs - at) / MILLISECONDS,
          ),
        };
      }

      windows.set(key, { startedAt: window.startedAt, hits: window.hits + 1 });
      return ALLOWED;
    },

    size() {
      return windows.size;
    },

    clearAll() {
      windows.clear();
    },
  };
}

/**
 * Числа взяты от настоящей работы кухни, а не с потолка.
 *
 * · `submitPerCode` — 10 отправок за 5 минут с одного кода. Станцию заполняют
 *   несколько раз в сутки; даже пересменка, когда чек-лист закрывают двое подряд,
 *   плюс пара повторов на слабом Wi-Fi укладываются в это с запасом. Всё, что выше, —
 *   уже не работа, а поток.
 * · `submitEveryone` — 300 за 5 минут на всю сеть: около одной отправки в секунду.
 *   Пилот — десятки станций, то есть предел на порядки выше настоящей нагрузки, и
 *   он ловит поток, размазанный по многим подобранным кодам, который предел на код
 *   не заметит.
 * · `scanPerClient` — 60 открытий экрана в минуту с одного адреса. Сотрудник сканирует
 *   наклейку раз в смену; шестьдесят — это запас на целую пиццерию за одним внешним
 *   адресом. Отдельный счёт от отправок нужен, чтобы перебор кодов не выбирал предел
 *   отправок и не запирал кухню.
 */
export const FILL_LIMITS = {
  submitPerCode: { maxHits: 10, windowSeconds: 5 * 60, maxTrackedKeys: 10_000 },
  submitEveryone: { maxHits: 300, windowSeconds: 5 * 60, maxTrackedKeys: 1 },
  scanPerClient: { maxHits: 60, windowSeconds: 60, maxTrackedKeys: 10_000 },
  // Выбор режима смены — тоже запись с публичной ссылки, и у неё свой счёт.
  // Десять на код за пять минут: менеджер ставит режим один раз за смену и может
  // передумать пару раз. Отдельный счёт от отправок нужен, чтобы перебор режимов
  // не выбирал предел отправок и не запирал кухню, и наоборот.
  shiftModePerCode: {
    maxHits: 10,
    windowSeconds: 5 * 60,
    maxTrackedKeys: 10_000,
  },
  // Отметки обходов — запись с той же публичной ссылки, но их за смену много: на
  // станции несколько периодических пунктов, и каждый час по каждому идёт касание.
  // Шестьдесят на код за пять минут — запас на самую плотную станцию; общий счёт сети
  // при этом остаётся тем же, поэтому поток с улицы упирается в него, а не в кухню.
  roundPerCode: { maxHits: 60, windowSeconds: 5 * 60, maxTrackedKeys: 10_000 },
} as const;

const EVERYONE = "все";

const submitPerCode = createRateLimiter(FILL_LIMITS.submitPerCode);
const submitEveryone = createRateLimiter(FILL_LIMITS.submitEveryone);
const scanPerClient = createRateLimiter(FILL_LIMITS.scanPerClient);
const shiftModePerCode = createRateLimiter(FILL_LIMITS.shiftModePerCode);
const roundPerCode = createRateLimiter(FILL_LIMITS.roundPerCode);

function strictest(verdicts: readonly RateVerdict[]): RateVerdict {
  const refused = verdicts.filter((verdict) => !verdict.allowed);
  if (refused.length === 0) return ALLOWED;
  return {
    allowed: false,
    retryAfterSeconds: Math.max(
      ...refused.map((verdict) => verdict.retryAfterSeconds),
    ),
  };
}

/** Пускать ли эту отправку: считается и код станции, и вся сеть сразу. */
export function checkSubmitAllowed(code: string, now: Date): RateVerdict {
  return strictest([
    submitPerCode.hit(code, now),
    submitEveryone.hit(EVERYONE, now),
  ]);
}

/** Пускать ли открытие экрана: считается адрес клиента. */
export function checkScanAllowed(client: string, now: Date): RateVerdict {
  return scanPerClient.hit(client, now);
}

/** Пускать ли выбор режима смены: считается код станции и вся сеть сразу. */
export function checkShiftModeAllowed(code: string, now: Date): RateVerdict {
  return strictest([
    shiftModePerCode.hit(code, now),
    submitEveryone.hit(EVERYONE, now),
  ]);
}

/** Пускать ли отметку обхода: считается код станции и вся сеть сразу. */
export function checkRoundAllowed(code: string, now: Date): RateVerdict {
  return strictest([
    roundPerCode.hit(code, now),
    submitEveryone.hit(EVERYONE, now),
  ]);
}

/** Полный сброс. Нужен тестам, которые делят один процесс. */
export function forgetAllFillHits(): void {
  submitPerCode.clearAll();
  submitEveryone.clearAll();
  scanPerClient.clearAll();
  shiftModePerCode.clearAll();
  roundPerCode.clearAll();
}

/** Имя переменной окружения: сколько доверенных посредников стоит перед продуктом. */
export const TRUSTED_PROXY_HOPS_VAR = "TRUSTED_PROXY_HOPS";

/** Больше десяти посредников перед продуктом — это не настройка, а опечатка. */
const MAX_TRUSTED_HOPS = 10;

/**
 * Сколько посредников объявила площадка. Не задано — ноль, и это осознанное значение
 * по умолчанию: пока никто не сказал, что перед продуктом стоит посредник, который
 * переписывает заголовок о клиенте, верить в этом заголовке нечему.
 *
 * Заданное негодно — отказ, а не тихий ноль: молча выключенный предел неотличим
 * от работающего.
 */
export function trustedProxyHops(
  env: Record<string, string | undefined>,
): number {
  const raw = env[TRUSTED_PROXY_HOPS_VAR];
  if (raw === undefined) return 0;

  const value = raw.trim();
  const usable = /^\d+$/.test(value) && Number(value) <= MAX_TRUSTED_HOPS;
  if (!usable) {
    throw new Error(
      `${TRUSTED_PROXY_HOPS_VAR}: значение не годится. Ожидается целое число от 0 до ${String(MAX_TRUSTED_HOPS)} — сколько доверенных посредников стоит перед продуктом`,
    );
  }

  return Number(value);
}

/** Из чего складывается ключ клиента для предела на открытие экрана. */
export interface ClientKeySource {
  /** Заголовок `X-Forwarded-For` как пришёл, без разбора. */
  readonly forwardedFor: string | null;
  /** Адрес соединения — если среда выполнения его даёт. */
  readonly peerAddress: string | null;
  /** Сколько доверенных посредников объявила площадка (`trustedProxyHops`). */
  readonly trustedProxyHops: number;
}

function trimmedOrNull(value: string | null): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Кто прислал запрос — ключ предела на открытие экрана.
 *
 * Заголовок `X-Forwarded-For` пишет кто угодно: клиент отправляет его сам, а посредник
 * лишь дописывает своё звено справа. Поэтому звено выбирается ПО СЧЁТУ от конца цепочки,
 * и только на столько шагов, сколько посредников объявила площадка: всё, что клиент
 * припишет слева, на выбор не влияет и нового счётчика не открывает. Посредников не
 * объявлено — заголовок не читается вовсе.
 *
 * `null` означает «различить клиентов нечем», и это НЕ повод считать всех одним ключом:
 * предел «на клиента», применённый к одному общему ключу, перестаёт быть пределом на
 * клиента и становится рубильником, который гасит всю сеть, когда на пересменке
 * сканируют одновременно. Точку записи в базу при этом прикрывают пределы отправок:
 * они считаются по коду станции и по сети целиком и от адреса не зависят вовсе.
 *
 * Про площадку. Продукт публикуется через `tailscale funnel` (D034), и передаёт ли
 * туннель адрес клиента — на площадке не проверено; среда выполнения адреса соединения
 * отдельно не даёт (Next подставляет его в тот же заголовок и только когда клиент своего
 * не прислал — отличить одно от другого нечем). Пока это не проверено и не объявлено
 * переменной `TRUSTED_PROXY_HOPS`, предел на открытие экрана не применяется, и продукт
 * говорит об этом при старте (`src/startup-checks.ts`). Что именно проверить на
 * площадке — в журнале блока `docs/forge/blocks/fill.md`.
 */
export function identifyClient(source: ClientKeySource): string | null {
  const peer = trimmedOrNull(source.peerAddress);
  if (source.trustedProxyHops <= 0) return peer;

  const chain = (source.forwardedFor ?? "")
    .split(",")
    .map((hop) => hop.trim())
    .filter((hop) => hop !== "");

  // Цепочка короче объявленного числа посредников: её писал не тот, кому мы верим.
  if (chain.length < source.trustedProxyHops) return peer;

  return chain[chain.length - source.trustedProxyHops] ?? peer;
}
