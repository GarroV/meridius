// Языки продукта: русский и английский (D009). Третий добавляется словарём, не кодом.
const LOCALES = ["ru", "en"] as const;

export type Locale = (typeof LOCALES)[number];

// По умолчанию английский: продукт международного направления, демо тоже английское.
export const DEFAULT_LOCALE: Locale = "en";

const DEFAULT_QUALITY = 1;

function isSupported(tag: string): tag is Locale {
  return (LOCALES as readonly string[]).includes(tag);
}

/**
 * Язык продукта из строки, которую вернул next-intl. Он отвечает обычной строкой, а
 * словари и `<html lang>` работают с нашим типом. Приведение живёт здесь, а не
 * утверждением типа на месте: чужая строка иначе доехала бы до индексации словаря и
 * обернулась бы `undefined` вместо текста — молча.
 */
export function asLocale(tag: string): Locale {
  return isSupported(tag) ? tag : DEFAULT_LOCALE;
}

function parseQuality(parameter: string | undefined): number {
  if (parameter === undefined) return DEFAULT_QUALITY;
  const match = /^q=(?<value>[\d.]+)$/.exec(parameter.trim());
  if (match?.groups === undefined) return DEFAULT_QUALITY;
  const value = Number(match.groups["value"]);
  return Number.isFinite(value) ? value : DEFAULT_QUALITY;
}

/**
 * Выбирает язык страницы по заголовку `Accept-Language` браузера.
 * Ни cookie, ни входа: сотрудник на кухне не настраивает язык, он его уже настроил в телефоне.
 * Неизвестный или пустой заголовок — язык по умолчанию.
 */
export function pickLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;

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

  // Цикл, а не find: сужение типа через isSupported не переносится на свойство объекта.
  for (const entry of ranked) {
    if (isSupported(entry.language)) return entry.language;
  }
  return DEFAULT_LOCALE;
}
