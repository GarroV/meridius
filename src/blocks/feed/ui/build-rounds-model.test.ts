// Отчёт об обходах на настоящей базе: запросы, разбор периода на проходы окон и сетка
// проверяются вместе. По отдельности каждый кусок выглядит рабочим и разъезжается
// именно на стыке — там, где местное время считает база, а расписание считает код.
import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, test } from "vitest";

import type { Section } from "@/blocks/data";
import { checklistVersions, checks, getDb } from "@/blocks/data";
import { closeTestDb } from "@/blocks/data/testing/db";
import {
  createChecklist,
  createPublishedVersion,
  createStation,
} from "@/blocks/data/testing/fixtures";

import type { RoundsReportModel } from "../rounds-model";
import { parseFeedView } from "../view";
import { buildRoundsModel } from "./build-rounds-model";

afterAll(closeTestDb);

/** 5 сентября, полдень по UTC: окно 06:00–12:00 к этому моменту только что закрылось. */
const NOON = new Date("2026-09-05T12:00:00Z");
/** Тот же день в 09:00: половина прохода позади, половина ещё впереди. */
const MORNING = new Date("2026-09-05T09:00:00Z");

const ITEM_ID = "item-line";
const PLAIN_ID = "item-tables";

/** Обход раз в два часа с 06:00 до 12:00: проходы в 06:00, 08:00 и 10:00. */
function sections(everyMinutes = 120, title = "Линия раздачи"): Section[] {
  return [
    {
      id: "section-line",
      title: { ru: "Линия", en: "Line" },
      source: "own",
      items: [
        {
          id: ITEM_ID,
          title: { ru: title, en: title },
          type: "bool",
          severity: "critical",
          schedule: [{ from: "06:00", to: "12:00", everyMinutes }],
        },
        {
          id: PLAIN_ID,
          title: { ru: "Столы протёрты", en: "Tables wiped" },
          type: "bool",
          severity: "normal",
        },
      ],
    },
  ];
}

interface Seeded {
  readonly stationId: string;
  readonly checklistId: string;
  readonly versionId: string;
}

interface SeedOptions {
  readonly publishedAt?: Date;
  readonly sections?: Section[];
  readonly publish?: boolean;
}

/** Своя цепочка страна → пиццерия → станция → чек-лист на каждый вызов: общей очистки
 *  таблиц в этом проекте нет, и файлы тестов идут параллельно. */
async function seed(options: SeedOptions = {}): Promise<Seeded> {
  const station = await createStation({ timezone: "UTC" });
  const checklistId = await createChecklist({
    stationId: station.stationId,
    windowStart: "06:00:00",
    windowEnd: "12:00:00",
  });
  if (options.publish === false) {
    return { stationId: station.stationId, checklistId, versionId: "" };
  }
  const versionId = await publish(
    checklistId,
    options.sections ?? sections(),
    options.publishedAt ?? new Date("2026-09-01T05:00:00Z"),
  );
  return { stationId: station.stationId, checklistId, versionId };
}

/**
 * Публикация с заданным моментом: фикстура ставит время прямо сейчас, а отчёт берёт
 * только версии, опубликованные не позже просмотра, — иначе сегодняшний день считался
 * бы по расписанию, которого тогда ещё не было.
 */
async function publish(
  checklistId: string,
  content: Section[],
  publishedAt: Date,
  versionNumber = 1,
): Promise<string> {
  // Опубликованная версия у чек-листа ровно одна (частный индекс в схеме): прежняя
  // уходит в архив, как это делает настоящая публикация. Отчёт читает и архивные —
  // старые сутки считаются по расписанию, которое тогда и действовало (D002).
  await getDb()
    .update(checklistVersions)
    .set({ status: "archived" })
    .where(
      and(
        eq(checklistVersions.checklistId, checklistId),
        eq(checklistVersions.status, "published"),
      ),
    );

  const versionId = await createPublishedVersion(
    checklistId,
    content,
    versionNumber,
  );
  await getDb()
    .update(checklistVersions)
    .set({ publishedAt })
    .where(eq(checklistVersions.id, versionId));
  return versionId;
}

/** Отметка обхода строкой в базе: проход и сутки задаются точно, а не через часы. */
async function mark(
  seeded: Seeded,
  intervalStart: number,
  localDate = "2026-09-05",
  versionId = seeded.versionId,
): Promise<void> {
  await getDb().insert(checks).values({
    stationId: seeded.stationId,
    versionId,
    itemId: ITEM_ID,
    localDate,
    intervalStart,
    value: true,
  });
}

function modelOf(
  stationId: string,
  period: string,
  now: Date,
): Promise<RoundsReportModel> {
  return buildRoundsModel(
    parseFeedView({ station: stationId, period }),
    "ru",
    now,
  );
}

