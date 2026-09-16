import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { alarms, getDb } from "@/blocks/data";
import { createStation } from "@/blocks/data/testing/fixtures";

import {
  ALARM_LIMITS,
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

beforeEach(() => {
  forgetAllFillHits();
});

async function station(timezone: string): Promise<{
  code: string;
  stationId: string;
}> {
  const fixture = await createStation({ timezone });
  return { code: fixture.stationCode, stationId: fixture.stationId };
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
  it("записывает будильник на местные сутки станции и отдаёт список", async () => {
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

  it("местные сутки считает пояс пиццерии, а не сервер", async () => {
    const { code, stationId } = await station(TOKYO);

    await setAlarm({ code, atLocalTime: "09:30", label: "тесто" }, NOW);

    const [row] = await getDb()
      .select({ localDate: alarms.localDate })
      .from(alarms)
      .where(eq(alarms.stationId, stationId));
    // В UTC ещё 16 сентября, в Токио уже 17-е. Сутки будильника — токийские.
    expect(row?.localDate).toBe("2026-09-17");
  });

  it("время, которое сегодня уже прошло, не принимается", async () => {
    // Та же минута и та же подпись, но пиццерия в UTC: там 16 сентября 23:00,
    // и 09:30 сегодня уже позади.
    const { code } = await station("UTC");

    expect(
      await setAlarm({ code, atLocalTime: "09:30", label: "тесто" }, NOW),
    ).toStrictEqual({
      kind: "refused",
      reason: "past-time",
      retryAfterSeconds: 0,
    });
  });

  it("текущая минута прошедшей не считается только вперёд", async () => {
    const { code } = await station("UTC");
    // 23:00 UTC ровно: та же минута уже наступила, будильник на неё бессмыслен.
    expect(
      await setAlarm({ code, atLocalTime: "23:00", label: "тесто" }, NOW),
    ).toStrictEqual({
      kind: "refused",
      reason: "past-time",
      retryAfterSeconds: 0,
    });
    expect(
      (await setAlarm({ code, atLocalTime: "23:01", label: "тесто" }, NOW))
        .kind,
    ).toBe("alarms");
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

  it("больше предела за сутки не заводится", async () => {
    const { code } = await station(TOKYO);

    for (let minute = 0; minute < ALARM_LIMITS.maxPerStationPerDay; minute++) {
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
      await setAlarm({ code, atLocalTime: "23:59", label: "лишний" }, NOW),
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

  it("вчерашние будильники сегодня не показываются", async () => {
    const { code, stationId } = await station(TOKYO);
    await getDb()
      .insert(alarms)
      .values({
        stationId,
        localDate: "2026-09-16",
        at: new Date("2026-09-16T01:00:00Z"),
        label: "вчерашняя записка",
      });

    expect(await listAlarms(code, NOW)).toStrictEqual([]);
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
