import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { isColorValue, outlineColorTokens, parseTokens } from "./design-tokens";

const ROOT = path.resolve(import.meta.dirname, "../..");
const TOKENS = path.resolve(ROOT, "../docs/furca/design/reference/tokens.css");

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
