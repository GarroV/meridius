// Сборка моделей ленты и карточки на настоящей базе: здесь сходятся четыре фильтра,
// три показателя и снимок пунктов, и все три правила проверяются вместе — по отдельности
// они выглядят рабочими, а разъезжаются именно на стыке.
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, test } from "vitest";

import type { Answer, ItemColumn, Section, TableRow } from "@/blocks/data";
import {
  checklistVersions,
  getDb,
  saveSubmission,
  stations,
  submissions,
} from "@/blocks/data";
import { closeTestDb } from "@/blocks/data/testing/db";
import {
  createChecklist,
  createPublishedVersion,
  createStation,
  uniqueStationCode,
} from "@/blocks/data/testing/fixtures";

import { FEED_PATH } from "../routes";
import { parseFeedView } from "../view";
import { buildFeedModel, buildSubmissionModel } from "./build-model";

afterAll(closeTestDb);

const NOW = new Date("2026-09-05T12:00:00Z");

function sections(label: string): Section[] {
  return [
    {
      id: `section-oven-${label}`,
      title: { ru: "Печь и оборудование", en: "Oven" },
      source: "own",
      items: [
        {
          id: `item-oven-${label}`,
          title: { ru: "Включить печь", en: "Turn the oven on" },
          type: "bool",
          critical: false,
        },
      ],
    },
    {
      id: `section-fridge-${label}`,
      title: { ru: "Холодильники", en: "Fridges" },
      source: { blockId: `block-${label}` },
      items: [
        {
          id: `item-temp-${label}`,
          title: { ru: "Температура камеры", en: "Chamber temperature" },
          type: "number",
          critical: true,
          min: 2,
          max: 4,
          hint: { ru: "+2…+4 °C", en: "+2…+4 °C" },
        },
        {
          id: `item-clean-${label}`,
          title: { ru: "Убрать заготовки", en: "Remove leftovers" },
          type: "bool",
          critical: false,
        },
      ],
    },
  ];
}

function answer(
  itemId: string,
  value: boolean | number | string,
  comment?: string,
): Answer {
  const base: Answer = {
    itemId,
    value,
    at: Date.parse("2026-09-05T09:13:00Z"),
  };
  return comment === undefined ? base : { ...base, comment };
}

interface SeedOptions {
  readonly answers: Answer[];
  readonly submittedAt: Date;
  readonly durationMs: number;
  readonly timezone?: string;
}

interface Seeded {
  readonly submissionId: string;
  readonly countryId: string;
  readonly storeId: string;
  readonly stationId: string;
  readonly versionId: string;
  readonly label: string;
}

/**
 * Своя цепочка страна → пиццерия → станция → версия → заполнение на каждый вызов:
 * файлы тестов идут параллельно, общей очистки таблиц в этом проекте нет.
 */
async function seed(label: string, options: SeedOptions): Promise<Seeded> {
  const station = await createStation({ timezone: options.timezone ?? "UTC" });
  const checklistId = await createChecklist({ stationId: station.stationId });
  const versionId = await createPublishedVersion(checklistId, sections(label));
  const submissionId = await saveSubmission({
    mode: "normal",
    versionId,
    answers: options.answers,
    startedAt: options.submittedAt.getTime() - options.durationMs,
  });

  // Время отправки ставит база (`now()`), а лента фильтрует именно по нему:
  // проверить период иначе нечем.
  await getDb()
    .update(submissions)
    .set({ submittedAt: options.submittedAt })
    .where(eq(submissions.id, submissionId));

  return {
    submissionId,
    countryId: station.countryId,
    storeId: station.storeId,
    stationId: station.stationId,
    versionId,
    label,
  };
}

