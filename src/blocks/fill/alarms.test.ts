import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { alarms, getDb } from "@/blocks/data";
import {
  createChecklist,
  createPublishedVersion,
  createStation,
  sampleSections,
} from "@/blocks/data/testing/fixtures";

import { ALARM_LIMITS } from "./alarm-limits";
import {
  dropAlarm,
  listAlarms,
  parseAlarmInput,
  parseAlarmRemoval,
  setAlarm,
} from "./alarms";
import { FILL_LIMITS, forgetAllFillHits } from "./rate-limit";

// Полночь в Токио на девять часов раньше UTC: в 23:00 UTC там уже наступило следующее
// местное число. Пояс без перехода на летнее время выбран намеренно — иначе тест
// проверял бы ещё и смену времени, а проверяет он часовой пояс пиццерии.
const TOKYO = "Asia/Tokyo";
const NOW = new Date("2026-09-16T23:00:00Z"); // Токио: 17 сентября, 08:00

/**
 * Ночная пиццерия: чек-лист работает с 22:00 до 02:00, то есть его окно переходит через
 * полночь. Пояс UTC, поэтому местное время станции равно отметке прогона и читается
 * прямо из строки.
 *
 * Ради этой станции задача и заведена (D090): проход окна длиннее местных суток, и
 * будильник обязан жить до конца окна, а не до полуночи.
 */
const NIGHT_WINDOW = { start: "22:00:00", end: "02:00:00" } as const;
const BEFORE_MIDNIGHT = new Date("2026-09-16T23:40:00Z");
const AFTER_MIDNIGHT = new Date("2026-09-17T00:10:00Z");
const AFTER_WINDOW = new Date("2026-09-17T02:05:00Z");

beforeEach(() => {
  forgetAllFillHits();
});

/**
 * Станция с открытым чек-листом: без него будильник ставить некуда — предел его жизни
 * считается по окну работы чек-листа (D090). Окно по умолчанию дневное, 06:00–12:00,
 * и в него попадает `NOW` у токийской пиццерии.
 */
async function station(
  timezone: string,
  window?: { readonly start: string; readonly end: string },
): Promise<{
  code: string;
  stationId: string;
}> {
  const fixture = await createStation({ timezone });
  const checklistId = await createChecklist({
    stationId: fixture.stationId,
    ...(window === undefined
      ? {}
      : { windowStart: window.start, windowEnd: window.end }),
  });
  await createPublishedVersion(checklistId, sampleSections("будильники"));
  return { code: fixture.stationCode, stationId: fixture.stationId };
}

/** Станция, которой заполнять сейчас нечего: ни одного открытого чек-листа. */
async function stationWithoutChecklist(): Promise<{ code: string }> {
  const fixture = await createStation({ timezone: TOKYO });
  return { code: fixture.stationCode };
}

describe("parseAlarmInput — форма тела на границе", () => {
  const good = { code: "abc123", atLocalTime: "09:30", label: "вынести тесто" };

  it("принимает целое тело и обрезает пробелы вокруг подписи", () => {
    const parsed = parseAlarmInput({ ...good, label: "  вынести тесто  " });
    expect(parsed).toStrictEqual({
      ok: true,
      value: { code: "abc123", atLocalTime: "09:30", label: "вынести тесто" },
    });
  });

  it.each([
    ["не объект", null],
    ["строка вместо тела", "09:30"],
    ["массив вместо тела", []],
  ])("отбивает %s", (_name, input) => {
    expect(parseAlarmInput(input)).toStrictEqual({
      ok: false,
      reason: "malformed",
    });
  });

  it.each([
    ["час за пределами суток", "24:00"],
    ["минуты за пределами часа", "09:60"],
    ["час без ведущего нуля", "9:30"],
    ["минуты одной цифрой", "09:3"],
    ["секунды лишние", "09:30:00"],
    ["пусто", ""],
    ["не время вовсе", "утром"],
  ])("отбивает время: %s", (_name, atLocalTime) => {
    expect(parseAlarmInput({ ...good, atLocalTime })).toStrictEqual({
      ok: false,
      reason: "malformed",
    });
  });

  it("отбивает пустую подпись и подпись из одних пробелов", () => {
    expect(parseAlarmInput({ ...good, label: "" })).toStrictEqual({
      ok: false,
      reason: "malformed",
    });
    expect(parseAlarmInput({ ...good, label: "   " })).toStrictEqual({
      ok: false,
      reason: "malformed",
    });
  });

  it("отбивает подпись длиннее предела", () => {
    const label = "я".repeat(ALARM_LIMITS.maxLabelLength + 1);
    expect(parseAlarmInput({ ...good, label })).toStrictEqual({
      ok: false,
      reason: "malformed",
    });
  });

  it("отбивает заведомо негодный код до похода в базу", () => {
    expect(parseAlarmInput({ ...good, code: "нет таких" })).toStrictEqual({
      ok: false,
      reason: "malformed",
    });
  });

  it("наружу выходит новый объект: полей входа в нём нет", () => {
    const parsed = parseAlarmInput({ ...good, лишнее: "поле" });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(Object.keys(parsed.value)).toStrictEqual([
      "code",
      "atLocalTime",
      "label",
    ]);
  });
});

