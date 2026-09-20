// Одно решение о языке публичного экрана на запрос — и его берут оба: документ и текст.
//
// Здесь проверяется не «функция возвращает строку», а обещание продукта: язык, который
// объявляет `<html lang>`, равен языку, на котором написано содержимое, при любом языке
// телефона. До T270 эти два языка считались в двух местах, и на приёмке волны 14 русский
// телефон получал документ `lang="ru"` поверх английского текста. Цена: экранный диктор
// читает английские слова по русским фонетическим правилам — на кухонном телефоне это
// неразборчиво, — а браузер предлагает перевести страницу на язык, на котором она уже
// написана. Проверки доступности этого не ловят: axe сверяет наличие и валидность `lang`,
// а не совпадение с языком текста.
//
// Сквозной сценарий (`e2e/page-lang.spec.ts`) смотрит на тот же факт в живом браузере —
// то есть проверяет, что решение и правда доезжает до документа. Здесь — само решение, со
// случаями, которых в браузере не воспроизвести: предел частоты и недоступная база.
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_LOCALE } from "@/blocks/core/locale";
import { countries, getDb } from "@/blocks/data";
import { createStation } from "@/blocks/data/testing/fixtures";

import { fillLanguage } from "./document";
import {
  FILL_LIMITS,
  TRUSTED_PROXY_HOPS_VAR,
  checkScanAllowed,
  forgetAllFillHits,
} from "./rate-limit";
import { stationCountryLocale } from "./station";

// Заголовки запроса, которого в модульном тесте нет: подменяем хранилище Next своим.
// Язык телефона приезжает именно оттуда, поэтому подмена — не упрощение, а то самое
// место, где начинается расхождение.
const requestHeaders = vi.hoisted(() => new Map<string, string>());

vi.mock("next/headers", () => ({
  headers: () =>
    Promise.resolve({
      get: (name: string) => requestHeaders.get(name) ?? null,
    }),
}));

// Настоящая база нужна почти везде — язык страны читается из неё, — поэтому модуль
// станции подменяется поверх подлинника и только на один случай: «база не ответила».
vi.mock("./station", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./station")>()),
  stationCountryLocale: vi.fn(
    (await importOriginal<typeof import("./station")>()).stationCountryLocale,
  ),
}));

/** Язык страны пиццерии: по нему говорит вся эта поверхность (D122). */
async function setCountryLocale(
  countryId: string,
  locale: string,
): Promise<void> {
  await getDb()
    .update(countries)
    .set({ locale })
    .where(eq(countries.id, countryId));
}

/** Станция в пиццерии, чья страна говорит на этом языке. */
async function stationSpeaking(locale: string): Promise<string> {
  const station = await createStation();
  await setCountryLocale(station.countryId, locale);
  return station.stationCode;
}

function phoneAsks(acceptLanguage: string | null): void {
  if (acceptLanguage === null) requestHeaders.delete("accept-language");
  else requestHeaders.set("accept-language", acceptLanguage);
}

beforeEach(() => {
  requestHeaders.clear();
  forgetAllFillHits();
  vi.mocked(stationCountryLocale).mockClear();
});

afterEach(() => {
  Reflect.deleteProperty(process.env, TRUSTED_PROXY_HOPS_VAR);
});

describe("язык этой поверхности принадлежит пиццерии (D122)", () => {
  it("русская пиццерия с английского телефона отвечает по-русски", async () => {
    const code = await stationSpeaking("ru");
    phoneAsks("en-GB,en;q=0.9");

    expect((await fillLanguage(code)).locale).toBe("ru");
  });

  it("и в обратную сторону: английская пиццерия с русского телефона — по-английски", async () => {
    // Именно этот случай и был замерен на приёмке: текст английский, а документ
    // объявлялся русским, потому что документ спрашивал телефон, а текст — пиццерию.
    const code = await stationSpeaking("en");
    phoneAsks("ru-RU,ru;q=0.9");

    expect((await fillLanguage(code)).locale).toBe("en");
  });

  it("телефон на третьем языке ничего не меняет: решает пиццерия", async () => {
    const code = await stationSpeaking("ru");
    phoneAsks("de-DE,de;q=0.9");

    expect((await fillLanguage(code)).locale).toBe("ru");
  });

  it("телефона не слышно вовсе — язык всё равно её", async () => {
    // Встроенный браузер сканера QR, с которого на этот экран и попадают, заголовок
    // часто не присылает. Это не повод объявлять язык продукта поверх её текста.
    const code = await stationSpeaking("ru");
    phoneAsks(null);

    expect((await fillLanguage(code)).locale).toBe("ru");
  });

  it("телефон остаётся в цепочке вторым: он выбирает тексты, которых у неё нет", async () => {
    // Методист мог завести пункт только на одном языке. Тогда показывается тот, что
    // есть, и телефон решает, какой из оставшихся ближе человеку, — но интерфейс
    // выбирает не он.
    const code = await stationSpeaking("ru");
    phoneAsks("en-GB,en;q=0.9");

    expect((await fillLanguage(code)).locales).toStrictEqual(["ru", "en"]);
  });
});

