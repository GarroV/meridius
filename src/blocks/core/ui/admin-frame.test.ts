// Сетка каркаса кабинета — ровно одна копия на продукт (T193).
//
// Почему сторож нужен. Каркас рисуют два места: `AdminShell` (пять разделов) и
// `editor/ui/EditorScreen.tsx` (у редактора своя верхняя полоса). Пока сетка была
// литералом `grid-cols-[208px_1fr]`, это были две копии одного решения, и разъехались
// они молча: правка каркаса под телефон чинила пять разделов из шести, а редактор —
// единственный экран, ради которого решение D092 вообще принималось («человек должен
// суметь зайти и поправить»), — оставался с колонкой 208 px на экране 375 px. Ровно так
// уже разъезжались меню (T074), шапка (T112) и порт приложения (T163, T190, T200).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { repositoryRoot } from "../repo-copy";
import { ADMIN_CONTENT_CLASS, ADMIN_FRAME_CLASS } from "./admin-frame";

const REPO_ROOT = repositoryRoot();
const SOURCE_ROOT = join(REPO_ROOT, "src");

/**
 * Файлы разметки продукта — обход каталогов, а не список: новый экран попадёт под
 * сторожа сам, в тот же день, когда его завели. Смотрим именно `.tsx`: каркас рисует
 * разметка, а литерал в ней и есть копия решения. Сам источник — `.ts`, и упоминание
 * литерала в нём и в этом файле законно.
 */
function markupFiles(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) {
      found.push(...markupFiles(full));
      continue;
    }
    if (entry.endsWith(".tsx")) found.push(full);
  }
  return found;
}

describe("сетка каркаса живёт в одном месте", () => {
  test("ни один экран не пишет колонку 208 px литералом", () => {
    const offenders = markupFiles(SOURCE_ROOT)
      .filter((file) => readFileSync(file, "utf8").includes("208px_1fr"))
      .map((file) => file.slice(REPO_ROOT.length + 1));

    expect(offenders).toEqual([]);
  });
});

describe("каркас схлопывается ниже складки", () => {
  // Складка — `--page-fold: 768px` из эталона, а `md` у Tailwind это ровно 48rem.
  // Поэтому вариант `max-md:` и есть «ниже складки», без второго числа в коде.
  test("сверху складки колонка меню прежняя — 208 px", () => {
    expect(ADMIN_FRAME_CLASS).toContain("grid-cols-[208px_1fr]");
  });

  test("ниже складки колонок меню нет: один столбец", () => {
    expect(ADMIN_FRAME_CLASS).toContain("max-md:grid-cols-[1fr]");
  });

  test("ниже складки строки заданы явно, иначе полоса меню растягивается", () => {
    // Не украшение: у сетки `align-content: stretch`, и без явных строк свободная
    // высота раздувала полосу меню с 53 px до 196-291 px — замерено на живых экранах.
    expect(ADMIN_FRAME_CLASS).toContain("max-md:grid-rows-[auto_1fr]");
  });

  test("ниже складки вбок уезжает содержимое, а не документ", () => {
    // Широкая таблица справочника делала документ 926 px при экране 375 px: вместе с
    // таблицей за край уходили заголовок и кнопка раздела.
    expect(ADMIN_CONTENT_CLASS).toContain("max-md:overflow-x-auto");
  });

  test("ниже складки область содержимого — вмещающий блок, иначе прокрутка не всё ловит", () => {
    // Вторая половина той же починки, найденная разбором: поля `sr-only` объявлены
    // `position: absolute`, и без позиционирования у области содержимого их вмещающим
    // блоком оставалась страница — прокрутка их не обрезала, и страницу утаскивало
    // вбок на 299 px при `body` шириной честные 375.
    expect(ADMIN_CONTENT_CLASS).toContain("max-md:relative");
  });
});
