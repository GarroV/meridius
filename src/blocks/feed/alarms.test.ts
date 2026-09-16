// Тревоги на настоящей базе. Проверяется ровно то, за что они отвечают: провал
// критичного пункта и пропущенный чек-лист — и оба считаются запросом в момент
// обращения, без таблицы состояний и без «закрытия дня» (D053).
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, test } from "vitest";

import {
  checklists,
  saveSubmission,
  setShiftMode,
  stores,
  submissions,
} from "@/blocks/data";
import type { Answer, Section, ShiftMode } from "@/blocks/data";
import { closeTestDb, getTestDb } from "@/blocks/data/testing/db";
import {
  createChecklist,
  createPublishedVersion,
  createStation,
} from "@/blocks/data/testing/fixtures";

import type { Alarm } from "./alarms";
import type { FeedScope } from "./scope";
import { listAlarms } from "./alarms";

const db = getTestDb();
afterAll(closeTestDb);

/** Сами тревоги: предел выдачи проверяется отдельно, а не в каждом сценарии. */
async function alarmsOf(scope: FeedScope, at: Date): Promise<readonly Alarm[]> {
  return (await listAlarms(scope, at)).alarms;
}

/** 06.09.2026. Утреннее окно 06:00–12:00 в 09:00 открыто, в 14:00 давно закрыто. */
const MORNING = new Date("2026-09-06T09:00:00Z");
const AFTERNOON = new Date("2026-09-06T14:00:00Z");

const GAS: Section["items"][number] = {
  id: "i-gas",
  title: { ru: "Газ выключен", en: "Gas off" },
  type: "bool",
  severity: "critical",
};

const TABLES: Section["items"][number] = {
  id: "i-tables",
  title: { ru: "Столы протёрты", en: "Tables wiped" },
  type: "bool",
  severity: "normal",
};

function sections(items: readonly Section["items"][number][]): Section[] {
  return [
    {
      id: "s-1",
      title: { ru: "Секция", en: "Section" },
      source: "own",
      items: [...items],
    },
  ];
}

interface Prepared {
  readonly countryId: string;
  readonly storeId: string;
  readonly stationId: string;
  readonly checklistId: string;
  readonly versionId: string;
}

interface PrepareOptions {
  readonly items?: readonly Section["items"][number][];
  readonly timezone?: string;
  readonly windowStart?: string;
  readonly windowEnd?: string;
}

/** Опубликованный чек-лист на своей станции: минимум, при котором тревога возможна. */
async function prepare(options: PrepareOptions = {}): Promise<Prepared> {
  const station = await createStation({
    ...(options.timezone === undefined ? {} : { timezone: options.timezone }),
  });
  const checklistId = await createChecklist({
    stationId: station.stationId,
    windowStart: options.windowStart ?? "06:00:00",
    windowEnd: options.windowEnd ?? "12:00:00",
  });
  const versionId = await createPublishedVersion(
    checklistId,
    sections(options.items ?? [GAS, TABLES]),
  );
  return {
    countryId: station.countryId,
    storeId: station.storeId,
    stationId: station.stationId,
    checklistId,
    versionId,
  };
}

function answer(itemId: string, value: boolean, at: Date): Answer {
  return { itemId, value, at: at.getTime() };
}

/**
 * Заполнение с заданным временем отправки. `submitted_at` ставит база (`now()`),
 * а тревоги смотрят именно на него — проверить окно иначе нечем.
 */
async function fill(
  versionId: string,
  submittedAt: Date,
  answers: Answer[],
  mode: ShiftMode = "normal",
): Promise<string> {
  const id = await saveSubmission({
    mode,
    versionId,
    answers,
    startedAt: submittedAt.getTime() - 60_000,
  });
  await db
    .update(submissions)
    .set({ submittedAt })
    .where(eq(submissions.id, id));
  return id;
}