describe("buildFeedModel — фильтры", () => {
  test("страна, пиццерия, станция и период работают вместе, а не по одному", async () => {
    const label = "together";
    const mine = await seed(label, {
      answers: [answer(`item-oven-${label}`, true)],
      submittedAt: new Date("2026-09-05T09:12:00Z"),
      durationMs: 204_000,
    });
    const other = await seed("other", {
      answers: [answer("item-oven-other", true)],
      submittedAt: new Date("2026-09-05T09:12:00Z"),
      durationMs: 60_000,
    });

    const model = await buildFeedModel(
      {
        countryId: mine.countryId,
        storeId: mine.storeId,
        stationId: mine.stationId,
        period: "today",
      },
      "ru",
      NOW,
    );

    expect(model.rows.map((row) => row.id)).toStrictEqual([mine.submissionId]);
    expect(model.rows.map((row) => row.id)).not.toContain(other.submissionId);
    expect(model.selection.countryId).toBe(mine.countryId);
    expect(model.selection.storeId).toBe(mine.storeId);
    expect(model.selection.stationId).toBe(mine.stationId);
  });

  test("период отсекает вчерашнее заполнение той же станции", async () => {
    const label = "period";
    const today = await seed(label, {
      answers: [answer(`item-oven-${label}`, true)],
      submittedAt: new Date("2026-09-05T09:12:00Z"),
      durationMs: 60_000,
    });
    const yesterdayId = await saveSubmission({
      mode: "normal",
      versionId: today.versionId,
      answers: [answer(`item-oven-${label}`, true)],
      startedAt: Date.parse("2026-09-04T21:00:00Z"),
    });
    await getDb()
      .update(submissions)
      .set({ submittedAt: new Date("2026-09-04T21:40:00Z") })
      .where(eq(submissions.id, yesterdayId));

    const todayOnly = await buildFeedModel(
      { stationId: today.stationId, period: "today" },
      "ru",
      NOW,
    );
    const week = await buildFeedModel(
      { stationId: today.stationId, period: "week" },
      "ru",
      NOW,
    );

    expect(todayOnly.rows.map((row) => row.id)).toStrictEqual([
      today.submissionId,
    ]);
    expect(week.rows.map((row) => row.id)).toStrictEqual([
      today.submissionId,
      yesterdayId,
    ]);
  });

  test("пиццерия чужой страны из фильтра выпадает, а лента не становится пустой без причины", async () => {
    const label = "mismatch";
    const mine = await seed(label, {
      answers: [answer(`item-oven-${label}`, true)],
      submittedAt: new Date("2026-09-05T09:12:00Z"),
      durationMs: 60_000,
    });
    const alien = await seed("alien", {
      answers: [answer("item-oven-alien", true)],
      submittedAt: new Date("2026-09-05T09:12:00Z"),
      durationMs: 60_000,
    });

    const model = await buildFeedModel(
      { countryId: mine.countryId, storeId: alien.storeId, period: "today" },
      "ru",
      NOW,
    );

    expect(model.selection.storeId).toBeNull();
    expect(model.rows.map((row) => row.id)).toContain(mine.submissionId);
  });
});

/**
 * Вторая станция ТОЙ ЖЕ пиццерии со своей тревогой. Заводится запросом, а не фикстурой:
 * `createStation` каждый раз создаёт и новую пиццерию, а здесь нужна именно соседка по
 * пиццерии — без неё фильтр станции неотличим от фильтра пиццерии.
 */
async function seedNeighbourAlarm(
  label: string,
  storeId: string,
): Promise<{ stationId: string; stationName: string }> {
  const stationName = `Станция ${label} ${uniqueStationCode()}`;
  const [row] = await getDb()
    .insert(stations)
    .values({ storeId, name: stationName, code: uniqueStationCode() })
    .returning({ id: stations.id });
  if (row === undefined) {
    throw new Error(`Соседняя станция ${label} не завелась`);
  }

  const checklistId = await createChecklist({ stationId: row.id });
  const versionId = await createPublishedVersion(checklistId, sections(label));
  const submissionId = await saveSubmission({
    mode: "normal",
    versionId,
    // Провален критичный пункт: у соседней станции своя тревога, а не тишина.
    answers: [answer(`item-temp-${label}`, 9)],
    startedAt: Date.parse("2026-09-05T09:10:00Z"),
  });
  await getDb()
    .update(submissions)
    .set({ submittedAt: new Date("2026-09-05T09:12:00Z") })
    .where(eq(submissions.id, submissionId));

  return { stationId: row.id, stationName };
}

