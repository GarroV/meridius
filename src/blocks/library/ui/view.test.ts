import { describe, expect, test } from "vitest";

import { parseLibraryView } from "./view";

const BLOCK_ID = "0f3a1f6e-6c1a-4c2e-9f2a-1f2b3c4d5e6f";

describe("разбор адреса библиотеки", () => {
  test("пустой адрес — блок не выбран", () => {
    expect(parseLibraryView({})).toStrictEqual({});
  });

  test("опознаватель блока читается из адреса", () => {
    expect(parseLibraryView({ block: BLOCK_ID })).toStrictEqual({
      blockId: BLOCK_ID,
    });
  });

  test("повторённый параметр берётся первым значением, а не склеивается", () => {
    expect(parseLibraryView({ block: [BLOCK_ID, "чужое"] })).toStrictEqual({
      blockId: BLOCK_ID,
    });
  });

  test("не uuid отбрасывается молча: это мусор, а не отказ", () => {
    expect(parseLibraryView({ block: "' or 1=1 --" })).toStrictEqual({});
    expect(parseLibraryView({ block: "" })).toStrictEqual({});
  });
});