describe("провал критичного пункта — тревога", () => {
  test("критичный пункт не выполнен: тревога с числом провалов", async () => {
    const { storeId, versionId } = await prepare();
    await fill(versionId, MORNING, [
      answer("i-gas", false, MORNING),
      answer("i-tables", true, MORNING),
    ]);

    const alarms = await alarmsOf({ storeId }, AFTERNOON);

    expect(alarms).toHaveLength(1);
    expect(alarms[0]).toMatchObject({ kind: "criticalFailed", itemCount: 1 });
  });

  test("провален только обычный пункт: тревоги нет", async () => {
    // Обычный пункт тревогой не звучит намеренно: иначе полоса заполнится непротёртыми
    // столами и перестанет читаться там, где написано «газ».
    const { storeId, versionId } = await prepare();
    await fill(versionId, MORNING, [
      answer("i-gas", true, MORNING),
      answer("i-tables", false, MORNING),
    ]);

    expect(await alarmsOf({ storeId }, AFTERNOON)).toStrictEqual([]);
  });

  test("критичный пункт оставили без ответа — своя тревога, а не тишина", async () => {
    // Неполное заполнение продукт принимает сознательно, поэтому «газ» можно просто
    // не тронуть: провала нет (ответа нет), пропуска нет (заполнение есть). Без
    // отдельной тревоги самый важный пункт уходил бы из надзора молча.
    const { storeId, versionId } = await prepare();
    await fill(versionId, MORNING, [answer("i-tables", true, MORNING)]);

    const alarms = await alarmsOf({ storeId }, AFTERNOON);

    expect(alarms).toHaveLength(1);
    expect(alarms[0]).toMatchObject({
      kind: "criticalUnanswered",
      itemCount: 1,
    });
  });

  test("часть критичных провалена, часть не тронута — обе тревоги", async () => {
    const station = await createStation();
    const checklistId = await createChecklist({
      stationId: station.stationId,
      windowStart: "06:00:00",
      windowEnd: "12:00:00",
    });
    const versionId = await createPublishedVersion(checklistId, [
      {
        id: "s-1",
        title: { ru: "Секция", en: "Section" },
        source: "own",
        items: [
          GAS,
          {
            id: "i-hood",
            title: { ru: "Вытяжка выключена", en: "Hood off" },
            type: "bool",
            severity: "critical",
          },
        ],
      },
    ]);
    await fill(versionId, MORNING, [answer("i-gas", false, MORNING)]);

    const alarms = await alarmsOf({ storeId: station.storeId }, AFTERNOON);

    // Провал впереди молчания, и каждая тревога говорит про своё одной строкой.
    expect(alarms.map((alarm) => alarm.kind)).toStrictEqual([
      "criticalFailed",
      "criticalUnanswered",
    ]);
  });

  test("вчерашний провал сегодня не звучит", async () => {
    const { storeId, versionId } = await prepare();
    await fill(versionId, new Date("2026-09-05T09:00:00Z"), [
      answer("i-gas", false, new Date("2026-09-05T09:00:00Z")),
    ]);

    const alarms = await alarmsOf({ storeId }, AFTERNOON);

    // Осталась только тревога о незаполненном сегодня чек-листе — но не вчерашний провал.
    expect(alarms.map((alarm) => alarm.kind)).toStrictEqual(["missed"]);
  });
});

