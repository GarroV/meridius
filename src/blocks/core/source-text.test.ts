// Контракт `withoutComments`: сторожа, которые читают исходный текст продукта, зовут эту
// функцию, чтобы не ловить собственное объяснение в комментариях — и печатают номер строки,
// поэтому нумерация не должна съезжать. Отдельно фиксируем дыру: `/*` внутри строки или
// внутри строчного комментария не должен открывать блочный комментарий по-настоящему —
// сейчас открывает, и живой пример (`core/ui/AdminShell.tsx`) на этом теряет код между
// `screens/*.html` в шапке и ближайшим JSDoc дальше по файлу. Часть тестов ниже поэтому
// падает на нынешней реализации — это ожидаемо, реализация чинится отдельно.
import { describe, expect, test } from "vitest";

import { withoutComments } from "./source-text";

describe("строчный комментарий // (п.1)", () => {
  test("в начале строки убирается, номер строки не съезжает", () => {
    const input = ["// заголовок файла", "const a = 1;"].join("\n");

    const result = withoutComments(input);

    expect(result.split("\n")).toHaveLength(2);
    expect(result).not.toContain("заголовок файла");
    expect(result).toContain("const a = 1;");
  });

  test("после кода на той же строке убирается, код остаётся", () => {
    const input = "const a = 1; // хвост";

    const result = withoutComments(input);

    expect(result).toContain("const a = 1;");
    expect(result).not.toContain("хвост");
  });
});

describe("блочный комментарий /* */ на одной строке (п.2)", () => {
  test("убирается, а код вокруг него остаётся", () => {
    const input = "const a = /* мусор */ 1;";

    const result = withoutComments(input);

    expect(result).toContain("const a =");
    expect(result).toContain("1;");
    expect(result).not.toContain("мусор");
  });
});

describe("многострочный блочный комментарий (п.3)", () => {
  test("JSDoc убирается, число строк на выходе равно числу строк на входе", () => {
    const input = [
      "/**",
      " * Многострочный докблок.",
      " * Вторая строка пояснения.",
      " */",
      "const x = 1;",
    ].join("\n");

    const result = withoutComments(input);

    expect(result.split("\n")).toHaveLength(input.split("\n").length);
    expect(result).not.toContain("Многострочный докблок");
    expect(result).not.toContain("Вторая строка пояснения");
    expect(result).toContain("const x = 1;");
  });
});

describe("JSX-комментарий {/* */} (п.4)", () => {
  test("убирается, соседняя разметка остаётся", () => {
    const input = "const el = <div>{/* подсказка */}<span/></div>;";

    const result = withoutComments(input);

    expect(result).not.toContain("подсказка");
    expect(result).toContain("<div>");
    expect(result).toContain("<span/>");
  });
});

describe("// внутри строкового литерала — не комментарий (п.5)", () => {
  test("двойные кавычки: адрес с // остаётся целиком", () => {
    const input = 'const url = "https://example.com/x";';

    expect(withoutComments(input)).toBe(input);
  });

  test("одинарные кавычки: адрес с // остаётся целиком", () => {
    const input = "const url = 'https://example.com/x';";

    expect(withoutComments(input)).toBe(input);
  });

  test("шаблонная строка: адрес с // остаётся целиком", () => {
    const input = "const url = `https://example.com/x`;";

    expect(withoutComments(input)).toBe(input);
  });
});

describe("/* внутри строкового литерала не открывает блочный комментарий (п.6, известная дыра)", () => {
  test("строка с /* в литерале остаётся целиком, код после неё не проглатывается", () => {
    // Дыра ровно в этом: /* внутри "screens/*.html" сейчас читается как открытие блочного
    // комментария и ищет ближайший */ хоть в JSDoc двумя строками ниже — глотая всё между.
    const input = [
      'const glob = "screens/*.html";',
      "const next = 1;",
      "/** докблок дальше по файлу. */",
      "const after = 2;",
    ].join("\n");

    const result = withoutComments(input);

    expect(result).toContain('const glob = "screens/*.html";');
    expect(result).toContain("const next = 1;");
    expect(result).toContain("const after = 2;");
    expect(result.split("\n")).toHaveLength(input.split("\n").length);
  });
});

