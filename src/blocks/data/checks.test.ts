// Отметки периодических проверок проверяются на настоящей базе: проход, местные сутки
// и часовой пояс считает PostgreSQL (D026), и заглушкой этого не проверить.
//
// Главное правило здесь — D066: отметка всегда встаёт в ТЕКУЩИЙ проход. Пропущенные
// проходы остаются пропущенными, нигде не хранятся и выводятся из расписания при чтении.
import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, describe, expect, test } from "vitest";

import { getRounds, saveCheck, windowStartMinutes } from "./checks";
import type { ItemRounds, RoundInterval } from "./checks";
import { checklistVersions } from "./schema";
import { setShiftMode } from "./shift-modes";
import { closeTestDb, getTestDb } from "./testing/db";
import {
  createChecklist,
  createDraft,
  createPublishedVersion,
  createStation,
} from "./testing/fixtures";
import type { StationFixture } from "./testing/fixtures";
import type { ScheduleSegment, Section, Severity } from "./types";

const db = getTestDb();

afterAll(closeTestDb);

const every = (
  from: string,
  to: string,
  everyMinutes: number,
): ScheduleSegment => ({ from, to, everyMinutes });

/** Секция с одним периодическим пунктом: больше для этих проверок не нужно. */
function roundSections(
  itemId: string,
  schedule: ScheduleSegment[],
  severity: Severity,
): Section[] {
  return [
    {
      id: `section-${itemId}`,
      title: { ru: "Обходы", en: "Rounds" },
      source: "own",
      items: [
        {
          id: itemId,
          title: { ru: "Линия начинения", en: "Toppings line" },
          type: "bool",
          severity,
          schedule,
        },
      ],
    },
  ];
}

interface RoundFixture {
  station: StationFixture;
  checklistId: string;
  versionId: string;
  itemId: string;
}

interface RoundOptions {
  schedule: ScheduleSegment[];
  windowStart?: string;
  windowEnd?: string;
  timezone?: string;
  severity?: Severity;
  itemId?: string;
}

/** Пиццерия → станция → чек-лист с окном → опубликованная версия с одним обходом. */
async function roundChecklist(options: RoundOptions): Promise<RoundFixture> {
  const station = await createStation({ timezone: options.timezone ?? "UTC" });
  const checklistId = await createChecklist({
    stationId: station.stationId,
    windowStart: options.windowStart ?? "08:00:00",
    windowEnd: options.windowEnd ?? "23:00:00",
  });
  const itemId = options.itemId ?? `round-${randomUUID()}`;
  const versionId = await createPublishedVersion(
    checklistId,
    roundSections(itemId, options.schedule, options.severity ?? "critical"),
  );
  return { station, checklistId, versionId, itemId };
}

/** Ровно один элемент: индексация списка в тестах прячет «пришло не то, что ждали». */
function only<T>(values: readonly T[], what: string): T {
  const [first] = values;
  if (first === undefined || values.length !== 1) {
    throw new Error(
      `Ожидался ровно один ${what}, получено ${String(values.length)}`,
    );
  }
  return first;
}

async function roundsOf(versionId: string, at: Date): Promise<ItemRounds> {
  const view = await getRounds(versionId, at);
  if (view === null) {
    throw new Error(`Чек-лист ${versionId} на ${at.toISOString()} закрыт`);
  }
  return only(view.items, "периодический пункт");
}

function intervalAt(rounds: ItemRounds, localTime: string): RoundInterval {
  const found = rounds.intervals.find(
    (interval) => interval.startLocalTime === localTime,
  );
  if (found === undefined) {
    throw new Error(
      `Прохода на ${localTime} нет; есть ${rounds.intervals.map((i) => i.startLocalTime).join(", ")}`,
    );
  }
  return found;
}

const stateAt = (rounds: ItemRounds, localTime: string): string =>
  intervalAt(rounds, localTime).state;

