// Язык публичного экрана заполнения на живой странице (T179, T232, D122).
//
// Здесь сходятся две вещи, которые в коде лежат отдельно и расходятся только в
// собранном документе:
//
//  · ЧЕЙ это язык. По решению владельца D122 — пиццерии: «дефолт - тот язык что задали
//    для пиццерии. отбивки и сервисные сообщения также должны быть на этом языке».
//    Телефон больше не выбирает язык там, где пиццерия известна.
//  · СОВПАДАЕТ ли язык документа с языком того, что на экране написано. Решение про
//    язык принимают два разных места — корневая разметка (знает только заголовок
//    запроса) и экран заполнения (знает базу), — и синтезатор речи с браузерным
//    переводом верят атрибуту `<html lang>`, а не буквам на экране.
//
// Проверка именно сквозная: сложить и то и другое можно только на живой странице.
import { expect, test, type APIRequestContext } from "@playwright/test";

import { seedFillStand, seedStationWithoutChecklist } from "./fill-fixtures";

/**
 * Языки устройства для матрицы: продукт обязан отвечать одинаково на любом из них.
 * Третий язык здесь не для полноты — на нём продукт не говорит вовсе, и именно он ловит
 * случай «язык взяли с телефона» там, где его обязана задавать пиццерия (D122).
 */
const DEVICE_LANGUAGES = [
  "en-GB,en;q=0.9",
  "ru-RU,ru;q=0.9",
  "de-DE,de;q=0.9",
] as const;

/**
 * Что документ обещает о себе и что объявляет его содержимое — из ОТДАННОГО HTML.
 *
 * Именно из отданного, а не из живой страницы, и это главное в этой проверке. Раньше язык
 * документа догонял содержимое клиентский рубеж `core/ui/HtmlLangSync` — но лишь ПОСЛЕ
 * гидратации, поэтому проверки живого браузера ниже оставались зелёными, пока отданный
 * документ врал. Так дефект T270 и дожил до приёмки волны 14: русский телефон получал
 * `lang="ru"` на странице с английским текстом, а сквозной прогон этого не видел. Рубеж
 * снят (T272) — язык документа считает только сервер, и расходиться отданному с живым
 * больше нечем.
 *
 * Читают отданное как раз те, для кого атрибут и существует: экранный диктор (он читает
 * английские слова по русским фонетическим правилам — на кухонном телефоне это
 * неразборчиво) и браузерный перевод (предлагает перевести страницу на язык, на котором
 * она уже написана). Встроенный браузер сканера QR, с которого на этот экран и попадают,
 * до гидратации может не дойти вовсе.
 */
function declaredIn(html: string): {
  document: string | undefined;
  content: string | undefined;
} {
  const documentLang = /<html[^>]*\slang="([^"]*)"/.exec(html)?.[1];
  // Язык содержимого экран объявляет на своём корне внутри `<body>`; первым в теле идёт
  // скрипт темы, поэтому ищем первый `lang` после начала тела, а не первого потомка.
  const body = html.slice(html.indexOf("<body"));
  const contentLang = /\slang="([^"]*)"/.exec(body)?.[1];
  return { document: documentLang, content: contentLang };
}

/** Отданный HTML страницы при таком языке устройства — без единой строки JavaScript. */
async function deliveredHtml(
  request: APIRequestContext,
  path: string,
  deviceLanguage: string,
): Promise<string> {
  const response = await request.get(path, {
    headers: { "accept-language": deviceLanguage },
  });
  // Отказ по неизвестному коду отдаётся тем же кодом ответа, что и всё остальное (D021),
  // поэтому 200 ожидается на всех трёх состояниях.
  expect(response.status()).toBe(200);
  return await response.text();
}