describe("buildFeedModel — полоса тревог и фильтры", () => {
  /**
   * Выбранная станция обязана сужать и полосу тревог, а не только ленту: период на
   * полосу не влияет (D053), а страна, пиццерия и станция влияют.
   *
   * Проверка заведена по T126. На порче `view.ts`, выбрасывавшей разобранный
   * `stationId`, сквозной сценарий полосы оставался ЗЕЛЁНЫМ: у пиццерии тревожила
   * ровно одна станция, и потеря фильтра ничего не меняла. Поэтому здесь у пиццерии
   * тревожат две станции — иначе проверка не отличает фильтр станции от фильтра
   * пиццерии.
   *
   * Адрес разбирается тем же `parseFeedView`, которым его разбирает маршрут: потеря
   * фильтра по дороге от адреса до запроса тревог — ровно та порча, ради которой
   * проверка и заведена.
   */
  test("выбранная станция сужает полосу тревог, а не только ленту", async () => {
    const label = "alarm-own";
    const mine = await seed(label, {
      answers: [answer(`item-temp-${label}`, 9)],
      submittedAt: new Date("2026-09-05T09:12:00Z"),
      durationMs: 120_000,
    });
    const neighbour = await seedNeighbourAlarm("alarm-neighbour", mine.storeId);

    const wholeStore = await buildFeedModel(
      parseFeedView({ store: mine.storeId }),
      "ru",
      NOW,
    );
    const oneStation = await buildFeedModel(
      parseFeedView({ store: mine.storeId, station: mine.stationId }),
      "ru",
      NOW,
    );

    // Тревожат обе станции пиццерии: иначе следующее ожидание не значило бы ничего.
    expect(wholeStore.alarms.rows).toHaveLength(2);
    expect(wholeStore.alarms.rows.map((row) => row.stationName)).toContain(
      neighbour.stationName,
    );

    expect(oneStation.alarms.rows).toHaveLength(1);
    expect(
      oneStation.alarms.rows.map((row) => row.stationName),
      "Полоса тревог показала станцию, которую фильтр не выбирал: фильтр станции " +
        "потерялся по дороге от адреса до запроса тревог.",
    ).not.toContain(neighbour.stationName);
  });
});