describe("parseAlarmRemoval", () => {
  it("принимает код и опознаватель будильника", () => {
    const id = "6f1c9d2e-7b3a-4c5d-8e9f-0a1b2c3d4e5f";
    expect(parseAlarmRemoval({ code: "abc123", alarmId: id })).toStrictEqual({
      ok: true,
      value: { code: "abc123", alarmId: id },
    });
  });

  it("отбивает опознаватель не того вида", () => {
    expect(
      parseAlarmRemoval({ code: "abc123", alarmId: "не-uuid" }),
    ).toStrictEqual({ ok: false, reason: "malformed" });
  });
});

describe("setAlarm — заведение будильника", () => {
  it("заводит будильник в часы чек-листа и отдаёт список станции", async () => {
    const { code } = await station(TOKYO);

    const outcome = await setAlarm(
      { code, atLocalTime: "09:30", label: "вынести тесто" },
      NOW,
    );

    expect(outcome.kind).toBe("alarms");
    if (outcome.kind !== "alarms") return;
    expect(outcome.alarms).toHaveLength(1);
    const [alarm] = outcome.alarms;
    expect(alarm?.atLocalTime).toBe("09:30");
    expect(alarm?.label).toBe("вынести тесто");
    // 08:00 → 09:30 по местному времени пиццерии: полтора часа.
    expect(alarm?.ringsInSeconds).toBe(90 * 60);
  });

  it("миг звонка считает пояс пиццерии, а не сервер", async () => {
    const { code, stationId } = await station(TOKYO);

    await setAlarm({ code, atLocalTime: "09:30", label: "тесто" }, NOW);

    const [row] = await getDb()
      .select({ at: alarms.at })
      .from(alarms)
      .where(eq(alarms.stationId, stationId));
    // В UTC ещё 16 сентября 23:00, в Токио уже 17-е, 08:00. Токийские 09:30 —
    // это 00:30 UTC семнадцатого, а не девятое с половиной по часам сервера.
    expect(row?.at.toISOString()).toBe("2026-09-17T00:30:00.000Z");
  });

  it("прошедшее время внутри окна отвергается вслух", async () => {
    // Ночная станция в 23:40: 23:00 этого же прохода окна уже позади. Молча уехать
    // на завтра такой будильник не имеет права — владелец выбрал отказ (D090).
    const { code } = await station("UTC", NIGHT_WINDOW);

    expect(
      await setAlarm(
        { code, atLocalTime: "23:00", label: "тесто" },
        BEFORE_MIDNIGHT,
      ),
    ).toStrictEqual({
      kind: "refused",
      reason: "past-time",
      retryAfterSeconds: 0,
    });
  });

  it("текущая минута прошедшей не считается только вперёд", async () => {
    const { code } = await station("UTC", NIGHT_WINDOW);
    // 23:40 ровно: та же минута уже наступила, будильник на неё бессмыслен.
    expect(
      await setAlarm(
        { code, atLocalTime: "23:40", label: "тесто" },
        BEFORE_MIDNIGHT,
      ),
    ).toStrictEqual({
      kind: "refused",
      reason: "past-time",
      retryAfterSeconds: 0,
    });
    expect(
      (
        await setAlarm(
          { code, atLocalTime: "23:41", label: "тесто" },
          BEFORE_MIDNIGHT,
        )
      ).kind,
    ).toBe("alarms");
  });

  it("окно через полночь принимает время после полуночи", async () => {
    // Тот самый случай, ради которого будильник и заводят: в 23:40 поставить на 00:30.
    const { code } = await station("UTC", NIGHT_WINDOW);

    const outcome = await setAlarm(
      { code, atLocalTime: "00:30", label: "вынести тесто" },
      BEFORE_MIDNIGHT,
    );

    expect(outcome.kind).toBe("alarms");
    if (outcome.kind !== "alarms") return;
    const [alarm] = outcome.alarms;
    expect(alarm?.atLocalTime).toBe("00:30");
    // 23:40 → 00:30 следующих суток: пятьдесят минут.
    expect(alarm?.ringsInSeconds).toBe(50 * 60);
  });

  it("после полуночи окно принимает время до своего конца", async () => {
    const { code } = await station("UTC", NIGHT_WINDOW);

    expect(
      (
        await setAlarm(
          { code, atLocalTime: "01:00", label: "тесто" },
          AFTER_MIDNIGHT,
        )
      ).kind,
    ).toBe("alarms");
  });

  it("время вне окна чек-листа не принимается", async () => {
    const night = await station("UTC", NIGHT_WINDOW);
    const day = await station(TOKYO);

    // Ночная станция в 23:40: 21:00 — до начала окна, 03:00 — после его конца.
    expect(
      await setAlarm(
        { code: night.code, atLocalTime: "21:00", label: "тесто" },
        BEFORE_MIDNIGHT,
      ),
    ).toStrictEqual({
      kind: "refused",
      reason: "outside-window",
      retryAfterSeconds: 0,
    });
    expect(
      (
        await setAlarm(
          { code: night.code, atLocalTime: "03:00", label: "тесто" },
          AFTER_MIDNIGHT,
        )
      ).kind,
    ).toBe("refused");
    // Дневная станция 06:00–12:00: 13:00 за концом окна.
    expect(
      await setAlarm(
        { code: day.code, atLocalTime: "13:00", label: "тесто" },
        NOW,
      ),
    ).toStrictEqual({
      kind: "refused",
      reason: "outside-window",
      retryAfterSeconds: 0,
    });
  });

  it("станции без открытого чек-листа будильник не заводится", async () => {
    const { code } = await stationWithoutChecklist();

    expect(
      await setAlarm({ code, atLocalTime: "09:30", label: "тесто" }, NOW),
    ).toStrictEqual({
      kind: "refused",
      reason: "outside-window",
      retryAfterSeconds: 0,
    });
  });

  it("неизвестный код отказывает так же, как всюду на этом экране", async () => {
    expect(
      await setAlarm(
        { code: "d3adb33fd3adb33f", atLocalTime: "09:30", label: "тесто" },
        NOW,
      ),
    ).toStrictEqual({
      kind: "refused",
      reason: "unknown-code",
      retryAfterSeconds: 0,
    });
  });

  it("больше предела на проход окна не заводится", async () => {
    const { code } = await station(TOKYO);

    for (
      let minute = 0;
      minute < ALARM_LIMITS.maxPerStationPerWindow;
      minute++
    ) {
      const outcome = await setAlarm(
        {
          code,
          atLocalTime: `10:${String(minute).padStart(2, "0")}`,
          label: `записка ${String(minute)}`,
        },
        NOW,
      );
      expect(outcome.kind).toBe("alarms");
    }

    expect(
      await setAlarm({ code, atLocalTime: "11:59", label: "лишний" }, NOW),
    ).toStrictEqual({
      kind: "refused",
      reason: "too-many",
      retryAfterSeconds: 0,
    });
  });

  it("частота ограничена, и отказ говорит, через сколько повторить", async () => {
    const { code } = await station(TOKYO);

    for (let hit = 0; hit < FILL_LIMITS.alarmPerCode.maxHits; hit++) {
      await setAlarm(
        { code, atLocalTime: "09:30", label: "тесто" },
        new Date(NOW.getTime() + hit),
      );
    }

    const refused = await setAlarm(
      { code, atLocalTime: "09:31", label: "тесто" },
      NOW,
    );
    expect(refused.kind).toBe("refused");
    if (refused.kind !== "refused") return;
    expect(refused.reason).toBe("rate-limited");
    expect(refused.retryAfterSeconds).toBeGreaterThan(0);
  });
});

