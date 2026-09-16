// Приём выбора режима смены с публичной ссылки: разбор входа и границы.
// Тело действия вызывает кто угодно, а не только наш экран, — поэтому проверяется
// здесь, на границе, ровно как у отправки заполнения.
import { beforeEach, describe, expect, test } from "vitest";

import { getShiftMode } from "@/blocks/data";
import {
  createStation,
  uniqueStationCode,
} from "@/blocks/data/testing/fixtures";

import { FILL_LIMITS, forgetAllFillHits } from "./rate-limit";
import { chooseShiftMode, parseShiftModeChoice } from "./shift-mode";

beforeEach(forgetAllFillHits);

const CODE = "ABCDEF";

describe("parseShiftModeChoice", () => {
  test("принимает выбор без сведений о людях", () => {
    const parsed = parseShiftModeChoice({ code: CODE, mode: "reduced" });

    expect(parsed).toStrictEqual({
      ok: true,
      value: {
        code: CODE,
        mode: "reduced",
        staffPresent: undefined,
        staffExpected: undefined,
      },
    });
  });

  test("принимает причину сокращения числами", () => {
    const parsed = parseShiftModeChoice({
      code: CODE,
      mode: "critical",
      staffPresent: 2,
      staffExpected: 4,
    });

    expect(parsed).toMatchObject({
      ok: true,
      value: { staffPresent: 2, staffExpected: 4 },
    });
  });

  test("числа приходят из формы строками и становятся числами", () => {
    const parsed = parseShiftModeChoice({
      code: CODE,
      mode: "reduced",
      staffPresent: "2",
      staffExpected: "4",
    });

    expect(parsed).toMatchObject({
      ok: true,
      value: { staffPresent: 2, staffExpected: 4 },
    });
  });

  test("неизвестный режим не проходит", () => {
    for (const mode of ["", "NORMAL", "major", "полная", null, 1]) {
      expect(parseShiftModeChoice({ code: CODE, mode })).toStrictEqual({
        ok: false,
        reason: "malformed",
      });
    }
  });

  test("тело не той формы не проходит", () => {
    for (const input of [null, undefined, "reduced", 1, [], {}]) {
      expect(parseShiftModeChoice(input)).toStrictEqual({
        ok: false,
        reason: "malformed",
      });
    }
  });

  test("заведомо негодный код до базы не доходит", () => {
    expect(
      parseShiftModeChoice({ code: "не код!", mode: "reduced" }),
    ).toStrictEqual({ ok: false, reason: "malformed" });
  });

  test("мусор в числах людей отбрасывается, а не роняет выбор", () => {
    // Причина сокращения необязательна: испорченное число не должно мешать
    // менеджеру поставить режим — иначе кухня встанет из-за подписи.
    const parsed = parseShiftModeChoice({
      code: CODE,
      mode: "reduced",
      staffPresent: "две",
      staffExpected: -7,
    });

    expect(parsed).toMatchObject({
      ok: true,
      value: { staffPresent: undefined, staffExpected: undefined },
    });
  });

  test("неправдоподобно большое число людей отбрасывается", () => {
    const parsed = parseShiftModeChoice({
      code: CODE,
      mode: "reduced",
      staffPresent: 100_000,
    });

    expect(parsed).toMatchObject({
      ok: true,
      value: { staffPresent: undefined },
    });
  });
});

