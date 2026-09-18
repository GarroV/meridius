import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  disabledCursors,
  disabledOpacities,
  carriesColor,
  declarationsUnder,
  isColorValue,
  lightOnlyColorTokens,
  themeTokens,
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

describe("сторож колец фокуса", () => {
  // Дефект, ради которого сторож заведён, сначала случился: у поля пароля на экране
  // входа стояло мягкое кольцо (тень + смена цвета рамки), а браузерная обводка не
  // гасилась — и человек видел два кольца сразу, разной формы и толщины. Нашла это
  // сверка экрана глазами; ни один тест покраснеть не мог, потому что оба кольца
  // «есть» и каждое по отдельности правильное. У остальных полей продукта
  // `focus:outline-none` стояло, то есть это был недосмотр в одном файле, а не
  // выбор — такие и возвращаются молча при следующей правке.
  const SOFT_RING = "focus:shadow-[0_0_0_3px_var(--focus-soft)]";

  it("поле с мягким кольцом гасит браузерную обводку", () => {
    const doubled: string[] = [];

    for (const file of sourceFiles(path.join(ROOT, "blocks"))) {
      const text = readFileSync(file, "utf8");
      for (const [, attrs] of text.matchAll(/className="([^"]*)"/g)) {
        if (attrs === undefined) continue;
        if (!attrs.includes(SOFT_RING)) continue;
        if (attrs.includes("focus:outline-none")) continue;
        doubled.push(path.relative(ROOT, file));
      }
    }

    expect(doubled).toEqual([]);
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

/**
 * Тёмная тема (T236, D106). Экран берёт цвет по имени токена и об оформлении темы не
 * знает ничего: тёмные значения эталон объявляет отдельным блоком, и всё, чего он не
 * покрыл, останется светлым. Дефект молчит вдвойне — цвет на месте, свойство
 * применилось, а глазами это ловится только на тёмном экране, куда никто не заходит.
 *
 * Сторожа два, потому что светлый цвет приезжает на тёмный экран двумя дорогами:
 * ссылкой на токен без тёмного значения и цветом, написанным прямо в вёрстке.
 */
/** Комментарии выкинуты: номера задач (`#100`) цветом не являются. */
function withoutComments(text: string): string {
  return text.replaceAll(/\/\*[\S\s]*?\*\//g, " ").replaceAll(/\/\/.*/g, " ");
}

describe("сторожа тёмной темы", () => {
  const tokens = readFileSync(TOKENS, "utf8");
  const productFiles = [
    ...sourceFiles(path.join(ROOT, "blocks")),
    ...sourceFiles(path.join(ROOT, "app")),
  ];
  /** Глобальные стили продукта — такой же потребитель токенов, как и разметка. */
  const GLOBALS = path.resolve(ROOT, "app/globals.css");

  it("ни один экран не берёт токен, у которого нет тёмного значения", () => {
    const lightOnly = new Set(lightOnlyColorTokens(tokens));
    const caught: string[] = [];

    for (const file of [...productFiles, GLOBALS]) {
      const text = readFileSync(file, "utf8");
      for (const [, name] of text.matchAll(/var\(\s*(--[\w-]+)\s*\)/g)) {
        if (name === undefined || !lightOnly.has(name)) continue;
        caught.push(`${path.relative(ROOT, file)}: ${name}`);
      }
    }

    expect(caught).toEqual([]);
  });

  /**
   * Бумага. QR-код читается камерой только как тёмное на светлом, а лист наклеек
   * печатается — там белое не тема, а физический лист, и темнеть ему нельзя.
   * Исключение перечислено поимённо: «где-то есть причина» исключением не является.
   */
  const PAPER = new Set(["blocks/qr/svg.ts", "blocks/qr/ui/PrintSheet.tsx"]);
  /** Палитра Tailwind: имена её цветов от темы продукта не зависят вовсе. */
  const PALETTE_UTILITY =
    /\b(?:bg|text|border|fill|stroke|ring|outline|shadow|decoration|divide|caret|accent|placeholder|from|via|to)-(?:white|black|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)\b/g;
  const HEX_COLOR = /#(?:[\da-fA-F]{3,4}|[\da-fA-F]{6}|[\da-fA-F]{8})\b/g;
  /**
   * Цифра после скобки отсекает обычные функции с такими же именами (`rgb(hex)` в
   * разборе QR). Слева — «не буква», а НЕ `\b`: в произвольном значении Tailwind
   * пробелы записаны подчёркиванием (`shadow-[0_1px_2px_rgba(20,26,34,.08)]`), а
   * подчёркивание — словесный символ, и границы слова там нет. На этом сторож и был
   * пойман: жёстко заданную тень он пропускал молча.
   */
  const COLOR_FUNCTION = /(?<![A-Za-z])(?:rgba?|hsla?)\(\s*[\d.]/g;

  it("вёрстка не пишет цвет мимо токенов", () => {
    const caught: string[] = [];

    for (const file of [...productFiles, GLOBALS]) {
      const relative = path.relative(ROOT, file);
      if (PAPER.has(relative)) continue;
      const text = withoutComments(readFileSync(file, "utf8"));
      for (const pattern of [PALETTE_UTILITY, HEX_COLOR, COLOR_FUNCTION]) {
        for (const [found] of text.matchAll(pattern))
          caught.push(`${relative}: ${found}`);
      }
    }

    expect(caught).toEqual([]);
  });
});

/** Кусок эталона в миниатюре: две темы, печать и токен без цвета. */
const TWO_THEMES = `
:root { --canvas: #EDEFF2; --gutter: 18px; --sh-xs: 0 1px 2px rgba(20,26,34,.08); }
:root:not([data-theme]) { --canvas: #000000; }
[data-theme="dark"] { --canvas: #12161C; --sh-xs: 0 1px 2px rgba(0,0,0,.5); }
@media print { [data-theme="dark"] { color-scheme: light; } }
`;

describe("declarationsUnder", () => {
  it("читает объявления своего блока", () => {
    expect(
      declarationsUnder(TWO_THEMES, '[data-theme="dark"]').get("--canvas"),
    ).toBe("#12161C");
  });

  // `:root:not([data-theme])` — другой селектор, и его значение не должно
  // выдаваться за значение `:root`.
  it("не считает своим блок с более длинным селектором", () => {
    expect(declarationsUnder(TWO_THEMES, ":root").get("--canvas")).toBe(
      "#EDEFF2",
    );
  });

  it("блока с таким селектором нет — и объявлений нет", () => {
    expect(declarationsUnder(TWO_THEMES, ".nothing").size).toBe(0);
  });
});

describe("carriesColor", () => {
  // Тень записана длинной строкой, и цвет в ней стоит не первым: на тёмном фоне
  // светлая тень видна не меньше светлой заливки.
  it("цвет внутри тени считается цветом", () => {
    expect(carriesColor("0 1px 2px rgba(20,26,34,.08)")).toBe(true);
  });

  it("значение из одних токенов цвета не несёт", () => {
    expect(carriesColor("2px solid var(--accent)")).toBe(false);
    expect(carriesColor("18px")).toBe(false);
  });
});

describe("themeTokens", () => {
  it("тёмная тема перебивает светлую", () => {
    expect(themeTokens(TWO_THEMES, "dark").get("--canvas")).toBe("#12161C");
    expect(themeTokens(TWO_THEMES, "light").get("--canvas")).toBe("#EDEFF2");
  });

  // Размеров и отступов у тёмной темы нет вовсе — светлое значение для них и есть
  // значение. Иначе проверка живого экрана осталась бы без половины эталона.
  it("непереопределённое остаётся из светлой", () => {
    expect(themeTokens(TWO_THEMES, "dark").get("--gutter")).toBe("18px");
  });
});

describe("lightOnlyColorTokens", () => {
  it("токен без тёмного значения назван", () => {
    expect(
      lightOnlyColorTokens(
        ':root { --a: #FFFFFF; } [data-theme="dark"] { --b: #000000; }',
      ),
    ).toEqual(["--a"]);
  });

  // Размер темы не касается: требовать для него тёмного дубля значило бы краснеть
  // там, где дефекта нет.
  it("нецветной токен тёмного дубля не требует", () => {
    expect(lightOnlyColorTokens(":root { --gutter: 18px; }")).toEqual([]);
  });
});