test.describe("отданный документ обещает то, что в нём написано (T270)", () => {
  test("чек-лист русской пиццерии: документ русский при любом языке телефона", async ({
    request,
  }) => {
    const stand = await seedFillStand("язык-отданного", {
      countryLocale: "ru",
    });

    for (const deviceLanguage of DEVICE_LANGUAGES) {
      const declared = declaredIn(
        await deliveredHtml(request, `/s/${stand.code}`, deviceLanguage),
      );

      expect(declared.document, `язык телефона ${deviceLanguage}`).toBe("ru");
      // И главное: обещание документа равно тому, что объявляет содержимое. Разойтись
      // им негде только потому, что решение о языке теперь одно на запрос.
      expect(declared.content).toBe(declared.document);
    }
  });

  test("английская пиццерия — и в обратную сторону тоже", async ({
    request,
  }) => {
    const stand = await seedFillStand("язык-отданного-англ", {
      countryLocale: "en",
    });

    for (const deviceLanguage of DEVICE_LANGUAGES) {
      const declared = declaredIn(
        await deliveredHtml(request, `/s/${stand.code}`, deviceLanguage),
      );

      expect(declared.document, `язык телефона ${deviceLanguage}`).toBe("en");
      expect(declared.content).toBe(declared.document);
    }
  });

  test("станция без чек-листа: экран отбивки — тоже документ", async ({
    request,
  }) => {
    // Счастливым путём проверка не ограничивается нарочно: отбивку видит человек с
    // настоящей наклейкой на кухне этой пиццерии, и она принадлежит ей (D122).
    const station = await seedStationWithoutChecklist("отбивка-отданная", "ru");

    for (const deviceLanguage of DEVICE_LANGUAGES) {
      const declared = declaredIn(
        await deliveredHtml(request, `/s/${station.code}`, deviceLanguage),
      );

      expect(declared.document, `язык телефона ${deviceLanguage}`).toBe("ru");
      expect(declared.content).toBe(declared.document);
    }
  });

  test("неизвестный код: экран отказа — тоже документ, и тут решает телефон", async ({
    request,
  }) => {
    // За подобранным кодом пиццерии нет никакой, и брать её язык неоткуда: отказ идёт на
    // языке телефона, а документ обязан объявить тот же (вторая половина #129).
    for (const [deviceLanguage, expected] of [
      ["ru-RU,ru;q=0.9", "ru"],
      ["en-GB,en;q=0.9", "en"],
      // Язык, на котором продукт не говорит: остаётся язык продукта.
      ["kk-KZ,kk;q=0.9", "en"],
    ] as const) {
      const declared = declaredIn(
        await deliveredHtml(request, "/s/zzzzzzzzzz", deviceLanguage),
      );

      expect(declared.document, `язык телефона ${deviceLanguage}`).toBe(
        expected,
      );
      expect(declared.content).toBe(declared.document);
    }
  });
});

test.describe("документ вне экрана заполнения объявляет язык запроса", () => {
  // Кабинет и вход своего языка не объявляют: пиццерии там нет, и документ говорит
  // языком запроса. Читается ОТДАННЫЙ html по той же причине, что и всё в этом файле:
  // атрибут существует ради тех, кто до гидратации не доходит.
  //
  // Раньше то же самое утверждали три сценария живого браузера — здесь и в
  // `locale.spec.ts`. Они читали `<html lang>` ПОСЛЕ гидратации, то есть не могли
  // отличить верный ответ сервера от правки, приехавшей на клиенте: ровно так дефект
  // T270 и дожил до приёмки волны 14 (T271).
  for (const [deviceLanguage, expected] of [
    ["ru-RU,ru;q=0.9", "ru"],
    ["en-GB,en;q=0.9", "en"],
    // Язык, на котором продукт не говорит: остаётся язык продукта, а не отказ.
    ["fr-FR,fr;q=0.9", "en"],
  ] as const) {
    test(`телефон ${deviceLanguage}: документ объявляет ${expected}`, async ({
      request,
    }) => {
      for (const path of ["/", "/admin/login"] as const) {
        const declared = declaredIn(
          await deliveredHtml(request, path, deviceLanguage),
        );

        expect(declared.document, `${path} при ${deviceLanguage}`).toBe(
          expected,
        );
      }
    });
  }
});

// Ниже — НЕ проверки документа, а проверки слов на экране: им нужен живой браузер, и
// читают они то, что человек видит, а не то, что документ о себе обещает. Утверждения
// про `<html lang>` из них убраны (T271) — их место в разборе отданного html выше.
test.describe("какие слова видит человек на публичном экране", () => {
  test("отбивка «заполнять нечего» — словами пиццерии, а не телефона", async ({
    browser,
  }) => {
    // Наклейка действующая, станция настоящая, просто сейчас ей заполнять нечего.
    // Владелец назвал отбивки прямо (D122), поэтому и эта надпись принадлежит пиццерии.
    const station = await seedStationWithoutChecklist("отбивка", "ru");
    const context = await browser.newContext({ locale: "en-GB" });
    const page = await context.newPage();

    await page.goto(`/s/${station.code}`);

    await expect(page.getByTestId("fill-none")).toBeVisible();
    await expect(page.getByTestId("fill-none")).toContainText(
      "Сейчас заполнять нечего",
    );
    await context.close();
  });

  test("неизвестный код с телефона на третьем языке: отказ словами продукта", async ({
    browser,
  }) => {
    // Вторая половина #129. Раньше здесь был русский, а чек-лист и вход на том же
    // телефоне приходили по-английски: у экрана заполнения было своё умолчание рядом
    // с умолчанием продукта. Человек получал отказ на языке, которого не знает, ровно
    // тогда, когда ему надо понять, что делать дальше.
    const context = await browser.newContext({ locale: "de-DE" });
    const page = await context.newPage();

    await page.goto("/s/zzzzzzzzzz");

    await expect(page.getByTestId("fill-invalid")).toBeVisible();
    await expect(page.getByTestId("fill-invalid")).toContainText(
      "This code does not work",
    );
    await context.close();
  });
});