describe("saveCheck", () => {
  test("отметка встаёт в проход, идущий сейчас", async () => {
    const fixture = await roundChecklist({
      schedule: [every("08:00", "12:00", 60)],
    });

    const mark = await saveCheck({
      versionId: fixture.versionId,
      itemId: fixture.itemId,
      value: true,
      at: new Date("2026-09-14T09:40:00Z"),
    });

    // 09:00 — час от начала окна в 08:00.
    expect(mark.intervalStart).toBe(60);
    expect(mark.localDate).toBe("2026-09-14");
    expect(mark.value).toBe(true);
    // «Сделано в 09:40» — местное время пиццерии, считает база.
    expect(mark.atLocalTime).toBe("09:40");
  });

  test("пропущенные проходы остаются пропущенными: отметка их не догоняет (D066)", async () => {
    const fixture = await roundChecklist({
      schedule: [every("08:00", "12:00", 60)],
    });
    const at = new Date("2026-09-14T11:20:00Z");

    await saveCheck({
      versionId: fixture.versionId,
      itemId: fixture.itemId,
      value: true,
      at,
    });
    const rounds = await roundsOf(fixture.versionId, at);

    expect(stateAt(rounds, "08:00")).toBe("missed");
    expect(stateAt(rounds, "09:00")).toBe("missed");
    expect(stateAt(rounds, "10:00")).toBe("missed");
    expect(stateAt(rounds, "11:00")).toBe("done");
    expect(rounds.missedCount).toBe(3);
  });

  test("повторный обход — вторая строка, а не правка первой", async () => {
    const fixture = await roundChecklist({
      schedule: [every("08:00", "12:00", 60)],
    });
    const at = new Date("2026-09-14T09:10:00Z");

    await saveCheck({
      versionId: fixture.versionId,
      itemId: fixture.itemId,
      value: true,
      at,
    });
    await saveCheck({
      versionId: fixture.versionId,
      itemId: fixture.itemId,
      value: false,
      comment: "переделали",
      at: new Date("2026-09-14T09:50:00Z"),
    });

    const rounds = await roundsOf(fixture.versionId, at);
    const interval = intervalAt(rounds, "09:00");
    expect(interval.marks).toHaveLength(2);
    expect(interval.marks.map((mark) => mark.value)).toEqual([true, false]);
    expect(interval.marks.map((mark) => mark.atLocalTime)).toEqual([
      "09:10",
      "09:50",
    ]);
    expect(interval.marks[1]?.comment).toBe("переделали");
  });

  test("окно через полночь: отметка после полуночи относится к проходу, начавшемуся вчера", async () => {
    const fixture = await roundChecklist({
      windowStart: "22:00:00",
      windowEnd: "02:00:00",
      schedule: [every("22:00", "02:00", 60)],
    });

    const mark = await saveCheck({
      versionId: fixture.versionId,
      itemId: fixture.itemId,
      value: true,
      at: new Date("2026-09-15T01:30:00Z"),
    });

    // Сутки отметки — те, в которых проход начался, а не те, в которых он кончился.
    expect(mark.localDate).toBe("2026-09-14");
    // 01:00 — три часа от начала окна в 22:00.
    expect(mark.intervalStart).toBe(180);
  });

  test("круглосуточное окно разбирается верной веткой, а не запасной", async () => {
    // «Круглосуточно» — готовый пресет редактора, и конец суток записан в нём как
    // «24:00:00». Общий разбор времени такого времени не знает, и раньше окно
    // проваливалось в запасную ветку «ничего не разобрали — считаем сегодняшним
    // днём». Ответ при этом СОВПАДАЛ с верным, поэтому поломка была невидима: её
    // выдала бы только правка порядка условий (T166, issue #76).
    const fixture = await roundChecklist({
      windowStart: "00:00:00",
      windowEnd: "24:00:00",
      schedule: [every("00:00", "12:00", 60)],
    });

    const mark = await saveCheck({
      versionId: fixture.versionId,
      itemId: fixture.itemId,
      value: true,
      at: new Date("2026-09-15T00:30:00Z"),
    });

    // Ночная отметка круглосуточного чек-листа принадлежит наступившим суткам:
    // окно не через полночь, вчерашнего прохода тут нет.
    expect(mark.localDate).toBe("2026-09-15");
    expect(mark.intervalStart).toBe(0);
  });

  test("часовой пояс пиццерии решает, какой проход идёт: один и тот же миг — разные ответы", async () => {
    const at = new Date("2026-09-14T04:40:00Z");
    const shifted = await roundChecklist({
      timezone: "Etc/GMT-5", // UTC+5: в базе знак у Etc/GMT перевёрнут
      schedule: [every("08:00", "12:00", 60)],
    });
    const utc = await roundChecklist({
      schedule: [every("08:00", "12:00", 60)],
    });

    // В пиццерии со сдвигом местные 09:40 — идёт девятичасовой обход.
    const mark = await saveCheck({
      versionId: shifted.versionId,
      itemId: shifted.itemId,
      value: true,
      at,
    });
    expect(mark.intervalStart).toBe(60);
    expect(mark.atLocalTime).toBe("09:40");

    // В пиццерии по UTC в этот же миг ещё 04:40 — чек-лист не работает.
    await expect(
      saveCheck({
        versionId: utc.versionId,
        itemId: utc.itemId,
        value: true,
        at,
      }),
    ).rejects.toThrow(/не работает/);
  });

  test("черновик отметить нельзя: это предпросмотр методиста", async () => {
    const station = await createStation();
    const checklistId = await createChecklist({
      stationId: station.stationId,
      windowStart: "08:00:00",
      windowEnd: "23:00:00",
    });
    const itemId = `round-${randomUUID()}`;
    const draftId = await createDraft(
      checklistId,
      roundSections(itemId, [every("08:00", "12:00", 60)], "critical"),
    );

    await expect(
      saveCheck({
        versionId: draftId,
        itemId,
        value: true,
        at: new Date("2026-09-14T09:40:00Z"),
      }),
    ).rejects.toThrow(/черновик/);
  });

  test("непериодический пункт отметить нельзя: у него нет проходов", async () => {
    const station = await createStation();
    const checklistId = await createChecklist({
      stationId: station.stationId,
      windowStart: "08:00:00",
      windowEnd: "23:00:00",
    });
    const itemId = `plain-${randomUUID()}`;
    const versionId = await createPublishedVersion(checklistId, [
      {
        id: `section-${itemId}`,
        title: { ru: "Открытие", en: "Opening" },
        source: "own",
        items: [
          {
            id: itemId,
            title: { ru: "Включить печь", en: "Turn on the oven" },
            type: "bool",
            severity: "critical",
          },
        ],
      },
    ]);

    await expect(
      saveCheck({
        versionId,
        itemId,
        value: true,
        at: new Date("2026-09-14T09:40:00Z"),
      }),
    ).rejects.toThrow(/не периодический/);
  });

  test("пункта нет в этой версии — отказ, а не молчаливая отметка в пустоту", async () => {
    const fixture = await roundChecklist({
      schedule: [every("08:00", "12:00", 60)],
    });

    await expect(
      saveCheck({
        versionId: fixture.versionId,
        itemId: "нет-такого-пункта",
        value: true,
        at: new Date("2026-09-14T09:40:00Z"),
      }),
    ).rejects.toThrow(/нет в этой версии/);
  });

  test("когда сетка на сегодня кончилась, обхода не ждут", async () => {
    const fixture = await roundChecklist({
      schedule: [every("08:00", "12:00", 60)],
    });

    await expect(
      saveCheck({
        versionId: fixture.versionId,
        itemId: fixture.itemId,
        value: true,
        at: new Date("2026-09-14T12:30:00Z"),
      }),
    ).rejects.toThrow(/Обхода сейчас не ждут/);
  });

  test("пункт, выпавший по режиму смены, сегодня не отмечается (D067)", async () => {
    const fixture = await roundChecklist({
      schedule: [every("08:00", "12:00", 60)],
      severity: "normal",
    });
    const at = new Date("2026-09-14T09:40:00Z");
    await setShiftMode(
      { storeId: fixture.station.storeId, mode: "critical" },
      at,
    );

    await expect(
      saveCheck({
        versionId: fixture.versionId,
        itemId: fixture.itemId,
        value: true,
        at,
      }),
    ).rejects.toThrow(/режим/);
  });
});

