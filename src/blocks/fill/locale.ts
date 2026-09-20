// Язык публичного экрана заполнения. Цепочка: язык пиццерии → язык устройства → запасной.
//
// Порядок именно такой по решению владельца D122: «дефолт - тот язык что задали для
// пиццерии. отбивки и сервисные сообщения также должны быть на этом языке». То есть язык
// этой поверхности принадлежит пиццерии, а не телефону: чек-лист, отказы, предупреждения
// и служебные надписи идут на языке, который завела пиццерия. Раньше цепочка была
// обратной (телефон → страна → русский), и сотрудник в казахстанской пиццерии с
// английским телефоном получал английский экран там, где пиццерия завела русский.
//
// Язык устройства из цепочки не выброшен, но ушёл на вторую роль: интерфейс он больше
// не выбирает, а тексты самого чек-листа — да. Методист мог завести пункт только на одном
// языке; когда на языке пиццерии его нет, показывается тот, что есть, и телефон решает,
// какой из оставшихся ближе человеку.
//
// Почему не `pickLocale` блока core, который уже разбирает `Accept-Language`: он отвечает
// одним языком и на «телефон просит английский», и на «телефон просит язык, которого
// у нас нет». Здесь эти два случая надо различать: во втором телефон не сказал ничего,
// и подставлять за него язык продукта нельзя — он встал бы перед языком пиццерии.
// Поэтому здесь своя функция, отвечающая `null` на «ничего из нашего не просили»,
// а сам вопрос «продукт говорит на этом языке?» задаётся core: здесь стоял свой список
// языков, написанный буквами, и он молча не знал бы про третий язык (T268, issue #133).
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/blocks/core/locale";

/**
 * Последнее звено цепочки — язык продукта, а не второе умолчание рядом с ним.
 *
 * Оно срабатывает только там, где пиццерии нет вовсе: код с наклейки не работает или
 * предел частоты сработал раньше похода в базу. Языка, который «задала пиццерия»
 * (D122), в этом случае не существует, и брать его неоткуда.
 *
 * Раньше здесь стоял русский — «пилот идёт в русскоязычной сети». Этой сети в продукте
 * больше нет: владелец убрал из данных Россию и русскую пиццерию (D083, «у нас весь
 * интерфейс сейчас на инглише»), а второе умолчание давало ровно тот разъезд, о котором
 * заведён #129 — чек-лист и вход по-английски, а «этот код не работает» по-русски, то
 * есть на языке, которого человек с телефоном на третьем языке скорее всего не знает,
 * и ровно в тот миг, когда ему надо понять, что делать дальше.
 *
 * Поэтому значение не написано буквой, а взято из языка продукта: два умолчания в
 * одном продукте разъезжаются молча, одно — не может.
 */
export const FILL_LAST_RESORT_LOCALE: Locale = DEFAULT_LOCALE;

const DEFAULT_QUALITY = 1;

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
    if (isLocale(entry.language)) return entry.language;
  }
  return null;
}

/**
 * Цепочка языков экрана по убыванию предпочтения, без повторов и всегда непустая.
 *
 * Первый элемент — язык интерфейса, и это язык пиццерии, когда она известна (D122).
 * Вся цепочка нужна текстам самого чек-листа: методист мог завести пункт только на одном
 * языке, и тогда показать надо то, что есть, в том же порядке предпочтения, а не
 * «первое попавшееся из словаря».
 *
 * Ни входа, ни cookie: сотрудник на кухне язык не выбирает (D001). Но и телефон его
 * больше не выбирает — выбрала пиццерия.
 */
export function pickFillLocales(
  acceptLanguage: string | null | undefined,
  countryLocale: string | null | undefined,
): readonly Locale[] {
  const candidates: (Locale | null)[] = [
    isLocale(countryLocale) ? countryLocale : null,
    deviceLocale(acceptLanguage),
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