describe("buildFeedModel — показатели и результат строки", () => {
  test("три показателя считаются по тем же строкам, которые показаны в ленте", async () => {
    const label = "metrics";
    const first = await seed(label, {
      answers: [
        answer(`item-oven-${label}`, true),
        answer(`item-temp-${label}`, 9, "Порвано уплотнение двери"),
        answer(`item-clean-${label}`, true),
      ],
      submittedAt: new Date("2026-09-05T09:12:00Z"),
      durationMs: 204_000,
    });
    const secondId = await saveSubmission({
      mode: "normal",
      versionId: first.versionId,
      answers: [
        answer(`item-oven-${label}`, true),
        answer(`item-temp-${label}`, 3),
        answer(`item-clean-${label}`, true),
      ],
      startedAt: Date.parse("2026-09-05T10:00:00Z") - 72_000,
    });
    await getDb()
      .update(submissions)
      .set({ submittedAt: new Date("2026-09-05T10:00:00Z") })
      .where(eq(submissions.id, secondId));

    const model = await buildFeedModel(
      { stationId: first.stationId, period: "week" },
      "ru",
      NOW,
    );

    expect(model.metrics.submissionCount).toBe(model.rows.length);
    expect(model.metrics.submissionCount).toBe(2);
    expect(model.metrics.failedCriticalCount).toBe(1);
    expect(model.metrics.averageDurationMs).toBe(
      Math.round(
        model.rows.reduce((sum, row) => sum + row.durationMs, 0) /
          model.rows.length,
      ),
    );
  });

  test("непройденный НЕкритичный пункт не выдаётся за «всё выполнено»", async () => {
    const label = "warn";
    const seeded = await seed(label, {
      answers: [
        answer(`item-oven-${label}`, false),
        answer(`item-temp-${label}`, 3),
        answer(`item-clean-${label}`, true),
      ],
      submittedAt: new Date("2026-09-05T09:12:00Z"),
      durationMs: 60_000,
    });

    const model = await buildFeedModel(
      { stationId: seeded.stationId, period: "today" },
      "ru",
      NOW,
    );

    expect(model.rows[0]?.outcome).toStrictEqual({ kind: "failed", count: 1 });
  });

  test("строка ленты знает пояс своей пиццерии, а не пояс сервера", async () => {
    const label = "zone";
    const seeded = await seed(label, {
      answers: [answer(`item-oven-${label}`, true)],
      submittedAt: new Date("2026-09-05T09:12:00Z"),
      durationMs: 60_000,
      timezone: "Asia/Almaty",
    });

    const model = await buildFeedModel(
      { stationId: seeded.stationId, period: "today" },
      "ru",
      NOW,
    );

    expect(model.rows[0]?.timeZone).toBe("Asia/Almaty");
    expect(model.timeZone).toBe("Asia/Almaty");
  });

  test("пустая лента даёт нули и отсутствующее среднее, а не пропадает вместе с показателями", async () => {
    const label = "empty";
    const seeded = await seed(label, {
      answers: [answer(`item-oven-${label}`, true)],
      submittedAt: new Date("2026-08-01T09:12:00Z"),
      durationMs: 60_000,
    });

    const model = await buildFeedModel(
      { stationId: seeded.stationId, period: "today" },
      "ru",
      NOW,
    );

    expect(model.rows).toStrictEqual([]);
    expect(model.metrics).toStrictEqual({
      submissionCount: 0,
      failedCriticalCount: 0,
      averageDurationMs: null,
    });
    // Заполнение у станции есть, просто не в этом периоде: экран предложит расширить
    // период, а не будет уверять, что заполнять ещё не начинали.
    expect(model.emptyKind).toBe("period");
  });

  test("станция, на которой не заполняли ни разу, объясняется иначе, чем пустой период", async () => {
    const station = await createStation();

    const model = await buildFeedModel(
      { stationId: station.stationId, period: "month" },
      "ru",
      NOW,
    );

    expect(model.rows).toStrictEqual([]);
    expect(model.emptyKind).toBe("never");
  });

  test("отметка времени строки знает, сегодняшняя она или вчерашняя", async () => {
    const label = "when";
    const seeded = await seed(label, {
      answers: [answer(`item-oven-${label}`, true)],
      submittedAt: new Date("2026-09-04T21:40:00Z"),
      durationMs: 60_000,
    });

    const model = await buildFeedModel(
      { stationId: seeded.stationId, period: "week" },
      "ru",
      NOW,
    );

    expect(model.rows[0]?.whenKind).toBe("yesterday");
  });
});