describe("getRounds", () => {
  test("состояния проходов: пройденный, пропущенный, идущий и будущий", async () => {
    const fixture = await roundChecklist({
      schedule: [every("08:00", "13:00", 60)],
    });

    await saveCheck({
      versionId: fixture.versionId,
      itemId: fixture.itemId,
      value: true,
      at: new Date("2026-09-14T10:10:00Z"),
    });
    const rounds = await roundsOf(
      fixture.versionId,
      new Date("2026-09-14T11:20:00Z"),
    );

    expect(stateAt(rounds, "08:00")).toBe("missed");
    expect(stateAt(rounds, "09:00")).toBe("missed");
    expect(stateAt(rounds, "10:00")).toBe("done");
    expect(stateAt(rounds, "11:00")).toBe("open");
    expect(stateAt(rounds, "12:00")).toBe("upcoming");
    expect(rounds.missedCount).toBe(2);
    expect(rounds.current?.startLocalTime).toBe("11:00");
  });

  test("идущий проход не считается пропущенным, пока не кончился", async () => {
    const fixture = await roundChecklist({
      schedule: [every("08:00", "12:00", 60)],
    });

    const rounds = await roundsOf(
      fixture.versionId,
      new Date("2026-09-14T08:59:00Z"),
    );
    expect(rounds.missedCount).toBe(0);
    expect(stateAt(rounds, "08:00")).toBe("open");
  });

  test("вне окна чек-листа показывать нечего", async () => {
    const fixture = await roundChecklist({
      schedule: [every("08:00", "12:00", 60)],
    });

    expect(
      await getRounds(fixture.versionId, new Date("2026-09-14T23:30:00Z")),
    ).toBeNull();
  });

  test("отметки переживают публикацию новой версии посреди смены", async () => {
    const fixture = await roundChecklist({
      schedule: [every("08:00", "12:00", 60)],
    });
    const at = new Date("2026-09-14T09:40:00Z");

    await saveCheck({
      versionId: fixture.versionId,
      itemId: fixture.itemId,
      value: true,
      at,
    });

    // Методист опубликовал следующую версию, пока смена шла (T041).
    await db
      .update(checklistVersions)
      .set({ status: "archived" })
      .where(eq(checklistVersions.id, fixture.versionId));
    const nextVersionId = await createPublishedVersion(
      fixture.checklistId,
      roundSections(fixture.itemId, [every("08:00", "12:00", 60)], "critical"),
      2,
    );

    const rounds = await roundsOf(nextVersionId, at);
    expect(stateAt(rounds, "09:00")).toBe("done");
  });

  test("отметки соседней станции не подмешиваются", async () => {
    const itemId = `shared-${randomUUID()}`;
    const at = new Date("2026-09-14T09:40:00Z");
    const mine = await roundChecklist({
      itemId,
      schedule: [every("08:00", "12:00", 60)],
    });
    const neighbour = await roundChecklist({
      itemId,
      schedule: [every("08:00", "12:00", 60)],
    });

    await saveCheck({
      versionId: neighbour.versionId,
      itemId,
      value: true,
      at,
    });

    const rounds = await roundsOf(mine.versionId, at);
    expect(stateAt(rounds, "09:00")).toBe("open");
    expect(intervalAt(rounds, "09:00").marks).toHaveLength(0);
  });

  test("вчерашние обходы на сегодняшнем экране не показываются", async () => {
    const fixture = await roundChecklist({
      schedule: [every("08:00", "12:00", 60)],
    });

    await saveCheck({
      versionId: fixture.versionId,
      itemId: fixture.itemId,
      value: true,
      at: new Date("2026-09-13T09:40:00Z"),
    });

    const rounds = await roundsOf(
      fixture.versionId,
      new Date("2026-09-14T09:40:00Z"),
    );
    expect(stateAt(rounds, "09:00")).toBe("open");
  });

  test("отметка, не попавшая ни в один проход сетки, не пропадает молча", async () => {
    const fixture = await roundChecklist({
      schedule: [every("08:00", "12:00", 60)],
    });
    const at = new Date("2026-09-14T09:40:00Z");

    await saveCheck({
      versionId: fixture.versionId,
      itemId: fixture.itemId,
      value: true,
      at,
    });

    // Методист опубликовал версию с другим шагом: часовые отметки утра в двухчасовую
    // сетку уже не ложатся. Потерять их нельзя — обход был сделан.
    await db
      .update(checklistVersions)
      .set({ status: "archived" })
      .where(eq(checklistVersions.id, fixture.versionId));
    const nextVersionId = await createPublishedVersion(
      fixture.checklistId,
      roundSections(fixture.itemId, [every("08:00", "12:00", 120)], "critical"),
      2,
    );

    const rounds = await roundsOf(nextVersionId, at);
    expect(rounds.strayMarks).toHaveLength(1);
  });

  test("непериодические пункты в обходы не попадают", async () => {
    const station = await createStation();
    const checklistId = await createChecklist({
      stationId: station.stationId,
      windowStart: "08:00:00",
      windowEnd: "23:00:00",
    });
    const periodicId = `round-${randomUUID()}`;
    const plainId = `plain-${randomUUID()}`;
    const versionId = await createPublishedVersion(checklistId, [
      ...roundSections(periodicId, [every("08:00", "12:00", 60)], "critical"),
      {
        id: `section-${plainId}`,
        title: { ru: "Открытие", en: "Opening" },
        source: "own",
        items: [
          {
            id: plainId,
            title: { ru: "Включить печь", en: "Turn on the oven" },
            type: "bool",
            severity: "critical",
          },
        ],
      },
    ]);

    const rounds = await roundsOf(versionId, new Date("2026-09-14T09:40:00Z"));
    expect(rounds.itemId).toBe(periodicId);
  });
});

