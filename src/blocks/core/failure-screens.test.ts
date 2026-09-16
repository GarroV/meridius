// Экраны отказа продукта: «не открылось» и «такого адреса нет» (T175, T177).
//
// Почему сторож читает файлы, а не вызывает код. Эти четыре файла Next находит ПО ИМЕНИ
// и месту: `src/app/error.tsx`, `src/app/global-error.tsx`, `src/app/not-found.tsx`,
// `src/app/admin/not-found.tsx`. Переименуй любой — продукт соберётся, все прогоны
// останутся зелёными, а человек снова увидит английскую заглушку Next вместо продукта.
// Ровно так это и было найдено: границы ошибки в проекте не было ВОВСЕ, и недоступная
// база отдавала «A server error occurred» без единого слова о причине, в то время как
// `/admin` выглядел рабочим. Поведение самих экранов проверяют сквозные сценарии
// (`e2e/not-found.spec.ts`) и живой прогон с остановленной базой; здесь — их наличие и
// те свойства, которые сквозной сценарий увидеть не может.
import { existsSync, readFileSync } from "node:fs";
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

  test("global-error отдаёт собственные html и body", () => {
    const code = sourceOf("src/app/global-error.tsx");

    // Сюда попадают только ошибки самой корневой разметки: своей у страницы в этот
    // момент нет, и без этих двух тегов последний рубеж отдаёт пустой документ.
    expect(code).toContain('"use client"');
    expect(code).toMatch(/<html\s/);
    expect(code).toMatch(/<body\s/);
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