describe("buildSubmissionModel", () => {
  test("карточка показывает ответ, время и комментарий по каждому пункту", async () => {
    const label = "card";
    const seeded = await seed(label, {
      answers: [
        answer(`item-oven-${label}`, true),
        answer(
          `item-temp-${label}`,
          9,
          "Порвано уплотнение двери, вызвал техника",
        ),
        answer(`item-clean-${label}`, true),
      ],
      submittedAt: new Date("2026-09-05T09:15:00Z"),
      durationMs: 204_000,
    });

    const card = await buildSubmissionModel(
      seeded.submissionId,
      "ru",
      FEED_PATH,
    );

    expect(card).not.toBeNull();
    expect(card?.sections.map((section) => section.title)).toStrictEqual([
      "Печь и оборудование",
      "Холодильники",
    ]);
    expect(card?.sections[1]?.fromLibrary).toBe(true);

    const temperature = card?.sections[1]?.items[0];
    expect(temperature?.title).toBe("Температура камеры");
    expect(temperature?.severity).toBe("critical");
    expect(temperature?.failed).toBe(true);
    expect(temperature?.answer).toStrictEqual({ kind: "number", value: 9 });
    expect(temperature?.comment).toBe(
      "Порвано уплотнение двери, вызвал техника",
    );
    expect(temperature?.answeredAt).toStrictEqual(
      new Date("2026-09-05T09:13:00Z"),
    );
    expect(temperature?.min).toBe(2);
    expect(temperature?.max).toBe(4);

    expect(card?.itemCount).toBe(3);
    expect(card?.doneCount).toBe(2);
    expect(card?.durationMs).toBe(204_000);
    expect(card?.outcome).toStrictEqual({ kind: "criticalFailed", count: 1 });
    expect(card?.versionPublishedAt).toBeInstanceOf(Date);
    expect(card?.backHref).toBe(FEED_PATH);
    expect(card?.checklistHref).toMatch(/^\/admin\/checklists\/[0-9a-f-]{36}$/);
  });

  test("пункт без ответа виден как неотвеченный, а не как выполненный", async () => {
    const label = "partial";
    const seeded = await seed(label, {
      answers: [answer(`item-oven-${label}`, true)],
      submittedAt: new Date("2026-09-05T09:15:00Z"),
      durationMs: 60_000,
    });

    const card = await buildSubmissionModel(
      seeded.submissionId,
      "ru",
      FEED_PATH,
    );
    const untouched = card?.sections[1]?.items[0];

    expect(untouched?.answer).toStrictEqual({ kind: "none" });
    expect(untouched?.answeredAt).toBeNull();
    expect(untouched?.failed).toBe(false);
    expect(card?.outcome).toStrictEqual({ kind: "unanswered", count: 2 });
  });

  test("правка версии не меняет карточку: пункты берутся из снимка заполнения (D002)", async () => {
    const label = "snapshot";
    const seeded = await seed(label, {
      answers: [answer(`item-oven-${label}`, true)],
      submittedAt: new Date("2026-09-05T09:15:00Z"),
      durationMs: 60_000,
    });

    const before = await buildSubmissionModel(
      seeded.submissionId,
      "ru",
      FEED_PATH,
    );

    await getDb()
      .update(checklistVersions)
      .set({ sections: sections("подменённый") })
      .where(eq(checklistVersions.id, seeded.versionId));

    const after = await buildSubmissionModel(
      seeded.submissionId,
      "ru",
      FEED_PATH,
    );

    expect(after?.sections).toStrictEqual(before?.sections);
    expect(after?.sections[0]?.items[0]?.itemId).toBe(`item-oven-${label}`);
  });

  test("название чек-листа и пунктов берётся на языке интерфейса", async () => {
    const label = "locale";
    const seeded = await seed(label, {
      answers: [answer(`item-oven-${label}`, true)],
      submittedAt: new Date("2026-09-05T09:15:00Z"),
      durationMs: 60_000,
    });

    const card = await buildSubmissionModel(
      seeded.submissionId,
      "en",
      FEED_PATH,
    );

    expect(card?.sections[0]?.items[0]?.title).toBe("Turn the oven on");
  });

  test("неизвестное заполнение — null, а не пустая карточка и не исключение", async () => {
    expect(
      await buildSubmissionModel(
        "00000000-0000-4000-8000-000000000000",
        "ru",
        FEED_PATH,
      ),
    ).toBeNull();
    expect(await buildSubmissionModel("не-uuid", "ru", FEED_PATH)).toBeNull();
  });
});

/**
 * Своя цепочка станция → чек-лист → версия → заполнение под табличный пункт
 * (D074): у общего `sections()` этого файла такого пункта нет, а колонки и
 * значение у каждого теста свои — проще собрать одну маленькую версию на пункт,
 * чем подгонять общую фикстуру под четыре разных снимка колонок.
 */