describe("критичный пункт без ответа — по закрытию окна", () => {
  // Тревога об отсутствии ответа — про работу, которую УЖЕ нельзя доделать, а не про
  // работу, которую ещё не бросили. Пока окно открыто, сотрудник вернётся к «газу»
  // штатным порядком, и полоса, кричащая об этом в момент отправки, подсвечивает
  // недоработку продукта, а не сети. Момент подъёма — тот же, что у пропущенного
  // чек-листа: закрытие окна за эти сутки (D054).

  test("окно ещё открыто: молчим — дозаполнить пока можно", async () => {
    const { storeId, versionId } = await prepare();
    await fill(versionId, MORNING, [answer("i-tables", true, MORNING)]);

    expect(await alarmsOf({ storeId }, MORNING)).toStrictEqual([]);
  });

  test("окно закрылось: тревога поднялась", async () => {
    const { storeId, versionId } = await prepare();
    const submissionId = await fill(versionId, MORNING, [
      answer("i-tables", true, MORNING),
    ]);

    const alarms = await alarmsOf({ storeId }, AFTERNOON);

    expect(alarms).toHaveLength(1);
    expect(alarms[0]).toMatchObject({
      kind: "criticalUnanswered",
      itemCount: 1,
      submissionId,
    });
  });

  test("провал критичного звучит сразу, окна не ждёт", async () => {
    // Разные по природе события: провал СЛУЧИЛСЯ и известен точно, отсутствие ответа
    // станет фактом только с закрытием окна. Задержать провал до полудня значило бы
    // придержать единственное, что требует вмешательства прямо сейчас.
    const { storeId, versionId } = await prepare();
    await fill(versionId, MORNING, [answer("i-gas", false, MORNING)]);

    const alarms = await alarmsOf({ storeId }, MORNING);

    expect(alarms.map((alarm) => alarm.kind)).toStrictEqual(["criticalFailed"]);
  });

  test("окно через полночь: вечерний проход закрылся в полночь", async () => {
    // Тот же разворот, что у пропущенного: берётся проход, закончившийся СЕГОДНЯ.
    // По дате отправки вечернее заполнение не попало бы в надзор никогда — его сутки
    // кончаются раньше, чем закрывается его же окно.
    const evening = new Date("2026-09-05T21:00:00Z");
    const { storeId, versionId } = await prepare({
      windowStart: "20:00:00",
      windowEnd: "00:00:00",
    });
    await fill(versionId, evening, [answer("i-tables", true, evening)]);

    const alarms = await alarmsOf(
      { storeId },
      new Date("2026-09-06T00:30:00Z"),
    );

    expect(alarms.map((alarm) => alarm.kind)).toStrictEqual([
      "criticalUnanswered",
    ]);
  });

  test("тот же вечерний проход до полуночи ещё молчит", async () => {
    const evening = new Date("2026-09-05T21:00:00Z");
    const { storeId, versionId } = await prepare({
      windowStart: "20:00:00",
      windowEnd: "00:00:00",
    });
    await fill(versionId, evening, [answer("i-tables", true, evening)]);

    const alarms = await alarmsOf(
      { storeId },
      new Date("2026-09-05T23:00:00Z"),
    );

    // Осталась тревога о ПОЗАВЧЕРАШНЕМ вечере: его проход закрылся сегодня в полночь
    // и заполнен не был. Идущий прямо сейчас проход при этом молчит — это и есть
    // разница между «окно закрылось» и «идёт смена».
    expect(alarms.map((alarm) => alarm.kind)).toStrictEqual(["missed"]);
  });
});

describe("незаполненный чек-лист — тревога", () => {
  test("окно закрылось, заполнения нет: пропущен", async () => {
    const { storeId, stationId, checklistId } = await prepare();

    const alarms = await alarmsOf({ storeId }, AFTERNOON);

    expect(alarms).toHaveLength(1);
    expect(alarms[0]).toMatchObject({
      kind: "missed",
      stationId,
      checklistId,
      submissionId: null,
    });
  });

  test("окно ещё открыто: не пропущен", async () => {
    const { storeId } = await prepare();

    expect(await alarmsOf({ storeId }, MORNING)).toStrictEqual([]);
  });

  test("заполнили внутри окна: не пропущен", async () => {
    const { storeId, versionId } = await prepare();
    await fill(versionId, MORNING, [
      answer("i-gas", true, MORNING),
      answer("i-tables", true, MORNING),
    ]);

    expect(await alarmsOf({ storeId }, AFTERNOON)).toStrictEqual([]);
  });

  test("вчерашнее заполнение сегодняшнее окно не закрывает", async () => {
    const { storeId, versionId } = await prepare();
    const yesterday = new Date("2026-09-05T09:00:00Z");
    await fill(versionId, yesterday, [answer("i-gas", true, yesterday)]);

    const alarms = await alarmsOf({ storeId }, AFTERNOON);

    expect(alarms.map((alarm) => alarm.kind)).toStrictEqual(["missed"]);
  });

  test("снятый с работы чек-лист не пропущен: его убрали из работы", async () => {
    const { storeId, checklistId } = await prepare();
    await db
      .update(checklists)
      .set({ archivedAt: new Date() })
      .where(eq(checklists.id, checklistId));

    expect(await alarmsOf({ storeId }, AFTERNOON)).toStrictEqual([]);
  });

  test("чек-лист без опубликованной версии не пропущен: заполнять было нечего", async () => {
    const station = await createStation();
    await createChecklist({
      stationId: station.stationId,
      windowStart: "06:00:00",
      windowEnd: "12:00:00",
    });

    expect(
      await alarmsOf({ storeId: station.storeId }, AFTERNOON),
    ).toStrictEqual([]);
  });
});

