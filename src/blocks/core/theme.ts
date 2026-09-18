// Тёмная тема продукта: чем она включается и где хранится выбор (D106).
//
// Значений темы здесь нет ни одного — они живут единственным экземпляром в эталоне
// (`docs/furca/design/reference/tokens.css`, блок `[data-theme="dark"]`, D013). Здесь
// только механизм: какой атрибут оказывается на `<html>` и откуда он берётся.
//
// Почему атрибут, а не медиазапрос в стилях продукта. Тёмные значения эталон объявляет
// под `[data-theme="dark"]` — единственный способ включить их медиазапросом это
// переписать все пятьдесят значений вторым блоком под `@media (prefers-color-scheme:
// dark)`. Копия разошлась бы с эталоном молча, а сверка начала бы подтверждать саму
// себя. Поэтому системную настройку читает браузер и ставит тот же атрибут.
//
// Отсюда плата, названная и проверенная: **без JavaScript автоматика не работает** —
// документ остаётся светлым. Явный выбор при этом работает и без скриптов: его ставит
// сервер из куки, ещё до первого байта разметки.

/** Атрибут на `<html>`, которым эталон включает тёмные значения. */
export const THEME_ATTRIBUTE = "data-theme";

/** Кука с выбором человека. Не секрет и ничего не открывает — только вид экрана. */
export const THEME_COOKIE_NAME = "meridius_theme";

/**
 * Выбор человека. `system` — не третья тема, а отсутствие выбора: тему называет
 * системная настройка телефона или ноутбука.
 */
export type ThemeChoice = "system" | "light" | "dark";

/** Порядок — тот же, что в переключателе: сначала автоматика, потом явные. */
export const THEME_CHOICES: readonly ThemeChoice[] = [
  "system",
  "light",
  "dark",
];

/** Год: выбор темы человек делает один раз, а не каждую смену. */
const THEME_COOKIE_MAX_AGE_SECONDS = 31_536_000;

/**
 * Приводит пришедшее снаружи значение к выбору продукта.
 *
 * Всё неизвестное — автоматика. Это не снисходительность к мусору: значение приходит
 * кукой, то есть от кого угодно, а попадает атрибутом на `<html>`. Принимать на веру
 * здесь нечего.
 */
export function asThemeChoice(value: string | null | undefined): ThemeChoice {
  return THEME_CHOICES.includes(value as ThemeChoice)
    ? (value as ThemeChoice)
    : "system";
}

/**
 * Значение атрибута для выбора. Автоматике атрибут не ставится вовсе: сервер не знает
 * системной настройки браузера и угадывать её не должен.
 */
export function resolvedTheme(
  choice: ThemeChoice,
): Exclude<ThemeChoice, "system"> | undefined {
  return choice === "system" ? undefined : choice;
}

/** Выбор из заголовка `Cookie` запроса. */
export function themeFromCookieHeader(
  header: string | null | undefined,
): ThemeChoice {
  if (header === null || header === undefined) return "system";
  for (const pair of header.split(";")) {
    const separator = pair.indexOf("=");
    if (separator < 0) continue;
    if (pair.slice(0, separator).trim() !== THEME_COOKIE_NAME) continue;
    return asThemeChoice(pair.slice(separator + 1).trim());
  }
  return "system";
}

/**
 * Строка для `document.cookie`, сохраняющая выбор.
 *
 * Возврат к автоматике стирает куку, а не сохраняет слово «system»: «выбора нет» —
 * это отсутствие записи, и понимать его в двух местах по-разному не нужно.
 *
 * `HttpOnly` здесь нет намеренно — куку пишет сам переключатель в браузере; `Secure`
 * нет потому, что стенд и кухонный телефон в сети пиццерии ходят по http, а ценности
 * в этой куке ровно на один вид экрана.
 */
export function themeCookie(choice: ThemeChoice): string {
  const common = "Path=/; SameSite=Lax";
  return choice === "system"
    ? `${THEME_COOKIE_NAME}=; ${common}; Max-Age=0`
    : `${THEME_COOKIE_NAME}=${choice}; ${common}; Max-Age=${String(THEME_COOKIE_MAX_AGE_SECONDS)}`;
}

/**
 * Скрипт, довключающий тему по системной настройке. Стоит первым в теле страницы и
 * исполняется до того, как браузер нарисует хоть что-нибудь: иначе кухонный телефон
 * в три часа ночи мигнёт белым экраном.
 *
 * Атрибут уже стоит — значит, человек выбрал тему сам, и системная настройка его
 * выбор не трогает (это и есть «переключатель перебивает автоматику», D106).
 *
 * `matchMedia` и `document` зовутся без `window.` — так же их подставляет проверка,
 * исполняя эту же строку (`theme.test.ts`). Отказ `matchMedia` гасится: скрипт стоит
 * первым, и его исключение остановило бы разбор разметки целиком.
 */
export const THEME_BOOTSTRAP_SCRIPT =
  `try{var r=document.documentElement;` +
  `if(!r.hasAttribute("${THEME_ATTRIBUTE}")&&matchMedia("(prefers-color-scheme: dark)").matches)` +
  `r.setAttribute("${THEME_ATTRIBUTE}","dark")}catch(e){}`;