describe("начало окна", () => {
  // T167, issue #77. Здесь стояло `parseLocalTime(window.start) ?? 0`: неразобранное
  // начало тихо становилось полуночью, и время прохода в сетке уезжало на несколько
  // часов, оставаясь правдоподобным. Настоящие данные в эту ветку не попадают — начало
  // окна живёт в колонке `time`, — поэтому проверка идёт по самой функции, а не через
  // базу: испортить в базе значение, которое база и проверяет, нельзя.
  test("разобранное время — минуты от полуночи", () => {
    expect(windowStartMinutes({ start: "08:00:00", end: "23:00:00" })).toBe(
      480,
    );
    expect(windowStartMinutes({ start: "22:00", end: "02:00" })).toBe(1320);
  });

  test("неразобранное время отбивается вслух и называет само значение", () => {
    expect(() =>
      windowStartMinutes({ start: "не время", end: "23:00:00" }),
    ).toThrow(RangeError);
    expect(() =>
      windowStartMinutes({ start: "не время", end: "23:00:00" }),
    ).toThrow(/не время/);
    // «24:00» — законный КОНЕЦ суток, но не начало: обход «в 24:00» бессмыслица,
    // и послабление `parseWindowEnd` сюда не распространяется.
    expect(() => windowStartMinutes({ start: "24:00", end: "02:00" })).toThrow(
      RangeError,
    );
  });
});