describe("на станции несколько чек-листов (#60)", () => {
  test("пропущены оба: тревога считает по чек-листам, а не по одному на станцию", async () => {
    const morning = await prepare();
    // Второй чек-лист ТОЙ ЖЕ станции с пересекающимся окном — расстановка боевого
    // пакета: обход менеджера идёт поверх приёма смены.
    const roundId = await createChecklist({
      stationId: morning.stationId,
      windowStart: "08:00:00",
      windowEnd: "13:00:00",
    });
    await createPublishedVersion(roundId, sections([GAS]));

    const alarms = await alarmsOf({ stationId: morning.stationId }, AFTERNOON);
    const missed = alarms.filter((alarm) => alarm.kind === "missed");
    expect(missed.map((alarm) => alarm.checklistId).sort()).toEqual(
      [morning.checklistId, roundId].sort(),
    );
  });

  test("заполнили один — второй остаётся пропущенным, а не закрывается за компанию", async () => {
    const morning = await prepare();
    const roundId = await createChecklist({
      stationId: morning.stationId,
      windowStart: "08:00:00",
      windowEnd: "13:00:00",
    });
    await createPublishedVersion(roundId, sections([GAS]));

    await fill(morning.versionId, MORNING, [answer("i-gas", true, MORNING)]);

    const alarms = await alarmsOf({ stationId: morning.stationId }, AFTERNOON);
    const missed = alarms.filter((alarm) => alarm.kind === "missed");
    expect(missed.map((alarm) => alarm.checklistId)).toEqual([roundId]);
  });
});

describe("окно через полночь", () => {
  test("вечернее закрытие не сделали: тревога после полуночи", async () => {
    const { storeId } = await prepare({
      windowStart: "20:00:00",
      windowEnd: "00:00:00",
    });

    const alarms = await alarmsOf(
      { storeId },
      new Date("2026-09-06T01:00:00Z"),
    );

    expect(alarms.map((alarm) => alarm.kind)).toStrictEqual(["missed"]);
  });

  test("вечернее закрытие сделали вчера вечером: тревоги нет", async () => {
    const { storeId, versionId } = await prepare({
      windowStart: "20:00:00",
      windowEnd: "00:00:00",
    });
    const evening = new Date("2026-09-05T21:00:00Z");
    await fill(versionId, evening, [answer("i-gas", true, evening)]);

    expect(
      await alarmsOf({ storeId }, new Date("2026-09-06T01:00:00Z")),
    ).toStrictEqual([]);
  });
});

describe("часовой пояс пиццерии решает, закрылось ли окно", () => {
  test("в 08:00 UTC окно закрыто в Алматы и открыто в поясе UTC", async () => {
    // Одно и то же мгновение: 13:00 по местному времени в Алматы и 08:00 в UTC.
    const almaty = await prepare({ timezone: "Asia/Almaty" });
    const utc = await prepare();
    const at = new Date("2026-09-06T08:00:00Z");

    expect(
      (await alarmsOf({ storeId: almaty.storeId }, at)).map(
        (alarm) => alarm.kind,
      ),
    ).toStrictEqual(["missed"]);
    expect(await alarmsOf({ storeId: utc.storeId }, at)).toStrictEqual([]);
  });
});

