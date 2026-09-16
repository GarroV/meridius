// Сторож T124: адрес экрана кабинета не пишется строкой.
//
// Этот дубль в проекте вычищали трижды подряд — `qr/ui/view.ts` (T116), `feed/ui/FeedEmpty.tsx`
// (T118), `catalog/ui/view.ts` (T119): в каждом случае блок держал собственную копию адреса
// раздела, хотя тот же факт уже лежал в `core/admin-sections`. Копия ничем себя не проявляет,
// пока адрес не меняется, — а когда меняется, продукт начинает вести в никуда ровно оттуда,
// где про копию забыли. Три раза подряд — это не совпадение, а отсутствие сторожа.
//
// Проверка структурная: она не ходит по экранам, а читает исходный текст и ловит ПОЯВЛЕНИЕ
// нового литерала. Поведение держат сквозные сценарии (`e2e/admin-nav.spec.ts`), но они
// проверяют то, про что вспомнили; сюда новый дубль попадает сам.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, test } from "vitest";

import { ADMIN_HOME, ADMIN_SECTIONS } from "./admin-sections";
import { repositoryRoot } from "./repo-copy";
import { withoutComments } from "./source-text";

/** Где ищем: весь код продукта. Тесты и сценарии — намеренно нет, см. ниже. */
const ROOT = "src";

/**
 * Файлы, которым адрес кабинета положен строкой, и причина у каждого своя.
 *
 * Список закрытый: всё остальное зовёт `core/admin-sections`. Тесты в него не входят —
 * проверка, берущая ожидаемое значение из той же константы, что и код, проверяет равенство
 * константы самой себе.
 */
const DECLARED = new Map([
  [
    "src/blocks/core/admin-sections.ts",
    "источник истины: разделы кабинета и его главная",
  ],
  [
    "src/blocks/auth/routes.ts",
    "адреса входа: /admin/login и то, куда попадает вошедший",
  ],
  [
    "src/proxy.ts",
    "matcher middleware — Next читает его статически, константа туда не подставляется",
  ],
]);

/**
 * Литерал-адрес кабинета: в кавычках любого вида, включая шаблонный, и целиком похожий
 * на путь. Пробел внутри отсекает прозу: `src/startup-checks.ts` объясняет словами, чем
 * печать наклейки отличается от опроса кода, и называет там оба адреса — это текст для
 * человека, а не переход, и дублем он не является.
 */
const ADMIN_LITERAL = /(["'`])(\/admin(?:\/[^\s"'`]*)?)\1/g;

function sourceFiles(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    const full = path.join(directory, entry);
    if (statSync(full).isDirectory()) {
      found.push(...sourceFiles(full));
      continue;
    }
    if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) found.push(full);
  }
  return found;
}

function hardcodedPaths(): string[] {
  const root = repositoryRoot();
  const offenders: string[] = [];

  for (const file of sourceFiles(path.join(root, ROOT))) {
    const relative = path.relative(root, file);
    if (DECLARED.has(relative)) continue;

    const source = withoutComments(readFileSync(file, "utf8"));
    for (const [, , literal] of source.matchAll(ADMIN_LITERAL)) {
      offenders.push(`${relative}: "${literal}"`);
    }
  }

  return offenders;
}

/** Значение константы из чужого файла — текстом, без импорта: границы блоков сюда не пускают. */
function declaredLiteral(relative: string, name: string): string | undefined {
  const source = readFileSync(path.join(repositoryRoot(), relative), "utf8");
  return new RegExp(`${name}\\s*=\\s*"([^"]+)"`).exec(source)?.[1];
}

describe("адреса кабинета (T124)", () => {
  test("в коде нет адресов кабинета строкой — только core/admin-sections", () => {
    expect(hardcodedPaths()).toEqual([]);
  });

  test("сторож видит сам код, а не пустоту", () => {
    // Без этой проверки предыдущая была бы зелёной и при сломанном обходе файлов:
    // пустой список равен пустому списку.
    const files = sourceFiles(path.join(repositoryRoot(), ROOT));

    expect(files.length).toBeGreaterThan(40);
    expect(
      files.some((file) =>
        file.endsWith(path.join("core", "ui", "AdminNav.tsx")),
      ),
    ).toBe(true);
    // И сам разбор литералов работает: в источнике истины адреса находятся.
    const sections = readFileSync(
      path.join(repositoryRoot(), "src/blocks/core/admin-sections.ts"),
      "utf8",
    );
    expect([...sections.matchAll(ADMIN_LITERAL)].length).toBeGreaterThan(5);
  });

  test("главная кабинета в блоке auth — тот же адрес, что в core", () => {
    // Блок `auth` держит собственную копию этого адреса (`ADMIN_HOME_PATH`): куда попадает
    // вошедший — его дело, а импортировать core оттуда можно, но это чужой файл и правит его
    // не этот блок. Пока копия жива, за неё отвечает сторож: разъехаться молча она не может.
    expect(declaredLiteral("src/blocks/auth/routes.ts", "ADMIN_HOME_PATH")).toBe(
      ADMIN_HOME.path,
    );
  });

  test("главная — не раздел меню: в списке разделов её адреса нет", () => {
    // Иначе главная попала бы в боковое меню шестым пунктом и подсвечивалась как раздел,
    // которым не является (T112).
    expect(Object.values(ADMIN_SECTIONS).map((section) => section.path)).not.toContain(
      ADMIN_HOME.path,
    );
  });
});
