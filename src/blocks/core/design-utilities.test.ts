// Размер текста и скругление в разметке берутся из дизайн-системы, а не из Tailwind.
//
// У системы свои шкалы — `--fs-*` для размеров и `--r-*` для скруглений, — и продукты
// линейки узнаются именно по ним. Голая утилита Tailwind (`text-2xl`, `rounded-lg`)
// приносит СВОЁ значение: `text-2xl` это 19,5px там, где система говорит 20px, а
// `rounded` — 4px там, где контролу положено 8px. Разойтись так можно на один экран, и
// заметит это не прогон, а владелец, сравнив два продукта глазами. Он и заметил.
//
// Проверка узкая нарочно: она стережёт ДВЕ шкалы, которые несут узнаваемость, и не
// трогает остальные утилиты. `leading-none` в этот список не входит — это не выбор
// межстрочного из шкалы, а снятие строчного бокса у контрола заданной высоты, и токена
// на такое у системы нет.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, test } from "vitest";

import { repositoryRoot } from "./repo-copy";
import { withoutComments } from "./source-text";

/** Размеры текста Tailwind: `text-xs` … `text-9xl`. Цвета (`text-ink`) сюда не попадают. */
const BARE_TEXT_SIZE = /\btext-(?:xs|sm|base|lg|xl|[2-9]xl)\b/g;
/** Межстрочные из шкалы Tailwind. `leading-none` — не шкала, см. шапку файла. */
const BARE_LEADING =
  /\bleading-(?:tight|snug|normal|relaxed|loose|[3-9]|10)\b/g;
/** Скругления Tailwind, кроме записи через токен: `rounded-[var(--r-…)]`. */
const BARE_RADIUS =
  /\brounded(?:-(?:none|sm|md|lg|xl|[2-9]xl|full|t|b|l|r|tl|tr|bl|br))?(?![-[])\b/g;

function screenFiles(root: string): readonly string[] {
  const found: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(path);
        continue;
      }
      if (entry.name.endsWith(".tsx") && !entry.name.endsWith(".test.tsx")) {
        found.push(path);
      }
    }
  };
  walk(join(root, "src"));
  return found;
}

function offenders(pattern: RegExp): readonly string[] {
  const root = repositoryRoot();
  return screenFiles(root).flatMap((path) => {
    const code = withoutComments(readFileSync(path, "utf8"));
    const hits = [...new Set(code.match(pattern) ?? [])];
    return hits.length === 0
      ? []
      : [`${relative(root, path)}: ${hits.join(", ")}`];
  });
}

describe("разметка держится шкал дизайн-системы", () => {
  test("размер текста задаётся токеном --fs-*, а не утилитой Tailwind", () => {
    expect(
      offenders(BARE_TEXT_SIZE),
      "Размер текста взят из шкалы Tailwind вместо шкалы дизайн-системы. Пишется так: " +
        'className="text-[length:var(--fs-title)] leading-[var(--lh-title)]". ' +
        "Иначе экран получает размер, которого у линейки нет, и продукты расходятся " +
        "на глаз — ровно то, что владелец увидел 25.09.2026, сравнив Meridius с Decimus.",
    ).toEqual([]);
  });

  test("межстрочный задаётся токеном --lh-*, а не утилитой Tailwind", () => {
    expect(
      offenders(BARE_LEADING),
      "Межстрочный взят из шкалы Tailwind. Пишется так: " +
        'className="leading-title" или "leading-[var(--lh-title)]". Шкала Tailwind в ' +
        "globals.css сброшена: такая утилита не даёт ничего, и строка молча получает " +
        "межстрочный родителя.",
    ).toEqual([]);
  });

  test("скругление задаётся токеном --r-*, а не утилитой Tailwind", () => {
    expect(
      offenders(BARE_RADIUS),
      "Скругление взято из Tailwind вместо дизайн-системы. Роли системы: " +
        "--r-mark (метки, чекбоксы), --r-control (кнопки и поля), " +
        "--r-block (карточки и таблицы), --r-screen (диалоги), --r-pill (срез). " +
        'Пишется так: className="rounded-control" или "rounded-[var(--r-control)]". ' +
        "Шкала Tailwind в globals.css сброшена: голая утилита не даёт НИЧЕГО, а не 4px.",
    ).toEqual([]);
  });
});
