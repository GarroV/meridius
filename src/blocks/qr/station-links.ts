// Список ссылок станций, который печатает импорт пакета сразу после заливки.
//
// Живёт здесь, а не в самом скрипте, по двум причинам. Первая: это единственное
// место, где человек видит ссылку станции ГЛАЗАМИ — по нему раскладывают
// напечатанные наклейки, и ошибка здесь не ловится ничем, кроме похода на кухню.
// Вторая: скрипт импорта — `.mjs` вне графа блоков, и покрыть его проверками
// нечем; чистая функция рядом с самой ссылкой покрывается обычным тестом.

import { DEFAULT_LOCALE, LOCALES } from "@/blocks/core/locale";

import { stationScanUrl } from "./scan-url";

/** Имя станции в пакете: по локали, вторым языком английский. */
type LocalizedName = Readonly<Record<string, string | undefined>>;

interface PacketStation {
  readonly key: string;
  readonly name: LocalizedName;
}

interface StationLink {
  readonly name: string;
  readonly url: string;
}

interface StationLinkInput {
  readonly stations: readonly PacketStation[];
  /** Локаль страны пакета: на этом языке станция подписана в базе и на экране. */
  readonly locale: string;
  readonly origin: string;
  /** Базовый путь площадки: продукт бывает опубликован не на корне адреса (D045). */
  readonly basePath: string;
  readonly codeFor: (key: string) => string;
}

/**
 * Имя станции на языке страны, с запасными вариантами.
 *
 * Русское имя всегда брать нельзя: страна показа английская, в базе и на экране
 * имя английское, а человек раскладывал бы наклейки по русскому — и сотрудник
 * увидел бы на экране другое название той же станции.
 */
function stationName(name: LocalizedName, locale: string): string {
  // Порядок: язык страны, язык продукта, остальные языки продукта. Раньше он был написан
  // буквами (`name["en"] ?? name["ru"]`) — то есть третий язык не стал бы даже запасным,
  // и станция, названная только на нём, ушла бы на наклейку без имени (T268).
  for (const tag of [locale, DEFAULT_LOCALE, ...LOCALES]) {
    const value = name[tag];
    if (value !== undefined) return value;
  }
  return "";
}

/**
 * Строки «имя станции → ссылка внутри её наклейки».
 *
 * Базовый путь площадки обязателен: без него напечатанная ссылка ведёт в 502 на
 * площадке, опубликованной не на корне, — и выглядит при этом совершенно
 * убедительно.
 */
export function stationLinkLines(input: StationLinkInput): StationLink[] {
  return input.stations.map((station) => ({
    name: stationName(station.name, input.locale),
    url: stationScanUrl(
      input.origin,
      input.codeFor(station.key),
      input.basePath,
    ),
  }));
}
