import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  disabledOpacities,
  isColorValue,
  outlineColorTokens,
  parseTokens,
  referenceDisabledOpacity,
} from "./design-reference";

const ROOT = path.resolve(import.meta.dirname, "../..");
const TOKENS = path.resolve(ROOT, "../docs/furca/design/reference/tokens.css");
const COMPONENTS = path.resolve(
  ROOT,
  "../docs/furca/design/reference/components.css",
);

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
