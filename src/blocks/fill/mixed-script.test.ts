// Сторож T122 (issue #33): смешение алфавитов внутри одного слова словаря интерфейса.
//
// Найдено 11.09 блоком editor в src/messages/ru.json: ключ `fill.left` хранил
// «осталcя» — латинская «c» (U+0063) вместо кириллической «с» (U+0441), однобайтовые
// двойники, неотличимые глазом. Строка настоящего экрана заполнения: её видит
// сотрудник на кухне. Симптом тихий — выглядит правильно, полнотекстовый поиск по
// слову её не находит, экранный диктор прочтёт иначе, в ленте такая запись не
// склеится с остальными по слову.
//
// Правка — один символ; проверка — на класс дефекта, а не на этот случай. Свежий урок
// проекта: проверка, подтверждённая единственной порчей, два года считалась
// доказанной, а ловила только её (см. отрицательный прогон ниже).
//
// Единица проверки — не строка целиком и не отдельный символ, а СЛОВО: максимальный
// непрерывный пробег буквенных символов (\p{L}+). Смешением считается пробег, где
// встретились буквы обеих азбук — направление (латиница внутри кириллицы или
// кириллица внутри латиницы) роли не играет, это один и тот же дефект.
//
// Законные вкрапления вроде «QR-коды», «MERIDIUS», «Dodo» в русских строках отделены
// от кириллицы дефисом, пробелом, апострофом или границей строки — то есть это уже
// два разных буквенных пробега, и проверка их не трогает: она смотрит внутрь одного
// пробега, а не на сосуществование азбук в одной строке или в одном словаре.
import { describe, expect, test } from "vitest";

import en from "@/messages/en.json";
import ru from "@/messages/ru.json";

type Catalog = Record<string, unknown>;

const LETTER_RUN = /\p{L}+/gu;
const HAS_LATIN = /[A-Za-z]/;
const HAS_CYRILLIC = /[Ѐ-ӿ]/; // U+0400–U+04FF: кириллица, включая ё и историч. буквы.

/** Все строковые значения каталога вместе с путём до ключа — для внятного сообщения. */
function stringsOf(node: unknown, at = ""): [string, string][] {
  if (typeof node === "string") return [[at, node]];
  if (node === null || typeof node !== "object") return [];

  const found: [string, string][] = [];
  for (const [name, value] of Object.entries(node as Catalog)) {
    found.push(...stringsOf(value, at === "" ? name : `${at}.${name}`));
  }
  return found;
}

/** Слова строки, где в одном непрерывном буквенном пробеге встретились обе азбуки. */
function mixedScriptWords(text: string): string[] {
  const hits: string[] = [];
  LETTER_RUN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = LETTER_RUN.exec(text))) {
    const word = match[0];
    if (HAS_LATIN.test(word) && HAS_CYRILLIC.test(word)) hits.push(word);
  }
  return hits;
}

const CATALOGS = [
  ["ru", ru as Catalog],
  ["en", en as Catalog],
] as const;

describe("смешение алфавитов в словарях (T122, issue #33)", () => {
  test("ни в одном слове ru.json и en.json латиница не встроена в кириллицу и наоборот", () => {
    const wrong: string[] = [];

    for (const [language, catalog] of CATALOGS) {
      for (const [where, value] of stringsOf(catalog)) {
        for (const word of mixedScriptWords(value)) {
          wrong.push(`${language}:${where} → «${word}» внутри «${value}»`);
        }
      }
    }

    expect(wrong).toEqual([]);
  });

  test("сторож видит настоящий словарь, а не пустой объект", () => {
    // Без этого выше просто нечему было бы упасть: пустой обход проходит любую проверку.
    for (const [language, catalog] of CATALOGS) {
      expect(stringsOf(catalog).length, `каталог ${language}`).toBeGreaterThan(
        100,
      );
    }
  });
});

// Отрицательный прогон: проверка одной находки два года ничего не доказывает про
// класс. Ниже — порчи разных видов (обе азбуки, обе стороны, самые частые буквы),
// и рядом — законные строки, которые проверка обязана пропустить, не приняв
// сосуществование алфавитов в одной строке за смешение внутри слова.
describe("отрицательный прогон: класс дефекта, а не случай", () => {
  test("реальная находка: латинская «c» внутри «осталcя»", () => {
    expect(mixedScriptWords("осталcя")).toEqual(["осталcя"]);
  });

  test("зеркальный случай того же класса: кириллица внутри английского слова", () => {
    // U+0435 CYRILLIC SMALL LETTER IE вместо латинской 'e' в "reset".
    const corrupted = "rеset";
    expect(corrupted).not.toBe("reset"); // подмена действительно произошла, не опечатка теста
    expect(mixedScriptWords(corrupted)).toEqual([corrupted]);
  });

  test("гомоглиф-подмена ловится для каждой из ходовых кириллических букв", () => {
    // Кириллица → однобайтовый латинский двойник, по одной букве за раз: это ровно
    // класс настоящей находки (кириллическая «с» ↔ латинская «c»), только на разных
    // буквах пары. Слово держит букву-цель хотя бы один раз — иначе тест ничего не
    // проверял бы, кроме собственной опечатки.
    const swaps: [word: string, cyrillic: string, latinLookalike: string][] = [
      ["система", "с", "c"],
      ["лента", "е", "e"],
      ["открыто", "о", "o"],
      ["правило", "р", "p"],
      ["заполнено", "а", "a"],
      ["плохой", "х", "x"],
      ["минута", "у", "y"],
    ];

    for (const [word, cyrillic, latin] of swaps) {
      expect(word.includes(cyrillic), `«${word}» содержит «${cyrillic}»`).toBe(
        true,
      );
      const corrupted = word.replace(cyrillic, latin);
      expect(corrupted, "подмена действительно изменила строку").not.toBe(word);
      expect(mixedScriptWords(corrupted), corrupted).toEqual([corrupted]);
    }
  });

  test("законные вкрапления бренда и аббревиатур — не порча", () => {
    const legit = [
      "QR-коды",
      "Откройте QR-код станции",
      "MERIDIUS",
      "Бренд MERIDIUS вошёл в шапку",
      "Dodo",
      "Сеть Dodo растёт",
      "A4 · станций: 5",
      "Wi-Fi", // латинское слово целиком, кириллицы рядом в этом же пробеге нет
    ];
    for (const text of legit) {
      expect(mixedScriptWords(text), text).toEqual([]);
    }
  });

  test("дефис и апостроф — граница слова: склейка через них не считается смешением", () => {
    expect(mixedScriptWords("iPhone'а")).toEqual([]);
    expect(mixedScriptWords("QR-код")).toEqual([]);
    expect(mixedScriptWords("что-то-MERIDIUS-ещё")).toEqual([]);
  });

  test("плейсхолдеры ICU (plural/count) не задевают соседнюю кириллицу", () => {
    const icu =
      "{count, plural, one {осталось # пункт} few {осталось # пункта} other {осталось # пункта}}";
    expect(mixedScriptWords(icu)).toEqual([]);
  });

  test("пределы класса: целиком не тот алфавит проверка не ловит — это другой дефект", () => {
    // Слово, ошибочно оставленное на не том языке ("checklist" вместо "чек-лист"),
    // не смешивает азбуки внутри одного буквенного пробега — оно целиком в одном
    // алфавите. Это дефект перевода/полноты словаря, не этот класс. Фиксируется явно,
    // чтобы не выдавать проверку за более широкую, чем она есть (см. отчёт блока).
    expect(mixedScriptWords("checklist")).toEqual([]);
  });
});
