// Язык экрана заполнения. Цепочка: язык устройства → язык страны пиццерии → русский.
//
// Почему не `pickLocale` блока core, который уже разбирает `Accept-Language`: он отвечает
// одним языком и на «телефон просит английский», и на «телефон просит язык, которого
// у нас нет» — обе ситуации дают язык продукта по умолчанию. Экрану заполнения эти два
// случая надо различать: во втором вместо умолчания подставляется язык страны, где стоит
// пиццерия (казахский телефон в Казахстане должен получить русский, а не английский).
// Поэтому здесь своя функция, отвечающая `null` на «ничего из нашего не просили»,
// а список поддержанных языков и их тип по-прежнему берутся из core.
import type { Locale } from "@/blocks/core/locale";

const SUPPORTED: readonly Locale[] = ["ru", "en"];

/**
 * Последнее звено цепочки — русский, а не язык продукта по умолчанию (английский).
 * Пилот идёт в русскоязычной сети: сотрудник, чей телефон и чья страна ничего нам
 * не сказали, скорее прочитает русский.
 */
export const FILL_LAST_RESORT_LOCALE: Locale = "ru";

const DEFAULT_QUALITY = 1;

function isSupported(tag: string | null | undefined): tag is Locale {
  return typeof tag === "string" && SUPPORTED.includes(tag as Locale);
}

function parseQuality(parameter: string | undefined): number {
  if (parameter === undefined) return DEFAULT_QUALITY;
  const match = /^q=(?<value>[\d.]+)$/.exec(parameter.trim());
  if (match?.groups === undefined) return DEFAULT_QUALITY;
  const value = Number(match.groups["value"]);
  return Number.isFinite(value) ? value : DEFAULT_QUALITY;
}

/** Язык устройства, если продукт на нём говорит. Иначе `null` — не умолчание. */
function deviceLocale(
  acceptLanguage: string | null | undefined,
): Locale | null {
  if (!acceptLanguage) return null;

  const ranked = acceptLanguage
    .split(",")
    .map((entry) => {
      const [tag, ...parameters] = entry.split(";");
      return {
        language: (tag ?? "").trim().toLowerCase().split("-")[0] ?? "",
        quality: parseQuality(parameters[0]),
      };
    })
    .filter((entry) => entry.language !== "" && entry.quality > 0)
    .sort((a, b) => b.quality - a.quality);

  for (const entry of ranked) {
    if (isSupported(entry.language)) return entry.language;
  }
  return null;
}

/**
 * Цепочка языков экрана по убыванию предпочтения, без повторов и всегда непустая.
 *
 * Первый элемент — язык интерфейса. Вся цепочка нужна текстам самого чек-листа:
 * методист мог завести пункт только на одном языке, и тогда показать надо то, что есть,
 * в том же порядке предпочтения, а не «первое попавшееся из словаря».
 *
 * Ни входа, ни cookie: сотрудник на кухне язык не выбирает — он выбрал его в телефоне (D001).
 */
export function pickFillLocales(
  acceptLanguage: string | null | undefined,
  countryLocale: string | null | undefined,
): readonly Locale[] {
  const candidates: (Locale | null)[] = [
    deviceLocale(acceptLanguage),
    isSupported(countryLocale) ? countryLocale : null,
    FILL_LAST_RESORT_LOCALE,
  ];

  const chain: Locale[] = [];
  for (const candidate of candidates) {
    if (candidate !== null && !chain.includes(candidate)) chain.push(candidate);
  }
  return chain;
}

/**
 * Текст на первом языке цепочки, который у него есть. Если методист завёл пункт
 * на языке вне цепочки — показывается хоть что-нибудь: пустая строка на экране
 * сотрудника хуже строки на чужом языке.
 */
export function pickFillText(
  text: Readonly<Record<string, string>>,
  locales: readonly Locale[],
): string {
  for (const locale of locales) {
    const value = text[locale];
    if (value !== undefined && value !== "") return value;
  }
  return Object.values(text).find((value) => value !== "") ?? "";
}

/**
 * Заголовок запроса, которым публичный маршрут называет язык СВОЕГО документа.
 *
 * Ставит его `src/proxy.ts` — он и так стоит на `/s/:path*` ради одноразового ключа, —
 * а читает корневая разметка. Так у документа и у содержимого одно умолчание на двоих,
 * а не два разных: `<html lang>` знал только язык запроса и на пустом `Accept-Language`
 * откатывался к языку продукта (английскому), пока экран на том же запросе говорил
 * по-русски (последнее звено цепочки заполнения). Расхождение видит не человек, а
 * синтезатор речи и браузерный перевод — они верят атрибуту, а не буквам.
 *
 * Почему не поправить это на самом экране: корневая разметка рендерится РАНЬШЕ страницы
 * и ждать её не может (см. `core/ui/HtmlLangSync`), а `HtmlLangSync` догоняет язык лишь
 * после гидратации — в отданном документе расхождение остаётся. Встроенный браузер
 * сканера QR, с которого на этот экран и попадают, заголовок часто не шлёт вовсе.
 *
 * Подделать заголовок может и клиент: маршрутов без `proxy.ts` продукт не запрещает.
 * Ценности в этом нет — подделавший меняет язык страницы, которую сам же и смотрит, —
 * а значение всё равно принимается только из списка языков продукта.
 */
export const FILL_DOCUMENT_LOCALE_HEADER = "x-fill-document-locale";

/**
 * Язык документа публичного экрана, когда о станции ещё ничего не известно: отказ по
 * коду, предел частоты, сам `<html lang>`. Первое звено той же цепочки, что у экрана, —
 * второго правила для этого случая в продукте нет.
 */
export function fillDocumentLocale(
  acceptLanguage: string | null | undefined,
): Locale {
  return pickFillLocales(acceptLanguage, null)[0] ?? FILL_LAST_RESORT_LOCALE;
}
