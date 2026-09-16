// Проходы окна, из которых собирается сетка отчёта. Здесь проверяется ровно то, что
// нельзя увидеть в самой сетке: какие сутки вообще попадают в период, по какой версии
// считается каждые из них и сколько к моменту просмотра успело пройти.
import { describe, expect, test } from "vitest";

import type { Section } from "@/blocks/data";

import type { ReportChecklist, ReportVersion } from "./rounds-days";
import { buildRoundsDays, shiftLocalDate } from "./rounds-days";

const WINDOW = { start: "08:00", end: "12:00" } as const;
/** Окно через полночь: проход, начатый вечером, кончается на следующих сутках. */
const NIGHT_WINDOW = { start: "20:00", end: "02:00" } as const;
/**
 * Круглосуточное окно — один из трёх готовых пресетов редактора (`window-field.ts`),
 * и конец суток записан в нём как «24:00:00»: колонка `time` в базе так и отдаёт.
 * Отдельным окном в проверках, потому что «24:00» — единственное время, которое
 * общий разбор времени НЕ принимает, и чек-лист с таким окном выпадал из отчёта
 * целиком и молча (issue #75).
 */
const ALL_DAY_WINDOW = { start: "00:00", end: "24:00:00" } as const;

function sections(title: string): Section[] {
  return [
    {
      id: "s-1",
      title: { ru: "Секция", en: "Section" },
      source: "own",
      items: [
        {
          id: "i-line",
          title: { ru: title, en: title },
          type: "bool",
          severity: "critical",
          schedule: [{ from: "08:00", to: "12:00", everyMinutes: 60 }],
        },
      ],
    },
  ];
}

function checklist(over: Partial<ReportChecklist> = {}): ReportChecklist {
  return {
    checklistId: "c-1",
    storeId: "st-1",
    window: WINDOW,
    localDate: "2026-09-06",
    localTime: "13:00",
    ...over,
  };
}

function version(publishedLocalDate: string, title = "Линия"): ReportVersion {
  return { checklistId: "c-1", publishedLocalDate, sections: sections(title) };
}