describe("где пиццерии нет — решает телефон, а за ним язык продукта", () => {
  it("по неизвестному коду отвечает язык телефона", async () => {
    // За подобранным кодом пиццерии нет никакой, и брать её язык неоткуда.
    phoneAsks("ru-RU,ru;q=0.9");

    expect((await fillLanguage("zzzzzzzzzz")).locale).toBe("ru");
  });

  it("телефон на третьем языке по неизвестному коду получает язык продукта", async () => {
    // Вторая половина #129: отказ не имеет права приходить на языке, которого человек
    // не знает, ровно тогда, когда ему надо понять, что делать дальше.
    phoneAsks("kk-KZ,kk;q=0.9");

    expect((await fillLanguage("zzzzzzzzzz")).locale).toBe(DEFAULT_LOCALE);
  });
});

/** Заполнить окно предела до отказа — так, как его считает сам продукт. */
function exhaustScanLimit(client: string): void {
  const now = new Date();
  for (let hit = 0; hit < FILL_LIMITS.scanPerClient.maxHits; hit += 1) {
    checkScanAllowed(client, now);
  }
}

describe("предел частоты", () => {
  beforeEach(() => {
    // Без объявленного числа доверенных посредников клиентов различать нечем, и предел
    // не применяется вовсе (см. `identifyClient`). Объявляем один — тогда адрес читается.
    process.env[TRUSTED_PROXY_HOPS_VAR] = "1";
    requestHeaders.set("x-forwarded-for", "203.0.113.7");
  });

  it("сработавший предел не пускает запрос в базу — и язык остаётся за телефоном", async () => {
    // Предел нарочно срабатывает ДО похода в базу, иначе он не защищал бы её от
    // перебора кодов. Значит, языка пиццерии в этот миг не существует, даже если
    // станция настоящая, — и это проверяется на настоящей русской пиццерии.
    const code = await stationSpeaking("ru");
    phoneAsks("en-GB,en;q=0.9");
    exhaustScanLimit("203.0.113.7");

    const language = await fillLanguage(code);

    expect(language.tooOften).toBe(true);
    expect(language.locale).toBe("en");
    expect(vi.mocked(stationCountryLocale)).not.toHaveBeenCalled();
  });

  it("пока предел не выбран, всё идёт обычным порядком", async () => {
    const code = await stationSpeaking("ru");
    phoneAsks("en-GB,en;q=0.9");

    const language = await fillLanguage(code);

    expect(language.tooOften).toBe(false);
    expect(language.locale).toBe("ru");
  });
});

describe("база не ответила", () => {
  it("документ объявляет язык телефона, а не уводит на последний рубеж", async () => {
    // Эту функцию зовёт корневая разметка, а отказ из неё Next уводит на
    // `global-error.tsx` — англоязычный экран «продукт не завёлся» без каркаса. Сегодня
    // недоступная база даёт сотруднику нормальный экран отказа на его языке, и менять
    // это на худшее ради атрибута нельзя. Ошибка не теряется: за чек-листом содержимое
    // всё равно пойдёт в базу и упадёт там же.
    const logged: string[] = [];
    const denied = vi
      .spyOn(console, "error")
      .mockImplementation((note: unknown) => {
        logged.push(String(note));
      });
    vi.mocked(stationCountryLocale).mockRejectedValueOnce(
      new Error("соединение с базой закрыто"),
    );
    phoneAsks("ru-RU,ru;q=0.9");

    const language = await fillLanguage("abcdefghjk");

    expect(language.locale).toBe("ru");
    // Молча это не проходит, и в журнале стоит не «ошибка», а внятная причина: иначе
    // следующий читатель не поймёт, почему документ объявил не тот язык.
    expect(denied).toHaveBeenCalledOnce();
    expect(logged[0]).toContain("язык страны для документа не прочитан");
    denied.mockRestore();
  });
});
