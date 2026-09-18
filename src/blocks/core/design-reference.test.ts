import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  disabledCursors,
  disabledOpacities,
  isColorValue,
  outlineColorTokens,
  parseTokens,
  referenceDisabledCursor,
  referenceDisabledOpacity,
  referenceNumberField,
} from "./design-reference";

const ROOT = path.resolve(import.meta.dirname, "../..");
const TOKENS = path.resolve(ROOT, "../docs/furca/design/reference/tokens.css");
const COMPONENTS = path.resolve(
  ROOT,
  "../docs/furca/design/reference/components.css",
);
/** Слой экранов эталона: там же, где `.item__num`, — вид числового поля. */
const APP = path.resolve(ROOT, "../docs/furca/design/app.css");

/**
 * Вёрстка продукта: файлы блоков без тестов. Тесты исключены не для удобства —
 * этот же файл держит пример неправильного применения, и без исключения сторож
 * находил бы сам себя, то есть краснел бы на исправленном продукте.
 */
function sourceFiles(dir: string): readonly string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    if (/\.test\.tsx?$/.test(entry.name)) return [];
    return entry.name.endsWith(".tsx") || entry.name.endsWith(".ts")
      ? [full]
      : [];
  });
}

describe("parseTokens", () => {
  it("читает объявления токенов", () => {
    const tokens = parseTokens(":root { --accent: #1F4E9C; --row: 30px; }");

    expect(tokens.get("--accent")).toBe("#1F4E9C");
    expect(tokens.get("--row")).toBe("30px");
  });

  it("берёт последнее объявление: тема переопределяет токен второй раз", () => {
    const tokens = parseTokens(
      ":root { --accent: #1F4E9C; } [data-theme] { --accent: #5E9BF5; }",
    );

    expect(tokens.get("--accent")).toBe("#5E9BF5");
  });
});

describe("isColorValue", () => {
  it.each([
    ["#1F4E9C", true],
    ["rgba(31, 78, 156, .45)", true],
    ["var(--accent)", true],
    ["0 0 0 2px #FFFFFF, 0 0 0 4px rgba(31, 78, 156, .45)", false],
    ["2px solid var(--accent)", false],
    ["30px", false],
  ])("значение %s: цвет — %s", (value, expected) => {
    expect(isColorValue(value)).toBe(expected);
  });
});

describe("outlineColorTokens", () => {
  it("находит токен, подставленный в цвет обводки", () => {
    const found = outlineColorTokens(
      "focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]",
    );

    expect(found).toEqual(["--focus-ring"]);
  });

  it("не путает цвет обводки с другими свойствами", () => {
    expect(outlineColorTokens("border-[var(--line-control)]")).toEqual([]);
  });
});

describe("сторож ролей токенов", () => {
  // Это не проверка модуля, а проверка продукта целиком: она обязана краснеть, когда
  // в свойство цвета обводки подставили токен, цветом не являющийся. CSS такое
  // объявление молча отбрасывает, и кольцо фокуса рисуется по умолчанию — видимо,
  // но не так, как задумано, и по-разному в светлой и тёмной теме.
  it("в цвет обводки подставлены только цветовые токены", () => {
    const tokens = parseTokens(readFileSync(TOKENS, "utf8"));
    const wrong: string[] = [];

    for (const file of sourceFiles(path.join(ROOT, "blocks"))) {
      for (const name of outlineColorTokens(readFileSync(file, "utf8"))) {
        const value = tokens.get(name);
        if (value === undefined || !isColorValue(value)) {
          wrong.push(
            `${path.relative(ROOT, file)}: ${name} = ${value ?? "нет такого токена"}`,
          );
        }
      }
    }

    expect(wrong).toEqual([]);
  });
});

describe("referenceDisabledOpacity", () => {
  it("читает гашение недоступной кнопки из эталона", () => {
    expect(
      referenceDisabledOpacity(
        ".btn:disabled { opacity: .45; cursor: not-allowed; }",
      ),
    ).toBe(0.45);
  });

  it("правила нет — и сказать нечего", () => {
    expect(referenceDisabledOpacity(".btn { opacity: 1; }")).toBeUndefined();
  });
});