describe("отчёт об обходах", () => {
  test("сетка показывает, в какие часы обход не дошёл", async () => {
    const seeded = await seed();
    await mark(seeded, 0);

    const model = await modelOf(seeded.stationId, "today", NOON);

    expect(model.columns).toEqual(["06:00", "08:00", "10:00"]);
    // Пункт без расписания в сетке обходов не участвует: он заполняется вместе
    // с остальными, а не проходами.
    expect(model.rows).toHaveLength(1);
    expect(model.rows[0]?.cells.map((cell) => cell.kind)).toEqual([
      "done",
      "missed",
      "missed",
    ]);
    expect(model.doneCount).toBe(1);
    expect(model.missedCount).toBe(2);
    expect(model.emptyKind).toBeNull();
  });

  test("незакрытый интервал пропуском не считается", async () => {
    const seeded = await seed();
    await mark(seeded, 0);

    const model = await modelOf(seeded.stationId, "today", MORNING);

    // 09:00 — три часа от начала окна: восьмичасовой проход ещё идёт, десятичасовой
    // не начинался. Пропуском ни тот, ни другой не является.
    expect(model.rows[0]?.cells.map((cell) => cell.kind)).toEqual([
      "done",
      "pending",
      "pending",
    ]);
    expect(model.missedCount).toBe(0);
  });

  test("отметка остаётся в отчёте после публикации следующей версии", async () => {
    const seeded = await seed();
    await mark(seeded, 0);
    // Методист опубликовал следующую версию посреди смены (T041): утренний обход
    // сделан по прежней и обязан остаться — отметки читаются по чек-листу.
    await publish(
      seeded.checklistId,
      sections(120),
      new Date("2026-09-05T07:00:00Z"),
      2,
    );

    const model = await modelOf(seeded.stationId, "today", NOON);

    expect(model.rows[0]?.cells[0]?.kind).toBe("done");
    expect(model.strayMarkCount).toBe(0);
  });

  test("сутки считаются по тому расписанию, которое тогда и было", async () => {
    const seeded = await seed();
    await publish(
      seeded.checklistId,
      sections(60),
      new Date("2026-09-05T04:00:00Z"),
      2,
    );

    const today = await modelOf(seeded.stationId, "today", NOON);
    const week = await modelOf(seeded.stationId, "week", NOON);

    // Сегодня действует часовой шаг, опубликованный сегодня утром.
    expect(today.columns).toEqual([
      "06:00",
      "07:00",
      "08:00",
      "09:00",
      "10:00",
      "11:00",
    ]);
    // Колонки за неделю те же: двухчасовые проходы — подмножество часовых, и по ним
    // разницу не увидеть. Видно её по числу пропусков. Версия опубликована 1 сентября,
    // поэтому проходов пять: четыре дня по три обхода (шаг в два часа) и сегодняшний
    // день с шестью (часовой шаг) — восемнадцать. Пересчитай отчёт по сегодняшнему
    // расписанию, и выйдет тридцать: продукт припишет сети работу, которой не ждал.
    expect(week.columns).toEqual(today.columns);
    expect(today.missedCount).toBe(6);
    expect(week.missedCount).toBe(18);
  });

  test("отметка, не легшая ни в один интервал, объявляется числом", async () => {
    const seeded = await seed();
    // Полчаса от начала окна — не граница ни одного прохода: шаг тогда был другим.
    await mark(seeded, 30);

    const model = await modelOf(seeded.stationId, "today", NOON);

    expect(model.strayMarkCount).toBe(1);
    expect(model.doneCount).toBe(0);
  });

  test("чек-лист без расписания обходов объясняет, что настроить", async () => {
    const seeded = await seed({
      sections: [
        {
          id: "section-plain",
          title: { ru: "Обычное", en: "Plain" },
          source: "own",
          items: [
            {
              id: PLAIN_ID,
              title: { ru: "Столы протёрты", en: "Tables wiped" },
              type: "bool",
              severity: "normal",
            },
          ],
        },
      ],
    });

    const model = await modelOf(seeded.stationId, "today", NOON);

    expect(model.emptyKind).toBe("noSchedule");
  });

  test("чек-лист без опубликованной версии — это отсутствие проходов", async () => {
    const seeded = await seed({ publish: false });

    const model = await modelOf(seeded.stationId, "today", NOON);

    expect(model.emptyKind).toBe("noPasses");
  });

  test("станция без чек-листов объясняет, что завести", async () => {
    const station = await createStation({ timezone: "UTC" });

    const model = await modelOf(station.stationId, "today", NOON);

    expect(model.emptyKind).toBe("noChecklists");
    expect(model.rows).toHaveLength(0);
  });

  test("фильтр станции сужает отчёт до неё одной", async () => {
    const mine = await seed();
    const other = await seed();
    await mark(mine, 0);
    await mark(other, 0);
    await mark(other, 120);

    const model = await modelOf(mine.stationId, "today", NOON);

    expect(model.rows).toHaveLength(1);
    expect(model.doneCount).toBe(1);
    expect(model.rows[0]?.stationName).not.toBe("");
  });
});
