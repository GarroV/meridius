// Сторож границы «ядро / обвязка». Сам сторож обязан краснеть: если он однажды начнёт
// относить экраны к ядру, порог покрытия снова станет требовать тестов на интерфейс, а
// если начнёт терять файлы прав доступа — перестанет мерить ровно то, ради чего заведён.
// Ни то, ни другое не видно по зелёному прогону, поэтому проверяется здесь.
import { existsSync } from "node:fs";

import { describe, expect, test } from "vitest";

import { CORE_FILE_LIST, isCoreFile } from "./coverage-core";

describe("граница ядра и обвязки", () => {
  test("права доступа — ядро: отказ, который не сработал, неотличим от успеха", () => {
    expect(isCoreFile("src/blocks/device/pairing.ts")).toBe(true);
    expect(isCoreFile("src/blocks/device/rate-limit.ts")).toBe(true);
    expect(isCoreFile("src/blocks/auth/guard.ts")).toBe(true);
    expect(isCoreFile("src/blocks/core/signed-token.ts")).toBe(true);
  });

  test("экраны и серверные действия — не ядро: их держит живой запуск", () => {
    expect(isCoreFile("src/blocks/device/ui/pair-action.ts")).toBe(false);
    expect(isCoreFile("src/blocks/device/ui/TabletScreen.tsx")).toBe(false);
    expect(isCoreFile("src/app/pair/page.tsx")).toBe(false);
    expect(isCoreFile("src/blocks/editor/actions.ts")).toBe(false);
  });

  test("слой данных относится к ядру целиком, включая файлы, которых ещё нет", () => {
    expect(isCoreFile("src/blocks/data/grading.ts")).toBe(true);
    // Новый файл предметных правил попадает в ядро сам, без правки списка: иначе
    // ядро росло бы мимо порога ровно до того дня, когда кто-то вспомнит вписать.
    expect(isCoreFile("src/blocks/data/ещё-не-написанный.ts")).toBe(true);
  });

  test("под ui/ ядром считается только расчёт расписания, а не соседние экраны", () => {
    expect(isCoreFile("src/blocks/library/ui/item-schedule.ts")).toBe(true);
    expect(isCoreFile("src/blocks/library/ui/ItemRow.tsx")).toBe(false);
  });

  test("сами тесты не меряются: они проверка, а не проверяемое", () => {
    expect(isCoreFile("src/blocks/device/pairing.test.ts")).toBe(false);
    expect(isCoreFile("src/blocks/data/grading.test.ts")).toBe(false);
  });

  test("каждый поимённо названный файл ядра существует на диске", () => {
    // Переименованный файл ядра исчезает из отчёта о покрытии, и без этой проверки
    // разбираться пришлось бы по невнятному отказу гейта в середине прогона.
    const lost = CORE_FILE_LIST.filter((path) => !existsSync(path));
    expect(lost).toEqual([]);
  });
});
