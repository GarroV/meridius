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

/** Второй открытый чек-лист той же станции: их у станции бывает несколько разом. */
async function addChecklist(
  stationId: string,
  window: { readonly start: string; readonly end: string },
): Promise<void> {
  const checklistId = await createChecklist({
    stationId,
    windowStart: window.start,
    windowEnd: window.end,
  });
  await createPublishedVersion(checklistId, sampleSections("второй"));
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
    // Отказ называет ровно те часы, по которым и решает: иначе сотрудник читает
    // на экране одну границу, а упирается в другую.
    expect(
      await setAlarm(
        { code: night.code, atLocalTime: "21:00", label: "тесто" },
        BEFORE_MIDNIGHT,
      ),
    ).toStrictEqual({
      kind: "refused",
      reason: "outside-window",
      retryAfterSeconds: 0,
      hours: "22:00–02:00",
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
      hours: "06:00–12:00",
    });
  });

  it("при нескольких открытых чек-листах отказ называет ту границу, по которой и решает", async () => {
    // Штатный случай, а не экзотика: обход идёт весь день поверх открытия смены.
    // Граница берётся по объединению открытых окон — значит и названа должна быть она,
    // иначе сотрудник читает в шапке 06:00–12:00, ставит на 15:00 и молча попадает.
    const { code, stationId } = await station(TOKYO);
    await addChecklist(stationId, { start: "07:00:00", end: "20:00:00" });

    // 15:00 за концом первого окна, но внутри объединения — принимается.
    expect(
      (await setAlarm({ code, atLocalTime: "15:00", label: "тесто" }, NOW))
        .kind,
    ).toBe("alarms");

    // 21:00 за пределами объединения — отказ, и часы в нём те же самые.
    expect(
      await setAlarm({ code, atLocalTime: "21:00", label: "тесто" }, NOW),
    ).toStrictEqual({
      kind: "refused",
      reason: "outside-window",
      retryAfterSeconds: 0,
      hours: "06:00–20:00",
    });
  });

  it("станции без открытого чек-листа будильник не заводится, и часов в отказе нет", async () => {
    const { code } = await stationWithoutChecklist();

    // Часов в отказе нет намеренно: называть нечего, и выдумывать их — то же враньё,
    // что назвать не ту границу. Экран на этом месте говорит другое.
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

/**
 * Перевод часов (T162, issue #72).
 *
 * Границы прохода окна и миг звонка считает база: местная отметка переводится в момент
 * времени через `at time zone`. В ночь перевода такая отметка либо НЕ СУЩЕСТВУЕТ (часы
 * прыгают вперёд), либо случается ДВАЖДЫ (часы отводят назад), и PostgreSQL молча
 * возвращает один момент — без отказа и без предупреждения. До миграции 0009 сюда
 * приводился реальный существующий момент, и неоднозначным это не бывало; после неё
 * дыра осталась непокрытой, а прежний тест честно объявлял пояс без перевода выбранным
 * намеренно — то есть дыра была не спрятана, а просто не закрыта.
 *
 * Берлин, 2026 год: 29 марта в 02:00 часы прыгают на 03:00 (02:00–02:59 не существует),
 * 25 октября в 03:00 отводятся на 02:00 (02:00–02:59 идёт дважды).
 *
 * ПОВЕДЕНИЕ ПРИЗНАНО ВЕРНЫМ, и проверки закрепляют именно его, а не чинят. Держится оно
 * на одном обещании продукта: время, НАПИСАННОЕ НА ЭКРАНЕ, — это время, в которое
 * будильник действительно прозвонит, а отсчёт до звонка идёт настоящими секундами с
 * сервера. Обещания «прозвонит ровно тогда, когда вы набрали» продукт не давал и дать
 * не может: в весеннюю ночь набранного часа не существует вовсе.
 */
const BERLIN = "Europe/Berlin";
/** Ночное окно с запасом по обе стороны перехода. */
const DST_WINDOW = { start: "22:00:00", end: "06:00:00" } as const;

describe("перевод часов: весенняя ночь, когда часа не существует", () => {
  // 29 марта 2026, 00:30 по Берлину (ещё CET, +1): до прыжка полтора часа.
  const NIGHT = new Date("2026-03-28T23:30:00Z");

  it("несуществующее время принимается, но на экране стоит тот час, когда прозвонит", async () => {
    const { code } = await station(BERLIN, DST_WINDOW);

    const outcome = await setAlarm(
      { code, atLocalTime: "02:30", label: "вынести тесто" },
      NIGHT,
    );

    expect(outcome.kind).toBe("alarms");
    if (outcome.kind !== "alarms") return;
    const [alarm] = outcome.alarms;
    // Набрано 02:30 — часа, которого этой ночью нет. На экране 03:30: это тот же миг,
    // и это единственный честный ответ. Показать «02:30» значило бы назвать время,
    // которого на часах станции не будет, а отказать — отобрать записку из-за суток,
    // которые сотрудник не выбирал.
    expect(alarm?.atLocalTime).toBe("03:30");
    // Два НАСТОЯЩИХ часа от 00:30: полтора часа до прыжка и полчаса после него.
    expect(alarm?.ringsInSeconds).toBe(2 * 60 * 60);
  });

  it("миг звонка хранится реальным, а не выдуманным", async () => {
    const { code, stationId } = await station(BERLIN, DST_WINDOW);

    await setAlarm({ code, atLocalTime: "02:30", label: "тесто" }, NIGHT);

    const [row] = await getDb()
      .select({ at: alarms.at })
      .from(alarms)
      .where(eq(alarms.stationId, stationId));
    // 03:30 CEST (+2) — это 01:30 UTC. Строка в базе совпадает с тем, что на экране.
    expect(row?.at.toISOString()).toBe("2026-03-29T01:30:00.000Z");
  });

  it("время по обе стороны прыжка работает как обычно", async () => {
    const { code } = await station(BERLIN, DST_WINDOW);

    const before = await setAlarm(
      { code, atLocalTime: "01:30", label: "до прыжка" },
      NIGHT,
    );
    const after = await setAlarm(
      { code, atLocalTime: "04:00", label: "после прыжка" },
      NIGHT,
    );

    expect(before.kind).toBe("alarms");
    expect(after.kind).toBe("alarms");
    if (after.kind !== "alarms") return;
    const times = after.alarms.map((alarm) => alarm.atLocalTime);
    expect(times).toEqual(["01:30", "04:00"]);
    const [early, late] = after.alarms;
    // 00:30 → 01:30 — час настоящих секунд, перевод сюда не достаёт.
    expect(early?.ringsInSeconds).toBe(60 * 60);
    // 00:30 → 04:00 по часам три с половиной, по секундам — два с половиной.
    expect(late?.ringsInSeconds).toBe(Math.round(2.5 * 60 * 60));
  });

  it("проход окна короче своих часов ровно на потерянный час", async () => {
    const { code } = await station(BERLIN, DST_WINDOW);

    // Окно 22:00–06:00 в эту ночь длится семь настоящих часов, а не восемь: конец
    // прохода наступает раньше. Проверяется через отказ, называющий часы окна, —
    // границы наружу не отдаются, а решает по ним именно он.
    expect(
      await setAlarm({ code, atLocalTime: "07:00", label: "мимо окна" }, NIGHT),
    ).toStrictEqual({
      kind: "refused",
      reason: "outside-window",
      retryAfterSeconds: 0,
      hours: "22:00–06:00",
    });
  });
});

describe("перевод часов: осенняя ночь, когда час случается дважды", () => {
  // 25 октября 2026, 01:30 по Берлину (ещё CEST, +2): до отвода полтора часа.
  const NIGHT = new Date("2026-10-24T23:30:00Z");

  it("неоднозначное время берётся ВТОРЫМ разом, и отсчёт это честно показывает", async () => {
    const { code } = await station(BERLIN, DST_WINDOW);

    const outcome = await setAlarm(
      { code, atLocalTime: "02:30", label: "вынести тесто" },
      NIGHT,
    );

    expect(outcome.kind).toBe("alarms");
    if (outcome.kind !== "alarms") return;
    const [alarm] = outcome.alarms;
    // На часах станции действительно будет 02:30 — просто во второй раз за ночь.
    expect(alarm?.atLocalTime).toBe("02:30");
    // И это ДВА настоящих часа, а не один: полтора до отвода и полчаса после. Отсчёт
    // уходит в браузер секундами с сервера (а не мигом времени), поэтому на планшете
    // видно настоящее ожидание, а не разницу по циферблату.
    expect(alarm?.ringsInSeconds).toBe(2 * 60 * 60);
  });

  it("миг звонка — второй из двух, и он лежит в базе именно таким", async () => {
    const { code, stationId } = await station(BERLIN, DST_WINDOW);

    await setAlarm({ code, atLocalTime: "02:30", label: "тесто" }, NIGHT);

    const [row] = await getDb()
      .select({ at: alarms.at })
      .from(alarms)
      .where(eq(alarms.stationId, stationId));
    // Первый раз 02:30 наступает в 00:30 UTC (ещё CEST, +2), второй — в 01:30 UTC
    // (уже CET, +1). Выбран второй.
    expect(row?.at.toISOString()).toBe("2026-10-25T01:30:00.000Z");
  });

  it("время, уже прошедшее ОБА раза, отвергается вслух, а не уезжает в завтра", async () => {
    const { code } = await station(BERLIN, DST_WINDOW);
    // 03:30 по Берлину уже после отвода: это 02:30 UTC. Оба 02:30 позади.
    const afterBoth = new Date("2026-10-25T02:30:00Z");

    expect(
      await setAlarm(
        { code, atLocalTime: "02:30", label: "опоздавший" },
        afterBoth,
      ),
    ).toStrictEqual({
      kind: "refused",
      reason: "past-time",
      retryAfterSeconds: 0,
    });
  });

  it("проход окна длиннее своих часов ровно на повторённый час", async () => {
    const { code } = await station(BERLIN, DST_WINDOW);
    // Окно 22:00–06:00 в эту ночь длится девять настоящих часов. Конец прохода —
    // 06:00 уже по CET, то есть 05:00 UTC; будильник на 05:30 в него попадает.
    const outcome = await setAlarm(
      { code, atLocalTime: "05:30", label: "перед закрытием" },
      NIGHT,
    );

    expect(outcome.kind).toBe("alarms");
    if (outcome.kind !== "alarms") return;
    const [alarm] = outcome.alarms;
    // 01:30 CEST → 05:30 CET: по циферблату четыре часа, по секундам пять.
    expect(alarm?.ringsInSeconds).toBe(5 * 60 * 60);
  });
});
