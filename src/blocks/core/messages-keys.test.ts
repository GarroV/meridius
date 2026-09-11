// Сторож: ключ, названный в коде, обязан быть в словаре — на обоих языках.
//
// Зачем отдельная проверка. next-intl на отсутствующий ключ не падает: он рисует сам ключ
// и пишет одну строку `MISSING_MESSAGE` в журнал сервера. Проверено фактом при сведении
// каркаса (T112): после удаления мёртвой секции словаря человек увидел бы на кнопке
// `editor.nav.soon`, а ВСЕ 127 сквозных сценариев остались зелёными. Тихий отказ, который
// не ловил ни один гейт, — задача T123, issue #34.
//
// Что проверка ловит и чего не ловит. Она смотрит только статические ключи: `t("items.add")`
// с литералом. Собранный ключ (`t(`sections.${key}`)`) и ключ из переменной пропускаются
// намеренно: разобрать их без выполнения кода нельзя, а догадка дала бы ложные падения —
// сторож, который кричит зря, отключают целиком, и тогда не ловится уже ничего.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import en from "@/messages/en.json";
import ru from "@/messages/ru.json";

import { repositoryRoot } from "./repo-copy";
import { withoutComments } from "./source-text";

const SOURCE_DIRS = ["src", "e2e"] as const;
const SOURCE_SUFFIXES = [".ts", ".tsx"] as const;

/** Пространство имён: `useTranslations("editor.library")`, `getTranslations("admin")`. */
const NAMESPACE = /(?:useTranslations|getTranslations)\(\s*"([^"]+)"/g;
/** Ключ литералом: `t("items.add")`. Шаблонные строки и переменные сюда не попадают. */
const KEY = /\bt\(\s*"([^"]+)"/g;

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      found.push(...sourceFiles(path));
      continue;
    }
    if (SOURCE_SUFFIXES.some((suffix) => entry.endsWith(suffix)))
      found.push(path);
  }
  return found;
}

function lookup(dictionary: unknown, path: readonly string[]): unknown {
  let node: unknown = dictionary;
  for (const segment of path) {
    if (typeof node !== "object" || node === null) return;
    node = (node as Record<string, unknown>)[segment];
  }
  return node;
}

interface Usage {
  readonly file: string;
  readonly namespaces: readonly string[];
  readonly key: string;
}

function collectUsages(): Usage[] {
  const root = repositoryRoot();
  const usages: Usage[] = [];
  for (const dir of SOURCE_DIRS) {
    for (const file of sourceFiles(join(root, dir))) {
      // Комментарии снимаются до разбора: этот сторож объясняется примерами вида
      // `t("items.add")` в своих же комментариях и без этого ловил бы сам себя — проверено
      // первым же прогоном.
      const text = withoutComments(readFileSync(file, "utf8"));
      const namespaces = [...text.matchAll(NAMESPACE)].map(
        (match) => match[1] ?? "",
      );
      if (namespaces.length === 0) continue;
      for (const match of text.matchAll(KEY)) {
        usages.push({
          file: file.slice(root.length),
          namespaces,
          key: match[1] ?? "",
        });
      }
    }
  }
  return usages;
}

/**
 * Ключ ищется под каждым пространством имён своего файла: в одном файле их бывает
 * несколько, а какое из них относится к конкретному вызову, без выполнения кода не узнать.
 * Поэтому пропущено считается только то, чего нет НИ ПОД ОДНИМ из них, — так проверка
 * не выдумывает падений, но удаление ключа всё равно ловит.
 */
function missing(dictionary: unknown, usages: readonly Usage[]): string[] {
  return usages
    .filter(
      ({ namespaces, key }) =>
        !namespaces.some(
          (namespace) =>
            typeof lookup(dictionary, [
              ...namespace.split("."),
              ...key.split("."),
            ]) === "string",
        ),
    )
    .map(
      ({ file, namespaces, key }) =>
        `${file}: ${namespaces.join(" | ")} → ${key}`,
    );
}

describe("ключи словаря", () => {
  const usages = collectUsages();

  // Без этой проверки сломанный обход дал бы «пустое равно пустому»: сторож остался бы
  // зелёным именно тогда, когда перестал работать. Класс порч «тихий отказ самого сторожа»
  // уже ловили на этом проекте при сведении каркаса.
  it("обход кода вообще что-то нашёл", () => {
    expect(usages.length).toBeGreaterThan(50);
  });

  it("каждый ключ из кода есть в русском словаре", () => {
    expect(missing(ru, usages)).toEqual([]);
  });

  it("каждый ключ из кода есть в английском словаре", () => {
    expect(missing(en, usages)).toEqual([]);
  });
});
