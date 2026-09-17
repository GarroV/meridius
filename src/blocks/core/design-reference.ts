// Разбор эталона дизайн-системы — чтобы сверять с ним продукт машиной, а не глазом.
//
// Токены живут одним файлом эталона (`docs/furca/design/reference/tokens.css`), и
// продукт подставляет их в вёрстку по имени. Имя подходит любое: CSS не проверяет, что
// в свойство цвета подставили цвет, — он молча отбрасывает объявление целиком. Так
// девять мест продукта просили обводку фокуса тенью (`--focus-ring` — список теней), и
// браузер девять раз рисовал фокус по умолчанию: по-разному в светлой и тёмной теме и
// не так, как задумано. На глаз это не ловится — кольцо фокуса ЕСТЬ, просто чужое.

/** Значение токена, каким оно записано в `tokens.css`. */
export type TokenValue = string;

/**
 * Значения, которые CSS примет как цвет. Именованные цвета сюда не входят намеренно:
 * в дизайн-системе их нет, а перечислять полторы сотни слов ради этого не стоит.
 */
const COLOR_PREFIXES = ["#", "rgb", "rgba", "hsl", "hsla", "color-mix("];

const DECLARATION = /(--[\w-]+)\s*:\s*([^;]+);/g;

/**
 * Разбирает объявления `--имя: значение;` из текста файла токенов.
 *
 * Группы читаются колбэком замены, а не индексами совпадения, намеренно: по типам
 * `match[1]` — `string | undefined`, и проверка на `undefined` была бы веткой, в
 * которую не попадает ни один вход, то есть вечно непокрытой. Ветка, которую нельзя
 * проверить, — не защита, а просто дыра в покрытии.
 */
export function parseTokens(css: string): ReadonlyMap<string, TokenValue> {
  const tokens = new Map<string, TokenValue>();
  // Тема задаётся дважды (светлая и тёмная), значения разные. Для проверки роли
  // важна не тема, а вид значения, поэтому побеждает последнее объявление.
  css.replace(DECLARATION, (_whole: string, name: string, value: string) => {
    tokens.set(name, value.trim());
    return "";
  });
  return tokens;
}

/**
 * Годится ли значение токена на роль цвета.
 *
 * `var(--другой)` считается цветом условно: проверить его здесь нечем, а ссылку на
 * ссылку дизайн-система не строит. Ложных срабатываний такое допущение не даёт —
 * ложные пропуски возможны, и это осознанный размен в пользу простоты.
 */
export function isColorValue(value: TokenValue): boolean {
  const trimmed = value.trim();
  if (trimmed.startsWith("var(")) return true;
  return COLOR_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
}

const OUTLINE_COLOR = /outline-\[var\((--[\w-]+)\)\]/g;

/** Имена токенов, которые вёрстка подставила в свойство цвета обводки. */
export function outlineColorTokens(source: string): readonly string[] {
  const names: string[] = [];
  source.replace(OUTLINE_COLOR, (_whole: string, name: string) => {
    names.push(name);
    return "";
  });
  return names;
}

const DISABLED_RULE = /\.btn:disabled\s*\{[^}]*opacity:\s*([\d.]+)/;
const DISABLED_CLASS = /disabled:opacity-(\d+)/g;

/**
 * Насколько эталон гасит недоступную кнопку (`.btn:disabled`) — долей единицы.
 *
 * Читается из эталона, а не переписывается числом: переписанное число расходится с
 * эталоном молча, и сверка начинает подтверждать саму себя.
 */
export function referenceDisabledOpacity(css: string): number | undefined {
  const found = DISABLED_RULE.exec(css);
  return found === null ? undefined : Number(found[1]);
}

/** Доли гашения, которые вёрстка задаёт недоступным элементам. */
export function disabledOpacities(source: string): readonly number[] {
  const values: number[] = [];
  source.replace(DISABLED_CLASS, (_whole: string, percent: string) => {
    values.push(Number(percent) / 100);
    return "";
  });
  return values;
}

const DISABLED_CURSOR_RULE = /\.btn:disabled\s*\{[^}]*cursor:\s*([\w-]+)/;
const DISABLED_CURSOR_CLASS = /disabled:cursor-([\w-]+)/g;

/** Какой курсор эталон ставит недоступной кнопке. */
export function referenceDisabledCursor(css: string): string | undefined {
  const found = DISABLED_CURSOR_RULE.exec(css);
  return found === null ? undefined : found[1];
}

/** Курсоры, которые вёрстка ставит недоступным элементам. */
export function disabledCursors(source: string): readonly string[] {
  const names: string[] = [];
  source.replace(DISABLED_CURSOR_CLASS, (_whole: string, name: string) => {
    names.push(name);
    return "";
  });
  return names;
}
