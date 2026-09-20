// Решение «спросить или перевыпустить» с листа печати (T266): та же развилка, что
// у справочника (`catalog/ui/outcomes.test.ts`), но со своими адресами — вопрос
// задаётся на самом листе, а удавшийся перевыпуск уводит на печать новой наклейки
// той же станции, а не обратно в дерево справочника.
import { describe, expect, test } from "vitest";

import { reissueOutcome } from "./outcomes";

const REQUEST = {
  storeId: "11111111-1111-4111-8111-111111111111",
  stationId: "22222222-2222-4222-8222-222222222222",
} as const;

describe("перевыпуск кода станции с листа печати", () => {
  test("без подтверждения экран уходит спрашивать про ту же станцию", () => {
    const outcome = reissueOutcome({ ...REQUEST, confirmed: false });

    expect(outcome.kind).toBe("confirm");
    if (outcome.kind !== "confirm") return;

    expect(outcome.view.confirm).toBe("reissue");
    expect(
      outcome.view.stationId,
      "Вопрос без имени станции ни о чём не спрашивает.",
    ).toBe(REQUEST.stationId);
    expect(outcome.view.storeId).toBe(REQUEST.storeId);
    expect(
      Object.keys(outcome),
      "Неподтверждённый запрос не должен нести адрес печати — иначе код станции " +
        "мог бы смениться, даже не спросив.",
    ).not.toContain("doneHref");
  });

  test("после подтверждения — станция и адрес печати новой наклейки", () => {
    const outcome = reissueOutcome({ ...REQUEST, confirmed: true });

    expect(outcome.kind).toBe("reissue");
    if (outcome.kind !== "reissue") return;

    expect(outcome.stationId).toBe(REQUEST.stationId);

    const url = new URL(outcome.doneHref, "https://example.test");
    expect(url.pathname).toBe("/admin/qr");
    expect(url.searchParams.get("store")).toBe(REQUEST.storeId);
    expect(
      url.searchParams.get("station"),
      "Печать обязана открыться на листе именно этой станции, а не первой попавшейся.",
    ).toBe(REQUEST.stationId);
    expect(
      url.searchParams.has("confirm"),
      "Удавшийся перевыпуск не должен снова открывать окно вопроса.",
    ).toBe(false);
    expect(
      outcome.failView,
      "Отказ перевыпуска обязан вернуть на тот же лист, а не увести пустым адресом.",
    ).toEqual({ storeId: REQUEST.storeId, stationId: REQUEST.stationId });
  });
});