describe("режим смены отменяет чек-лист вместе с тревогой", () => {
  test("в критичную смену чек-лист без критичных пунктов не пропущен", async () => {
    // Режим сам не показал этот чек-лист сотруднику: требовать его задним числом
    // значит ругать смену за работу, которой от неё не ждали (D054, D056).
    const { storeId } = await prepare({ items: [TABLES] });
    await setShiftMode({ storeId, mode: "critical" }, MORNING);

    expect(await alarmsOf({ storeId }, AFTERNOON)).toStrictEqual([]);
  });

  test("в критичную смену чек-лист с критичным пунктом всё равно пропущен", async () => {
    const { storeId } = await prepare();
    await setShiftMode({ storeId, mode: "critical" }, MORNING);

    expect(
      (await alarmsOf({ storeId }, AFTERNOON)).map((a) => a.kind),
    ).toStrictEqual(["missed"]);
  });

  test("смена с ограничениями: обычные пункты не спасают чек-лист от тревоги", async () => {
    const { storeId } = await prepare({ items: [GAS, TABLES] });
    await setShiftMode({ storeId, mode: "reduced" }, MORNING);

    expect(
      (await alarmsOf({ storeId }, AFTERNOON)).map((a) => a.kind),
    ).toStrictEqual(["missed"]);
  });
});

describe("область видимости", () => {
  test("тревога соседней пиццерии в выборку не попадает", async () => {
    const mine = await prepare();
    await prepare();

    const alarms = await alarmsOf({ storeId: mine.storeId }, AFTERNOON);

    expect(alarms).toHaveLength(1);
    expect(alarms[0]?.storeId).toBe(mine.storeId);
  });

  test("фильтр по станции сужает до неё одной", async () => {
    const station = await createStation();
    const first = await createChecklist({
      stationId: station.stationId,
      windowStart: "06:00:00",
      windowEnd: "12:00:00",
    });
    await createPublishedVersion(first, sections([GAS]));
    const other = await createStation();
    const second = await createChecklist({
      stationId: other.stationId,
      windowStart: "06:00:00",
      windowEnd: "12:00:00",
    });
    await createPublishedVersion(second, sections([GAS]));

    const alarms = await alarmsOf({ stationId: station.stationId }, AFTERNOON);

    expect(alarms).toHaveLength(1);
    expect(alarms[0]?.stationId).toBe(station.stationId);
  });

  test("фильтр по стране берёт её пиццерии и не берёт чужие", async () => {
    const mine = await prepare();
    await prepare();

    const alarms = await alarmsOf({ countryId: mine.countryId }, AFTERNOON);

    expect(alarms).toHaveLength(1);
    expect(alarms[0]?.storeId).toBe(mine.storeId);
  });
});

describe("сломанный часовой пояс не снимает надзор молча (T062)", () => {
  /** Имя зоны с опечаткой: продукт такое не принимает, но база могла его потерять. */
  const TYPO = "Asia/Almatyy";

  test("пиццерия с непризнаваемым поясом выпадает — и попадает в счёт", async () => {
    const broken = await prepare();
    await db
      .update(stores)
      .set({ timezone: TYPO })
      .where(eq(stores.id, broken.storeId));

    const list = await listAlarms({ countryId: broken.countryId }, AFTERNOON);

    expect(list.alarms).toStrictEqual([]);
    expect(list.unknownTimezoneStores).toBe(1);
  });

  test("сломанный пояс чужой пиццерии не роняет тревоги своей", async () => {
    // Ровно то, из-за чего надзор за всей сетью был бы отказом экрана целиком:
    // выборка идёт по многим пиццериям, и одно незнакомое имя зоны роняло весь запрос.
    const mine = await prepare();
    const broken = await prepare();
    await db
      .update(stores)
      .set({ timezone: TYPO })
      .where(eq(stores.id, broken.storeId));

    const list = await listAlarms({ countryId: mine.countryId }, AFTERNOON);

    expect(list.alarms.map((alarm) => alarm.kind)).toStrictEqual(["missed"]);
    expect(list.unknownTimezoneStores).toBe(0);
  });
});