describe("/* внутри строчного комментария не открывает блочный комментарий (п.7, известная дыра)", () => {
  test("после // с *.html дальнейший код остаётся нетронутым", () => {
    const input = [
      "// эталон лежит в docs/furca/design/screens/*.html",
      "const next = 1;",
      "/** докблок дальше по файлу. */",
      "const after = 2;",
    ].join("\n");

    const result = withoutComments(input);

    expect(result).not.toContain("эталон лежит");
    expect(result).toContain("const next = 1;");
    expect(result).toContain("const after = 2;");
    expect(result.split("\n")).toHaveLength(input.split("\n").length);
  });
});

describe("экранированная кавычка не закрывает строку (п.8)", () => {
  test('"a\\"//b" остаётся целиком', () => {
    const input = 'const s = "a\\"//b";';

    expect(withoutComments(input)).toBe(input);
  });
});

describe("многострочная шаблонная строка сохраняется целиком (п.9)", () => {
  test("// и /* внутри шаблонной строки не режутся", () => {
    const input = [
      "const t = `line1",
      "// not a comment",
      "/* not a comment either */",
      "line4`;",
    ].join("\n");

    expect(withoutComments(input)).toBe(input);
  });
});

describe("*/ закрывает блочный комментарий как в самом JS (п.10)", () => {
  test("первый */ закрывает комментарий, вложенности нет", () => {
    const input = "/* a /* b */ c */";

    const result = withoutComments(input);

    expect(result).not.toContain("a /* b");
    expect(result).toContain("c */");
  });
});

describe("пустой ввод и текст без комментариев (п.11)", () => {
  test("пустая строка на входе даёт пустую строку на выходе", () => {
    expect(withoutComments("")).toBe("");
  });

  test("текст без единого комментария не меняется вовсе", () => {
    const input = ["const a = 1;", "const b = 2;", "export { a, b };"].join(
      "\n",
    );

    expect(withoutComments(input)).toBe(input);
  });
});

describe("случай из жизни: шапка с *.html в комментарии не должна глотать код (п.12)", () => {
  test("QR_PATH остаётся после снятия комментариев", () => {
    // Ровно та форма файла, что уже живёт в продукте (`core/ui/AdminShell.tsx`,
    // `core/admin-sections.ts`): // -шапка со ссылкой на эталон экрана, затем код,
    // а где-то дальше по файлу — однострочный JSDoc, который сегодня замыкает
    // ложно открытый комментарий и глотает всё между ними.
    const input = [
      "// Разделы кабинета: адрес и путь к экрану QR.",
      "//",
      "// Эталон — `docs/furca/design/screens/*.html`.",
      "",
      'export const QR_PATH = "/admin/qr";',
      "",
      "export interface Foo {",
      "  /** Пояснение к полю. */",
      "  readonly bar: string;",
      "}",
    ].join("\n");

    const result = withoutComments(input);

    expect(result).toContain('export const QR_PATH = "/admin/qr";');
    expect(result.split("\n")).toHaveLength(input.split("\n").length);
  });

  describe("регулярные выражения (добавлено при T156)", () => {
    test("кавычка внутри регулярного выражения не открывает строку", () => {
      // Arrange: у сторожей такие выражения встречаются постоянно — они ищут в коде
      // литералы, а значит несут кавычки внутри себя.
      const source = [
        "const LITERAL = /([\"'`])(\\/admin)\\1/g;",
        'const path = "/admin/qr"; // хвост',
      ].join("\n");

      // Act
      const result = withoutComments(source);

      // Assert: если бы кавычка из выражения открыла строку, следующая строка ушла бы
      // в «строковый» режим целиком и сторож перестал бы видеть в ней что-либо.
      expect(result.split("\n")[1]).toContain('"/admin/qr"');
      expect(result).not.toContain("хвост");
    });

    test("деление не путается с началом регулярного выражения", () => {
      // Arrange
      const source =
        "const half = total / 2; // пополам\nconst rest = half / 3;";

      // Act
      const result = withoutComments(source);

      // Assert
      expect(result).toContain("total / 2");
      expect(result).toContain("half / 3");
      expect(result).not.toContain("пополам");
    });
  });
});