describe("disabledOpacities", () => {
  it("находит доли гашения в вёрстке", () => {
    expect(
      disabledOpacities(
        // Второе значение намеренно не то, которое встречается в продукте: массовая
        // замена по вёрстке однажды переписала пример внутри теста, и тест упал не
        // потому, что разбор сломался.
        "disabled:opacity-45 hover:opacity-90 disabled:opacity-30",
      ),
    ).toEqual([0.45, 0.3]);
  });
});

describe("сторож гашения недоступных элементов", () => {
  // Разница между .45 и .60 на глаз мелкая, но она ровно про то, ради чего гашение
  // существует: недоступная кнопка должна читаться недоступной с первого взгляда, а
  // не «какой-то бледной». Держать это глазами нельзя — значение расходится по одному
  // файлу за раз и нигде не краснеет.
  it("вёрстка гасит ровно так, как эталон", () => {
    const expected = referenceDisabledOpacity(readFileSync(COMPONENTS, "utf8"));
    const wrong: string[] = [];

    for (const file of sourceFiles(path.join(ROOT, "blocks"))) {
      for (const value of disabledOpacities(readFileSync(file, "utf8"))) {
        if (value !== expected) {
          wrong.push(
            `${path.relative(ROOT, file)}: ${String(value)} вместо ${String(expected)}`,
          );
        }
      }
    }

    expect(wrong).toEqual([]);
  });
});

describe("сторож курсора недоступных элементов", () => {
  // Курсор недоступной кнопки продукт задавал двумя способами сразу, и на соседних
  // экранах одна и та же недоступная кнопка вела себя по-разному. Расхождение с
  // эталоном здесь вторично: первично то, что продукт расходился сам с собой.
  it("вёрстка ставит курсор ровно тот, что эталон", () => {
    const expected = referenceDisabledCursor(readFileSync(COMPONENTS, "utf8"));
    const wrong: string[] = [];

    for (const file of sourceFiles(path.join(ROOT, "blocks"))) {
      for (const cursor of disabledCursors(readFileSync(file, "utf8"))) {
        if (cursor !== expected) {
          wrong.push(
            `${path.relative(ROOT, file)}: ${cursor} вместо ${String(expected)}`,
          );
        }
      }
    }

    expect(wrong).toEqual([]);
  });
});

describe("referenceDisabledCursor", () => {
  it("читает курсор недоступной кнопки из эталона", () => {
    expect(
      referenceDisabledCursor(
        ".btn:disabled { opacity: .45; cursor: not-allowed; }",
      ),
    ).toBe("not-allowed");
  });

  it("правила нет — и сказать нечего", () => {
    expect(
      referenceDisabledCursor(".btn { cursor: pointer; }"),
    ).toBeUndefined();
  });
});

describe("disabledCursors", () => {
  it("находит курсоры недоступных элементов", () => {
    expect(
      // Значение намеренно не то, которое встречается в продукте: массовая замена по
      // вёрстке уже дважды переписывала пример внутри теста.
      disabledCursors("disabled:cursor-wait hover:cursor-pointer"),
    ).toEqual(["wait"]);
  });
});

/**
 * Эталон приехал в проект вместе с визуальным языком другого продукта (D013), и
 * вместе с ним приехал слой токенов, которому в meridius нет применения. Слой этот
 * молчаливый: неиспользуемый токен ничего не ломает, поэтому живёт годами и врёт
 * читателю — и человеку, и сверке экранов — о том, что у продукта есть такая роль.
 * Обратная сторона так же молчалива: ссылка на токен, которого нет, в CSS просто
 * отбрасывается, и свойство рисуется значением по умолчанию.
 */
function referenceFiles(dir: string): readonly string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return referenceFiles(full);
    return entry.name.endsWith(".css") || entry.name.endsWith(".html")
      ? [full]
      : [];
  });
}