async function seedTableSubmission(
  label: string,
  options: { readonly columns?: ItemColumn[]; readonly value: TableRow[] },
): Promise<{ readonly submissionId: string; readonly itemId: string }> {
  const itemId = `item-table-${label}`;
  const station = await createStation();
  const checklistId = await createChecklist({ stationId: station.stationId });
  const tableSections: Section[] = [
    {
      id: `section-table-${label}`,
      title: { ru: "Замес теста", en: "Dough mixing" },
      source: "own",
      items: [
        {
          id: itemId,
          title: { ru: "Журнал замеса", en: "Mixing log" },
          type: "table",
          ...(options.columns === undefined
            ? {}
            : { columns: options.columns }),
        },
      ],
    },
  ];
  const versionId = await createPublishedVersion(checklistId, tableSections);
  const submissionId = await saveSubmission({
    mode: "normal",
    versionId,
    answers: [
      {
        itemId,
        value: options.value,
        at: Date.parse("2026-09-05T09:13:00Z"),
      },
    ],
    startedAt: Date.parse("2026-09-05T09:00:00Z"),
  });
  return { submissionId, itemId };
}

describe("buildSubmissionModel — табличный ответ (D074)", () => {
  test("обычная таблица приходит строками и колонками, а не строкой [object Object]", async () => {
    const columns: ItemColumn[] = [
      { id: "temp", title: { ru: "Темп.", en: "Temp." } },
      { id: "time", title: { ru: "Время", en: "Time" } },
    ];
    const seeded = await seedTableSubmission("basic", {
      columns,
      value: [
        { temp: "24", time: "12:00" },
        { temp: "23", time: "12:30" },
      ],
    });

    const card = await buildSubmissionModel(
      seeded.submissionId,
      "ru",
      FEED_PATH,
    );
    const item = card?.sections[0]?.items[0];

    expect(item?.answer).toStrictEqual({
      kind: "table",
      columns: ["Темп.", "Время"],
      rows: [
        ["24", "12:00"],
        ["23", "12:30"],
      ],
    });
  });

  test("клетка, которой нет в строке, показывается пустой, а не сдвигает соседние колонки", async () => {
    const columns: ItemColumn[] = [
      { id: "a", title: { ru: "А" } },
      { id: "b", title: { ru: "Б" } },
    ];
    const seeded = await seedTableSubmission("missing-cell", {
      columns,
      value: [{ a: "1" }],
    });

    const card = await buildSubmissionModel(
      seeded.submissionId,
      "ru",
      FEED_PATH,
    );
    const item = card?.sections[0]?.items[0];

    expect(item?.answer).toStrictEqual({
      kind: "table",
      columns: ["А", "Б"],
      rows: [["1", ""]],
    });
  });

  test("ключ, которого нет среди колонок снимка, отбрасывается — снимок главный (D002)", async () => {
    const columns: ItemColumn[] = [
      { id: "a", title: { ru: "А" } },
      { id: "b", title: { ru: "Б" } },
    ];
    const seeded = await seedTableSubmission("stray-key", {
      columns,
      value: [{ a: "1", b: "2", c: "лишнее" }],
    });

    const card = await buildSubmissionModel(
      seeded.submissionId,
      "ru",
      FEED_PATH,
    );
    const item = card?.sections[0]?.items[0];

    expect(item?.answer).toStrictEqual({
      kind: "table",
      columns: ["А", "Б"],
      rows: [["1", "2"]],
    });
  });

  test("табличный пункт без колонок в снимке — показывать нечего", async () => {
    const seeded = await seedTableSubmission("no-columns", {
      value: [{ a: "1" }],
    });

    const card = await buildSubmissionModel(
      seeded.submissionId,
      "ru",
      FEED_PATH,
    );
    const item = card?.sections[0]?.items[0];

    expect(item?.answer).toStrictEqual({
      kind: "table",
      columns: [],
      rows: [],
    });
  });
});

describe("предел выдачи ленты", () => {
  test("лента, не упёршаяся в предел, не пугает предупреждением", async () => {
    const label = "limit";
    const seeded = await seed(label, {
      answers: [answer(`item-oven-${label}`, true)],
      submittedAt: new Date("2026-09-05T09:12:00Z"),
      durationMs: 60_000,
    });

    const model = await buildFeedModel(
      { stationId: seeded.stationId, period: "today" },
      "ru",
      NOW,
    );

    expect(model.limitReached).toBe(false);
  });
});
