// Экраны отказа продукта: «не открылось» и «такого адреса нет» (T175, T177, T215).
//
// Почему сторож читает файлы, а не вызывает код. Эти пять файлов Next находит ПО ИМЕНИ
// и месту: `src/app/error.tsx`, `src/app/global-error.tsx`, `src/app/not-found.tsx`,
// `src/app/admin/error.tsx`, `src/app/admin/not-found.tsx`. Переименуй любой — продукт соберётся, все прогоны
// останутся зелёными, а человек снова увидит английскую заглушку Next вместо продукта.
// Ровно так это и было найдено: границы ошибки в проекте не было ВОВСЕ, и недоступная
// база отдавала «A server error occurred» без единого слова о причине, в то время как
// `/admin` выглядел рабочим. Поведение самих экранов проверяют сквозные сценарии
// (`e2e/not-found.spec.ts`) и живой прогон с остановленной базой; здесь — их наличие и
// те свойства, которые сквозной сценарий увидеть не может.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { repositoryRoot } from "./repo-copy";
import { withoutComments } from "./source-text";

const REPO_ROOT = repositoryRoot();

function sourceOf(relativePath: string): string {
  const full = join(REPO_ROOT, relativePath);
  expect(existsSync(full), `нет файла ${relativePath}`).toBe(true);
  return withoutComments(readFileSync(full, "utf8"));
}

