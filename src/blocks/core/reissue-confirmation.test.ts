// Общее правило перевыпуска: один экран его не переопределяет.
//
// Проверяется именно развилка, а не адреса: адреса каждый экран строит свои и
// проверяет у себя (`catalog/ui/outcomes.test.ts`, `qr/ui/outcomes.test.ts`), а
// здесь — то единственное, что обязано совпасть на обоих: без подтверждения из
// решения нельзя достать ни станцию, ни адрес печати, то есть перевыпускать нечего.
import { describe, expect, test } from "vitest";

import { decideReissue } from "./reissue-confirmation";

const STATION = "33333333-3333-3333-3333-333333333333";

/** Состояние экрана — здесь любое: правило о нём ничего не знает, только переносит. */
interface Place {
  readonly where: string;
}
const ASK: Place = { where: "ask" };
const FAIL: Place = { where: "fail" };

const REQUEST = {
  stationId: STATION,
  ask: ASK,
  doneHref: "/admin/qr?store=s&station=t",
  fail: FAIL,
} as const;

describe("подтверждение перевыпуска кода станции", () => {
  test("без подтверждения решение только спрашивает", () => {
    const decision = decideReissue({ ...REQUEST, confirmed: false });

    expect(
      decision.kind,
      "Неподтверждённый запрос дошёл до перевыпуска: экран сменил бы код станции " +
        "с одного нажатия, и все напечатанные наклейки умерли бы.",
    ).toBe("confirm");
    // Проверяется не поле, а недоступность станции: раз решение не «reissue»,
    // взять из него нечего — перевыпускать действию не с чем даже по ошибке.
    expect(decision).toEqual({ kind: "confirm", view: ASK });
  });

  test("подтверждённый запрос несёт станцию, печать и место возврата", () => {
    const decision = decideReissue({ ...REQUEST, confirmed: true });

    expect(decision).toEqual({
      kind: "reissue",
      stationId: STATION,
      doneHref: REQUEST.doneHref,
      failView: FAIL,
    });
  });
});
