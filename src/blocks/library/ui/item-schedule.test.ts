// Относительная сводка расписания пункта блока: базы здесь не нужно — функция чистая,
// и весь её смысл в том, что часы суток в ответ не попадают ни при каком входе (D097).
import { describe, expect, test } from "vitest";

import type { Item, ScheduleSegment } from "@/blocks/data";

import { blockScheduleSummary } from "./item-schedule";

function item(schedule?: ScheduleSegment[]): Item {
  return {
    id: "item-1",
    title: { ru: "Пункт" },
    type: "bool",
    ...(schedule === undefined ? {} : { schedule }),
  };
}

describe("blockScheduleSummary", () => {
  test("пункт без расписания — «разово»", () => {
    expect(blockScheduleSummary(item())).toEqual({ kind: "none" });
  });

  test("пустой список отрезков — тоже «разово», а не отрезок без шага", () => {
    expect(blockScheduleSummary(item([]))).toEqual({ kind: "none" });
  });

  test("один отрезок — его шаг, без часов начала и конца", () => {
    const summary = blockScheduleSummary(
      item([{ from: "07:00", to: "11:00", everyMinutes: 120 }]),
    );

    expect(summary).toEqual({ kind: "every", everyMinutes: 120 });
    // Ради этого всё и затевалось: часы окна в сводку не попадают.
    expect(JSON.stringify(summary)).not.toContain("07:00");
  });

  test("несколько отрезков с одним шагом — одно утверждение, а не два", () => {
    expect(
      blockScheduleSummary(
        item([
          { from: "07:00", to: "11:00", everyMinutes: 120 },
          { from: "14:00", to: "18:00", everyMinutes: 120 },
        ]),
      ),
    ).toEqual({ kind: "every", everyMinutes: 120 });
  });

  test("разные шаги перечисляются по возрастанию и не схлопываются", () => {
    expect(
      blockScheduleSummary(
        item([
          { from: "14:00", to: "18:00", everyMinutes: 120 },
          { from: "07:00", to: "11:00", everyMinutes: 60 },
          { from: "19:00", to: "22:00", everyMinutes: 120 },
        ]),
      ),
    ).toEqual({ kind: "mixed", steps: [60, 120] });
  });
});