describe("граница ошибки продукта", () => {
  test("src/app/error.tsx есть, клиентская и берёт текст из словаря", () => {
    const code = sourceOf("src/app/error.tsx");

    // Next принимает границу ошибки только клиентским компонентом: без директивы
    // сборка падает, но правку легко «починить» удалением файла — поэтому проверяем.
    expect(code).toContain('"use client"');
    expect(code).toContain('useTranslations("failure")');
  });

  test("кнопка повтора зовёт reset, а не перезагружает страницу руками", () => {
    const code = sourceOf("src/app/error.tsx");

    // `reset()` перерисовывает сегмент заново; `location.reload()` выглядит так же,
    // но теряет состояние всей страницы — на экране заполнения это ответы человека.
    expect(code).toContain("onClick={reset}");
    expect(code).not.toContain("location.reload");
  });

  test("наружу не уходит ни текст ошибки, ни её стек", () => {
    const code = sourceOf("src/app/error.tsx");

    // Показываем только `digest` — тот же код печатается в журнале сервера. Сообщение
    // ошибки базы рассказывает про схему и адреса, и на публичном экране заполнения
    // оно оказалось бы у любого, кто открыл ссылку станции.
    expect(code).not.toContain("error.message");
    expect(code).not.toContain("error.stack");
    expect(code).toContain("error.digest");
  });

  test("у кабинета своя граница, и она рисует каркас", () => {
    const code = sourceOf("src/app/admin/error.tsx");

    // Без этого файла отказ внутри кабинета уходит на публичную границу: методист при
    // недоступной базе терял меню и шапку и оказывался на экране, похожем на публичную
    // сторону, — тогда как соседний отказ «такого раздела нет» каркас сохранял (T215).
    expect(code).toContain('"use client"');
    expect(code).toContain("AdminShell");
    expect(code).toContain("onClick={reset}");
    // Наружу, как и на публичной границе, идёт только код события.
    expect(code).not.toContain("error.message");
    expect(code).not.toContain("error.stack");
  });

  test("разметка кабинета отдаёт клиентской стороне словарь каркаса", () => {
    const code = sourceOf("src/app/admin/layout.tsx");

    // Граница ошибки кабинета клиентская, а рисует она меню с подписями: без этих
    // разделов словаря экран соберётся, но вместо подписей покажет ключи.
    expect(code).toContain("NextIntlClientProvider");
    expect(code).toMatch(/admin:\s*MESSAGES/);
    expect(code).toMatch(/failure:\s*MESSAGES/);
  });

  test("global-error отдаёт собственные html и body", () => {
    const code = sourceOf("src/app/global-error.tsx");

    // Сюда попадают только ошибки самой корневой разметки: своей у страницы в этот
    // момент нет, и без этих двух тегов последний рубеж отдаёт пустой документ.
    expect(code).toContain('"use client"');
    expect(code).toMatch(/<html\s/);
    expect(code).toMatch(/<body\s/);
  });

  // T264. Последний рубеж заменяет корневую разметку ЦЕЛИКОМ, то есть всё, что даёт
  // разметка, он обязан дать сам: не дал — значит не дано. Так и разошлось: тело
  // красилось в `bg-surface` (белый), тогда как продукт стоит на `bg-canvas` (сером), и
  // на ширинах больше 420 px у карточки пропадали серые поля — экран выглядел чужим.
  // Вместе с фоном не доставало шрифтов и темы: без классов `next/font` текст набирался
  // системным шрифтом, а тёмный телефон получал светлый экран отказа.
  //
  // Сторож читает исходник, потому что увидеть это прогоном нечем: чтобы последний рубеж
  // сработал, должна упасть сама корневая разметка. Живьём это проверено порчей разметки
  // и измерением фона в браузере — результат записан в журнале блока.
  test("последний рубеж даёт то же, что корневая разметка: фон, шрифты, тему", () => {
    const code = sourceOf("src/app/global-error.tsx");
    const layout = sourceOf("src/app/layout.tsx");

    // Фон один и тот же, и сверяется он с разметкой, а не с буквой в этом файле:
    // поменяют фон продукта — сторож потребует поменять и здесь.
    const layoutBackground = /<body className="(bg-[\w-]+)/.exec(layout)?.[1];
    expect(
      layoutBackground,
      "в разметке не нашёлся класс фона тела",
    ).toBeDefined();
    expect(
      code,
      `последний рубеж красит тело не так, как корневая разметка (${String(layoutBackground)})`,
    ).toContain(`<body className="${String(layoutBackground)}`);

    // Стили — те же, что у всего продукта, и подключены ЗДЕСЬ. Корневая разметка в этом
    // сценарии упала, то есть её импорт не считается: без своего экран получит ни токенов,
    // ни файлов шрифтов — системное начертание и браузерные цвета вместо продукта.
    // Раньше на этом месте стоял класс `next/font`; шрифты переехали в ядро дизайн-системы
    // (`globals.css` → `reference/dodo-ds.css`), и сторож сменил крючок вместе с ними.
    expect(
      code,
      "последний рубеж не подключает globals.css: текст наберётся системным, цвета будут браузерные",
    ).toContain('import "./globals.css"');

    // Тема — атрибутом на <html>: тёмные значения включает только он. Здесь то же:
    // ищем подстановку атрибута, а не упоминание константы.
    expect(
      code,
      "последний рубеж не ставит data-theme: тёмный телефон получит светлый экран",
    ).toContain("[THEME_ATTRIBUTE]: theme");

    // И именно значением, вычисленным здесь, а не скриптом: экран рисуется целиком
    // в браузере (сервер отдаёт 500 без единой буквы), а скрипт, вставленный React
    // в DOM, браузер не исполняет — он выглядел бы работающим и не работал.
    expect(
      code,
      "тема последнего рубежа поставлена скриптом: на клиентском экране он не исполнится",
    ).not.toContain("THEME_BOOTSTRAP_SCRIPT");
  });
});

/**
 * Файлы разметки под `src/app`, которые рисуют `<html>` сами.
 *
 * Обход рекурсивный и по всему дереву маршрутов нарочно: группа маршрутов —
 * это просто папка в скобках, и новый корень появляется добавлением одного файла
 * в любой её глубине.
 */
function documentRoots(): string[] {
  const appRoot = join(REPO_ROOT, "src/app");
  return readdirSync(appRoot, { recursive: true })
    .map(String)
    .filter((entry) => entry.endsWith(".tsx"))
    .filter((entry) =>
      /<html[\s>]/.test(
        withoutComments(readFileSync(join(appRoot, entry), "utf8")),
      ),
    )
    .map((entry) => `src/app/${entry.split("\\").join("/")}`)
    .sort();
}