describe("сторож ссылок на токены", () => {
  const DESIGN = path.resolve(ROOT, "../docs/furca/design");
  const consumers = [
    ...referenceFiles(DESIGN).filter((file) => file !== TOKENS),
    ...referenceFiles(ROOT),
    ...sourceFiles(path.join(ROOT, "blocks")),
    ...sourceFiles(path.join(ROOT, "app")),
  ].map((file) => readFileSync(file, "utf8"));

  // Токен объявляют не только в эталоне: витрина и глобальные стили продукта
  // заводят собственные, локальные. Для ссылки важно лишь то, что объявление есть
  // хоть где-то — иначе CSS молча отбросит свойство.
  const declaredAnywhere = new Set([
    ...parseTokens(readFileSync(TOKENS, "utf8")).keys(),
    ...consumers.flatMap((text) =>
      [
        ...text.matchAll(/(--[\w-]+)\s*:/g),
        // next/font заводит переменную из TypeScript, а не из CSS
        ...text.matchAll(/variable:\s*"(--[\w-]+)"/g),
      ].map((match) => match[1]),
    ),
  ]);

  it("каждая ссылка на токен разрешается объявлением", () => {
    const dangling = new Set<string>();

    for (const text of [readFileSync(COMPONENTS, "utf8"), ...consumers]) {
      for (const [, name] of text.matchAll(/var\(\s*(--[\w-]+)\s*\)/g)) {
        if (name !== undefined && !declaredAnywhere.has(name))
          dangling.add(name);
      }
    }

    expect([...dangling]).toEqual([]);
  });
});

describe("referenceNumberField", () => {
  const tokens = parseTokens(
    "--fs-num-hero: 22px; --w-medium: 500; --font-num: 'IBM Plex Mono';",
  );

  it("читает геройский вид числового поля из эталона", () => {
    expect(
      referenceNumberField(
        ".item__num .input { font: var(--w-medium) var(--fs-num-hero)/1 var(--font-num); height: 48px; text-align: center; max-width: 120px; }",
        tokens,
      ),
    ).toEqual({
      fontSize: "22px",
      lineHeight: "22px",
      fontWeight: "500",
      textAlign: "center",
      height: "48px",
      maxWidth: "120px",
    });
  });

  it("правила нет — и сказать нечего", () => {
    expect(
      referenceNumberField(".input { color: red; }", tokens),
    ).toBeUndefined();
  });

  it("сокращённой записи шрифта нет — сказать нечего", () => {
    expect(
      referenceNumberField(".item__num .input { height: 48px; }", tokens),
    ).toBeUndefined();
  });

  it("запись шрифта не разбирается — сказать нечего", () => {
    expect(
      referenceNumberField(
        ".item__num .input { font: inherit; height: 48px; }",
        tokens,
      ),
    ).toBeUndefined();
  });

  // Объявления нет — сторож обязан отдать пустое значение, а не выдумать эталонное:
  // выдуманное сравнится с браузером и подтвердит само себя.
  it("объявления в правиле нет — значение пустое", () => {
    expect(
      referenceNumberField(
        ".item__num .input { font: var(--w-medium) var(--fs-num-hero)/1 var(--font-num); }",
        tokens,
      ),
    ).toEqual({
      fontSize: "22px",
      lineHeight: "22px",
      fontWeight: "500",
      textAlign: "",
      height: "",
      maxWidth: "",
    });
  });

  it("токен неизвестен — ссылка остаётся как есть", () => {
    expect(
      referenceNumberField(
        ".item__num .input { font: 500 22px/1 mono; max-width: var(--nema-takogo); }",
        tokens,
      )?.maxWidth,
    ).toBe("var(--nema-takogo)");
  });
});

describe("сторож геройского вида числового поля", () => {
  // Эталон вешает вид на КЛАСС, а не на состояние: пустое числовое поле обязано
  // читаться так же, как заполненное. Сторож держит сам эталон читаемым — без него
  // сквозной сценарий сравнивал бы браузер с `undefined` и был бы вечно зелёным.
  it("эталон задаёт вид числового поля, и он читается", () => {
    const look = referenceNumberField(
      readFileSync(APP, "utf8"),
      parseTokens(readFileSync(TOKENS, "utf8")),
    );

    expect(look).toBeDefined();
    expect(look?.textAlign).toBe("center");
    expect(Number.parseFloat(look?.fontSize ?? "0")).toBeGreaterThan(
      Number.parseFloat(
        parseTokens(readFileSync(TOKENS, "utf8")).get("--fs-lead") ?? "0",
      ),
    );
  });
});