describe("listAlarms — что видит экран станции", () => {
  it("отдаёт будильники по времени звонка", async () => {
    const { code } = await station(TOKYO);
    await setAlarm({ code, atLocalTime: "11:00", label: "позже" }, NOW);
    await setAlarm({ code, atLocalTime: "09:30", label: "раньше" }, NOW);

    expect((await listAlarms(code, NOW)).map((alarm) => alarm.label)).toEqual([
      "раньше",
      "позже",
    ]);
  });

  it("будильники прошлого прохода окна не показываются", async () => {
    const { code, stationId } = await station(TOKYO);
    // Вчерашние токийские 10:00 — прошлый проход того же окна 06:00–12:00.
    await getDb()
      .insert(alarms)
      .values({
        stationId,
        at: new Date("2026-09-16T01:00:00Z"),
        label: "вчерашняя записка",
      });

    expect(await listAlarms(code, NOW)).toStrictEqual([]);
  });

  it("будильник за полночь виден и после полуночи, и до конца окна", async () => {
    // Подводный камень задачи: запись принадлежит уже СЛЕДУЮЩИМ местным суткам, и
    // выборка «на сегодня» теряла бы её ровно в 00:00 — будильник не прозвонил бы.
    const { code } = await station("UTC", NIGHT_WINDOW);
    await setAlarm(
      { code, atLocalTime: "00:30", label: "вынести тесто" },
      BEFORE_MIDNIGHT,
    );

    const beforeMidnight = await listAlarms(code, BEFORE_MIDNIGHT);
    expect(beforeMidnight.map((alarm) => alarm.label)).toEqual([
      "вынести тесто",
    ]);

    const afterMidnight = await listAlarms(code, AFTER_MIDNIGHT);
    expect(afterMidnight.map((alarm) => alarm.label)).toEqual([
      "вынести тесто",
    ]);
    // Двадцать минут до звонка: отсчёт идёт от сервера, а не от часов планшета.
    expect(afterMidnight[0]?.ringsInSeconds).toBe(20 * 60);
  });

  it("после конца окна будильники не показываются", async () => {
    const { code } = await station("UTC", NIGHT_WINDOW);
    await setAlarm(
      { code, atLocalTime: "01:00", label: "вынести тесто" },
      BEFORE_MIDNIGHT,
    );

    expect(await listAlarms(code, AFTER_WINDOW)).toStrictEqual([]);
  });

  it("будильники чужой станции по этому коду не отдаются", async () => {
    const mine = await station(TOKYO);
    const alien = await station(TOKYO);
    await setAlarm(
      { code: alien.code, atLocalTime: "09:30", label: "чужая записка" },
      NOW,
    );

    expect(await listAlarms(mine.code, NOW)).toStrictEqual([]);
  });

  it("неизвестный код не отдаёт ничего", async () => {
    expect(await listAlarms("d3adb33fd3adb33f", NOW)).toStrictEqual([]);
  });

  it("отсчёт до звонка отрицательный, когда момент уже прошёл", async () => {
    const { code } = await station(TOKYO);
    await setAlarm({ code, atLocalTime: "09:30", label: "тесто" }, NOW);

    // Планшет перезагрузился и открыл экран в 10:00 по местному времени.
    const later = new Date(NOW.getTime() + 2 * 60 * 60 * 1000);
    const [alarm] = await listAlarms(code, later);
    expect(alarm?.ringsInSeconds).toBe(-30 * 60);
  });
});