describe("сколько в продукте корней документа", () => {
  test("<html> рисуют ровно два файла — и это не придирка к числу", () => {
    // Next разрешает НЕСКОЛЬКО корневых разметок — через группы маршрутов (`app/(имя)/`),
    // и соблазн понятен: публичному экрану заполнения нужен свой язык документа (T270).
    // Но каждый такой корень заменяет корневую разметку ЦЕЛИКОМ, то есть обязан сам дать
    // переменные шрифтов на `<html>`, атрибут темы и одноразовый ключ для скрипта темы.
    // Не дал — значит не дано: текст наберётся системным шрифтом, тёмный телефон получит
    // светлый экран, а на публичном маршруте со строгой политикой скрипт темы браузер
    // отобьёт молча, и кухонный телефон останется светлым в ночную смену. Ровно это
    // разошлось на последнем рубеже (T264) и ровно так же расходился список языков,
    // написанный заново своими буквами (T268, #133).
    //
    // Проверки выше написаны на ДВА названных файла. Появился третий — значит их надо
    // распространить и на него, а не узнавать об этом с экрана кухонного телефона.
    // Поэтому список закрытый: новый корень обязан сначала сломать этот сторож.
    expect(documentRoots()).toStrictEqual([
      "src/app/global-error.tsx",
      "src/app/layout.tsx",
    ]);
  });
});

describe("экраны «такого адреса нет»", () => {
  test("публичный not-found есть и говорит словарём, а не буквами", () => {
    const code = sourceOf("src/app/not-found.tsx");

    expect(code).toContain('getTranslations("notFound")');
  });

  test("not-found кабинета есть, стоит внутри каркаса и ведёт назад", () => {
    const code = sourceOf("src/app/admin/not-found.tsx");

    expect(code).toContain('getTranslations("admin.notFound")');
    // Каркас — это меню и верхняя полоса: без него человек выпадает из продукта,
    // что и было дефектом.
    expect(code).toContain("AdminShell");
    // Выход из тупика: адрес главной берётся из общего источника, а не буквой.
    expect(code).toContain("ADMIN_HOME");
  });

  test("ловушка неизвестных адресов кабинета на месте", () => {
    const code = sourceOf("src/app/admin/[...unknown]/page.tsx");

    // Без неё Next отвечает 404 раньше охраны, и перебор адресов рассказывает гостю,
    // какие разделы существуют.
    expect(code).toContain("notFound()");
  });
});

describe("чей экран: сотрудника или кабинета", () => {
  // Сверка с эталоном (T201, T216) нашла у трёх расхождений один корень: публичные
  // пути рисовали АДМИНСКУЮ карточку `StatusCard` — рамку с тенью на сером канвасе, —
  // хотя открывают их с телефона, где эталон требует полноэкранного состояния
  // (`StateScreen`: белый фон от края, крупный заголовок, акцентная кнопка во всю
  // ширину). Сторож смотрит именно на выбор компонента: вёрстка у каждого своя и
  // проверяется живым браузером, а перепутать их снова можно одной строкой импорта.
  const STAFF_SCREENS = [
    "src/app/not-found.tsx",
    "src/app/error.tsx",
    "src/app/global-error.tsx",
  ];
  const ADMIN_SCREENS = [
    "src/app/admin/not-found.tsx",
    "src/app/admin/error.tsx",
  ];

  test.each(STAFF_SCREENS)("%s — полноэкранное состояние", (file) => {
    const code = sourceOf(file);

    expect(code).toContain("StateScreen");
    expect(code).not.toContain("StatusCard");
  });

  test.each(ADMIN_SCREENS)("%s — карточка внутри каркаса", (file) => {
    const code = sourceOf(file);

    expect(code).toContain("StatusCard");
    expect(code).toContain("AdminShell");
  });
});