// Здесь проверяется уже вся функция, а не только разбор тела: поход в предел частоты
// и в базу, а не форма входа сама по себе (её покрывает `parseShiftModeChoice` выше).
describe("chooseShiftMode", () => {
  // Момент фиксированный: у фикстуры `createStation` часовой пояс по умолчанию UTC,
  // поэтому местная дата не гуляет между вызовами внутри одной проверки.
  const NOW = new Date("2026-09-17T08:00:00Z");

  test("режим ставится и виден тем же чтением, каким его читает экран станции", async () => {
    const station = await createStation();

    const outcome = await chooseShiftMode(
      { code: station.stationCode, mode: "reduced" },
      NOW,
    );

    expect(outcome).toStrictEqual({ kind: "set", mode: "reduced" });

    const state = await getShiftMode(station.storeId, NOW);
    expect(state).toMatchObject({ mode: "reduced", chosen: true });
  });

  test("числа смены доходят до записи как есть", async () => {
    const station = await createStation();

    await chooseShiftMode(
      {
        code: station.stationCode,
        mode: "reduced",
        staffPresent: 2,
        staffExpected: 4,
      },
      NOW,
    );

    const state = await getShiftMode(station.storeId, NOW);
    expect(state).toMatchObject({ staffPresent: 2, staffExpected: 4 });
  });

  test("те же числа приходят из формы строками — запись та же самая", async () => {
    // Браузер шлёт значения полей формы строками; довести их до записи неотличимо
    // от чисел — работа `parseStaff`, а не этой функции, но граница проверяется здесь.
    const station = await createStation();

    await chooseShiftMode(
      {
        code: station.stationCode,
        mode: "reduced",
        staffPresent: "2",
        staffExpected: "4",
      },
      NOW,
    );

    const state = await getShiftMode(station.storeId, NOW);
    expect(state).toMatchObject({ staffPresent: 2, staffExpected: 4 });
  });

  test("дробное число людей не роняет выбор режима — подпись необязательна", async () => {
    // Кухня не должна вставать из-за испорченной подписи: дробное значение
    // отбрасывается в `undefined`, а на месте числа в записи остаётся null.
    const station = await createStation();

    const outcome = await chooseShiftMode(
      { code: station.stationCode, mode: "reduced", staffPresent: 2.5 },
      NOW,
    );

    expect(outcome).toStrictEqual({ kind: "set", mode: "reduced" });
    const state = await getShiftMode(station.storeId, NOW);
    expect(state?.staffPresent).toBeNull();
  });

  test("код правдоподобной формы, но без такой станции — отказ unknown-code", async () => {
    const code = uniqueStationCode();

    const outcome = await chooseShiftMode({ code, mode: "reduced" }, NOW);

    expect(outcome).toStrictEqual({
      kind: "refused",
      reason: "unknown-code",
      retryAfterSeconds: 0,
    });
  });

  test("испорченное тело не трогает уже поставленный режим", async () => {
    const station = await createStation();
    // Заранее ставим режим, который отказ обязан оставить нетронутым.
    await chooseShiftMode(
      {
        code: station.stationCode,
        mode: "critical",
        staffPresent: 1,
        staffExpected: 5,
      },
      NOW,
    );

    const notAnObject = await chooseShiftMode("critical", NOW);
    expect(notAnObject).toStrictEqual({
      kind: "refused",
      reason: "malformed",
      retryAfterSeconds: 0,
    });

    const unknownMode = await chooseShiftMode(
      { code: station.stationCode, mode: "NORMAL" },
      NOW,
    );
    expect(unknownMode).toStrictEqual({
      kind: "refused",
      reason: "malformed",
      retryAfterSeconds: 0,
    });

    const state = await getShiftMode(station.storeId, NOW);
    expect(state).toMatchObject({
      mode: "critical",
      chosen: true,
      staffPresent: 1,
      staffExpected: 5,
    });
  });

  test("по одному коду ровно предел проходит, дальше — отказ по частоте", async () => {
    const station = await createStation();

    for (let hit = 0; hit < FILL_LIMITS.shiftModePerCode.maxHits; hit++) {
      const outcome = await chooseShiftMode(
        { code: station.stationCode, mode: "reduced" },
        NOW,
      );
      expect(outcome).toStrictEqual({ kind: "set", mode: "reduced" });
    }

    const refused = await chooseShiftMode(
      { code: station.stationCode, mode: "reduced" },
      NOW,
    );
    expect(refused.kind).toBe("refused");
    if (refused.kind !== "refused") return;
    expect(refused.reason).toBe("rate-limited");
    expect(refused.retryAfterSeconds).toBeGreaterThan(0);
  });

  test("предел частоты считается до похода в базу — его съедают и обращения с неизвестным кодом", async () => {
    // Код той же формы, что настоящий, но станции с ним нет: каждое обращение
    // доходит до "unknown-code", но ПЕРЕД этим проходит через счётчик частоты —
    // иначе перебор кодов не упирался бы вообще ни во что.
    const code = uniqueStationCode();

    for (let hit = 0; hit < FILL_LIMITS.shiftModePerCode.maxHits; hit++) {
      const outcome = await chooseShiftMode({ code, mode: "reduced" }, NOW);
      expect(outcome).toStrictEqual({
        kind: "refused",
        reason: "unknown-code",
        retryAfterSeconds: 0,
      });
    }

    const refused = await chooseShiftMode({ code, mode: "reduced" }, NOW);
    expect(refused.kind).toBe("refused");
    if (refused.kind !== "refused") return;
    expect(refused.reason).toBe("rate-limited");
    expect(refused.retryAfterSeconds).toBeGreaterThan(0);
  });

  test("предел считается по коду станции, а не на всю сеть сразу", async () => {
    // Ради этого счёт и ведётся по коду (а не только по общему пределу на всю сеть):
    // пересменка на одной станции не должна запирать соседнюю в ту же минуту.
    const busy = await createStation();
    const quiet = await createStation();

    for (let hit = 0; hit < FILL_LIMITS.shiftModePerCode.maxHits; hit++) {
      await chooseShiftMode({ code: busy.stationCode, mode: "reduced" }, NOW);
    }
    const busyRefused = await chooseShiftMode(
      { code: busy.stationCode, mode: "reduced" },
      NOW,
    );
    expect(busyRefused.kind).toBe("refused");

    const quietOutcome = await chooseShiftMode(
      { code: quiet.stationCode, mode: "reduced" },
      NOW,
    );
    expect(quietOutcome).toStrictEqual({ kind: "set", mode: "reduced" });
  });
});
