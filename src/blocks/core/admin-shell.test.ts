// Сторож T112: каркас кабинета существует ровно в одном экземпляре.
//
// Меню и шапка уже были четырьмя копиями по блокам и разъехались трижды: списком
// разделов (#11), подписями одного и того же пункта и признаком активного пункта. T074
// свёл их в `core/ui`, но не до конца — `catalog` и `editor` сохранили свои `AdminShell`,
// а `editor` ещё и своё меню. Копия каркаса не падает ни одной проверкой: экран с ней
// работает, отличаясь от соседей мелочами, — и расхождение замечают через месяц, когда
// из раздела уже никуда не уйти.
//
// Проверка структурная, а не поведенческая, и это осознанно. Поведение держит
// `e2e/admin-nav.spec.ts` (с каждого экрана виден каждый раздел), но оно проверяет только
// те экраны, которые в списке: копия каркаса на СЛЕДУЮЩЕМ экране пройдёт мимо него так же
// незаметно, как прошла мимо приёмки T074. Здесь ловится само появление второго файла.
import { readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, test } from "vitest";

import { repositoryRoot } from "./repo-copy";

/** Имена файлов каркаса: где бы они ни лежали, лежать им положено только в `core/ui`. */
const SHELL_FILES = ["AdminShell.tsx", "AdminNav.tsx"];

/**
 * Единственное законное место каркаса. `core` доступен каждому блоку по графу
 * зависимостей (`.dependency-cruiser.cjs`), поэтому общей разметке место именно здесь:
 * границы модулей не дают блокам импортировать друг у друга, и любой другой адрес
 * означает копию, а не переиспользование.
 */
const HOME = path.join("src", "blocks", "core", "ui");

function filesUnder(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...filesUnder(full));
    else found.push(full);
  }
  return found;
}

/** Все файлы каркаса в продукте, путями от корня копии. */
function shellFiles(): string[] {
  const root = repositoryRoot();
  return filesUnder(path.join(root, "src"))
    .filter((file) => SHELL_FILES.includes(path.basename(file)))
    .map((file) => path.relative(root, file))
    .sort();
}

describe("каркас кабинета (T112)", () => {
  test("каркас и меню лежат в одном месте — копий нет", () => {
    expect(shellFiles()).toEqual(
      SHELL_FILES.map((name) => path.join(HOME, name)).sort(),
    );
  });

  test("сторож смотрит на настоящее дерево файлов, а не на пустоту", () => {
    // Без этой проверки предыдущая была бы зелёной и при сломанном обходе каталогов:
    // пустой список совпал бы с пустым ожиданием ровно так же, как верный.
    const root = repositoryRoot();
    const all = filesUnder(path.join(root, "src"));

    expect(all.length).toBeGreaterThan(50);
    expect(shellFiles().length).toBe(SHELL_FILES.length);
  });
});