describe("dropAlarm — снятие будильника", () => {
  it("снимает свой будильник и отдаёт оставшиеся", async () => {
    const { code } = await station(TOKYO);
    await setAlarm({ code, atLocalTime: "09:30", label: "первая" }, NOW);
    await setAlarm({ code, atLocalTime: "11:00", label: "вторая" }, NOW);
    const [first] = await listAlarms(code, NOW);

    const outcome = await dropAlarm(
      { code, alarmId: first?.id ?? "" },
      new Date(NOW.getTime() + 1000),
    );

    expect(outcome.kind).toBe("alarms");
    if (outcome.kind !== "alarms") return;
    expect(outcome.alarms.map((alarm) => alarm.label)).toEqual(["вторая"]);
  });

  it("чужой будильник этим кодом не снимается", async () => {
    const mine = await station(TOKYO);
    const alien = await station(TOKYO);
    await setAlarm(
      { code: alien.code, atLocalTime: "09:30", label: "чужая записка" },
      NOW,
    );
    const [victim] = await listAlarms(alien.code, NOW);

    await dropAlarm(
      { code: mine.code, alarmId: victim?.id ?? "" },
      new Date(NOW.getTime() + 1000),
    );

    expect((await listAlarms(alien.code, NOW)).map((a) => a.label)).toEqual([
      "чужая записка",
    ]);
  });

  it("снятие несуществующего будильника отвечает так же, как снятие своего", async () => {
    const { code } = await station(TOKYO);
    await setAlarm({ code, atLocalTime: "09:30", label: "остаётся" }, NOW);

    const outcome = await dropAlarm(
      { code, alarmId: "6f1c9d2e-7b3a-4c5d-8e9f-0a1b2c3d4e5f" },
      new Date(NOW.getTime() + 1000),
    );

    expect(outcome.kind).toBe("alarms");
    if (outcome.kind !== "alarms") return;
    expect(outcome.alarms.map((alarm) => alarm.label)).toEqual(["остаётся"]);
  });

  it("неизвестный код не снимает ничего и отказывает", async () => {
    expect(
      await dropAlarm(
        {
          code: "d3adb33fd3adb33f",
          alarmId: "6f1c9d2e-7b3a-4c5d-8e9f-0a1b2c3d4e5f",
        },
        NOW,
      ),
    ).toStrictEqual({
      kind: "refused",
      reason: "unknown-code",
      retryAfterSeconds: 0,
    });
  });
});
