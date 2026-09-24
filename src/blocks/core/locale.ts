// Языки продукта: русский и английский (D009). Третий добавляется словарём, не кодом.
//
// Список экспортируется, потому что обещание D009 держится только одним списком на
// продукт. Проверено экспериментом (T268, issue #133): с третьим языком в этом массиве
// компилятор называл ровно четыре места — и все четыре про словари. Про то, что
// публичный экран заполнения новый язык по-прежнему не выберет, что справочник стран
// его не примет, что редактор не пустит текст на нём, что ограничение базы его отвергнет
// и что в списке языков на экране справочника его не будет, компилятор молчал: там
// список был написан заново своими буквами. Перечисление языков где-либо, кроме этого
// файла, стережёт `locale.test.ts`.
export const LOCALES = ["ru", "en"] as const;

export type Locale = (typeof LOCALES)[number];

// По умолчанию английский: продукт международного направления, демо тоже английское.
export const DEFAULT_LOCALE: Locale = "en";

const DEFAULT_QUALITY = 1;

/**
 * Говорит ли продукт на этом языке. Единственная проверка на весь продукт: блоки зовут
 * её, а не сверяют строку со своим списком, — иначе третий язык заводится в стольких
 * местах, сколько их накопилось, и компилятор об этом молчит (T268).
 *
 * Принимает `null` и `undefined`, потому что зовущие берут язык из базы, заголовка или
 * формы, где его может не быть вовсе. Отдельная проверка «а это вообще строка?» на
 * каждой стороне — та же копия, только из условий.
 */
export function isLocale(tag: string | null | undefined): tag is Locale {
  return (
    typeof tag === "string" && (LOCALES as readonly string[]).includes(tag)
  );
}

/**
 * Язык продукта из строки, которую вернул next-intl. Он отвечает обычной строкой, а
 * словари и `<html lang>` работают с нашим типом. Приведение живёт здесь, а не
 * утверждением типа на месте: чужая строка иначе доехала бы до индексации словаря и
 * обернулась бы `undefined` вместо текста — молча.
 */
export function asLocale(tag: string): Locale {
  return isLocale(tag) ? tag : DEFAULT_LOCALE;
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

  // Цикл, а не find: сужение типа через isLocale не переносится на свойство объекта.
  for (const entry of ranked) {
    if (isLocale(entry.language)) return entry.language;
  }
  return DEFAULT_LOCALE;
}

/**
 * Имя куки, в которой лежит выбранный человеком язык кабинета.
 *
 * Имя взято у next-intl не из вежливости: библиотека читает эту куку сама в своих
 * встроенных маршрутах, и своё имя означало бы две правды о языке — одну нашу, другую
 * её, расходящиеся молча.
 */
export const LOCALE_COOKIE = "NEXT_LOCALE";

/**
 * Язык кабинета: выбор человека сильнее настройки браузера.
 *
 * Порядок именно такой, потому что заголовок браузера — догадка, а кука — сказанное
 * вслух. Пока выбора не было, догадка работает (кабинет сразу говорит на языке
 * системы); как только человек переключил язык, догадка замолкает навсегда.
 *
 * Чужая метка в куке не принимается: куку правит кто угодно, а значением индексируется
 * словарь — неизвестная метка дала бы страницу без единой надписи вместо отказа.
 *
 * Экрана заполнения это не касается: его язык задаёт пиццерия (D122), а не тот, кто
 * держит телефон.
 */
export function resolveLocale({
  chosen,
  acceptLanguage,
}: {
  readonly chosen: string | null | undefined;
  readonly acceptLanguage: string | null | undefined;
}): Locale {
  return isLocale(chosen) ? chosen : pickLocale(acceptLanguage);
}

/**
 * Как язык называет сам себя. Имена живут здесь, а не в словарях, по той же причине,
 * по которой здесь живёт `LOCALES`: список языков обязан быть один. В словарях они
 * завелись бы дважды и разошлись бы — в русском словаре английский однажды стал бы
 * «Английский», и переключатель заговорил бы на двух языках сразу.
 *
 * Имя всегда на своём языке: человек, открывший кабинет на незнакомом ему языке, ищет
 * в переключателе знакомое слово, а не перевод.
 */
export const LOCALE_NAMES: Readonly<Record<Locale, string>> = {
  ru: "Русский",
  en: "English",
};