describe("сутки отчёта", () => {
  test("круглосуточное окно даёт сутки, а не выпадает из отчёта целиком", () => {
    const days = buildRoundsDays({
      checklists: [checklist({ window: ALL_DAY_WINDOW })],
      versions: [version("2026-09-01")],
      shiftModes: [],
      dayCount: 3,
    });

    // Без суток чек-лист не попадает в сетку ВООБЩЕ: экран показывает пустое
    // состояние и советует расширить период — совет, который не поможет никогда,
    // потому что период тут ни при чём.
    expect(
      days.map((day) => day.localDate),
      "Чек-лист с окном «Круглосуточно» не дал ни одних суток: конец суток «24:00» " +
        "разобран общим разбором времени, а он такого времени не знает.",
    ).toEqual(["2026-09-04", "2026-09-05", "2026-09-06"]);
  });

  test("период — местные календарные сутки, считая сегодняшние", () => {
    const days = buildRoundsDays({
      checklists: [checklist()],
      versions: [version("2026-09-01")],
      shiftModes: [],
      dayCount: 3,
    });

    expect(days.map((day) => day.localDate)).toEqual([
      "2026-09-04",
      "2026-09-05",
      "2026-09-06",
    ]);
  });

  test("сутки до первой публикации в отчёт не попадают", () => {
    const days = buildRoundsDays({
      checklists: [checklist()],
      versions: [version("2026-09-05")],
      shiftModes: [],
      dayCount: 3,
    });

    // 4 сентября чек-листа ещё не существовало: ждать в этот день было нечего,
    // и пропуск за него был бы выдуманным.
    expect(days.map((day) => day.localDate)).toEqual([
      "2026-09-05",
      "2026-09-06",
    ]);
  });

  test("каждые сутки считаются по версии, действовавшей в них", () => {
    const days = buildRoundsDays({
      checklists: [checklist()],
      versions: [
        version("2026-09-01", "Старое"),
        version("2026-09-06", "Новое"),
      ],
      shiftModes: [],
      dayCount: 3,
    });

    const titles = days.map((day) => day.sections[0]?.items[0]?.title["ru"]);
    expect(titles).toEqual(["Старое", "Старое", "Новое"]);
  });

  test("режим смены берётся за эти сутки и по своей пиццерии", () => {
    const days = buildRoundsDays({
      checklists: [checklist()],
      versions: [version("2026-09-01")],
      shiftModes: [
        { storeId: "st-1", localDate: "2026-09-05", mode: "reduced" },
        { storeId: "st-2", localDate: "2026-09-06", mode: "critical" },
      ],
      dayCount: 3,
    });

    expect(days.map((day) => day.mode)).toEqual([
      "normal",
      "reduced",
      "normal",
    ]);
  });

  test("последняя перестановка режима за сутки и побеждает", () => {
    const days = buildRoundsDays({
      checklists: [checklist()],
      versions: [version("2026-09-01")],
      shiftModes: [
        { storeId: "st-1", localDate: "2026-09-06", mode: "reduced" },
        { storeId: "st-1", localDate: "2026-09-06", mode: "critical" },
      ],
      dayCount: 1,
    });

    expect(days[0]?.mode).toBe("critical");
  });

  test("прошедшие сутки закрыты целиком, сегодняшние — по местному времени", () => {
    const days = buildRoundsDays({
      checklists: [checklist({ localTime: "09:30" })],
      versions: [version("2026-09-01")],
      shiftModes: [],
      dayCount: 2,
    });

    // Вчера: сутки назад плюс полтора часа от 08:00 — проход давно закрыт.
    expect(days[0]?.elapsedMinutes).toBe(24 * 60 + 90);
    expect(days[1]?.elapsedMinutes).toBe(90);
  });

  test("проход, который сегодня ещё не начался, целиком впереди", () => {
    const days = buildRoundsDays({
      checklists: [checklist({ localTime: "03:00" })],
      versions: [version("2026-09-01")],
      shiftModes: [],
      dayCount: 1,
    });

    // Ноль, а не отрицательное число: «ещё не начался» и «начался только что» —
    // одно и то же состояние сетки, в ней всё впереди.
    expect(days[0]?.elapsedMinutes).toBe(0);
  });

  test("окно через полночь: вчерашний проход ещё идёт и попадает в «сегодня»", () => {
    const days = buildRoundsDays({
      checklists: [checklist({ window: NIGHT_WINDOW, localTime: "01:00" })],
      versions: [version("2026-09-01")],
      shiftModes: [],
      dayCount: 1,
    });

    // Вчерашний проход (20:00 → 02:00) идёт прямо сейчас, сегодняшний начнётся вечером.
    expect(days.map((day) => day.localDate)).toEqual([
      "2026-09-05",
      "2026-09-06",
    ]);
    expect(days[0]?.elapsedMinutes).toBe(5 * 60);
    expect(days[1]?.elapsedMinutes).toBe(0);
  });

  test("в период входит проход, который его задел, а не только начатый в нём", () => {
    const days = buildRoundsDays({
      checklists: [
        // Ночной: вчерашний проход кончился в 02:00 сегодня — он уже внутри
        // сегодняшних суток, и его пропуски относятся к сегодняшнему разговору.
        checklist({ window: NIGHT_WINDOW, localTime: "13:00" }),
        // Утренний: вчерашний проход кончился вчера и в «сегодня» не попадает.
        checklist({ checklistId: "c-2", localTime: "13:00" }),
      ],
      versions: [
        version("2026-09-01"),
        { ...version("2026-09-01"), checklistId: "c-2" },
      ],
      shiftModes: [],
      dayCount: 1,
    });

    expect(days.map((day) => `${day.checklistId} ${day.localDate}`)).toEqual([
      "c-1 2026-09-05",
      "c-1 2026-09-06",
      "c-2 2026-09-06",
    ]);
  });

  test("у каждой пиццерии свой «сегодня»", () => {
    const days = buildRoundsDays({
      checklists: [
        checklist(),
        checklist({
          checklistId: "c-2",
          storeId: "st-2",
          localDate: "2026-09-07",
        }),
      ],
      versions: [
        version("2026-09-01"),
        { ...version("2026-09-01"), checklistId: "c-2" },
      ],
      shiftModes: [],
      dayCount: 1,
    });

    expect(days.map((day) => `${day.checklistId} ${day.localDate}`)).toEqual([
      "c-1 2026-09-06",
      "c-2 2026-09-07",
    ]);
  });
});

describe("сдвиг местной даты", () => {
  test("считается по календарю, а не вычитанием суток", () => {
    expect(shiftLocalDate("2026-03-01", -1)).toBe("2026-02-28");
    expect(shiftLocalDate("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftLocalDate("2026-09-06", -30)).toBe("2026-08-07");
  });

  test("неразобранная дата — это ошибка, а не тихий сдвиг в никуда", () => {
    expect(() => shiftLocalDate("вчера", -1)).toThrow(RangeError);
  });
});
