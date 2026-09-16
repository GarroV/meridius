// Публикация версий и выбор версии для станции. Всё на настоящей базе: правила
// держатся индексами и транзакциями, а их заглушкой не проверить.
import { and, eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, test } from "vitest";

import {
  getDraft,
  getPublishedVersionForStation,
  listPublishedVersionsForStation,
  publishVersion,
} from "./checklists";
import { checklistVersions, checklists } from "./schema";
import { closeTestDb, getTestDb } from "./testing/db";
import {
  createChecklist,
  createDraft,
  createPublishedVersion,
  createStation,
  sampleSections,
  uniqueStationCode,
} from "./testing/fixtures";

const db = getTestDb();

afterAll(closeTestDb);

const MORNING = { windowStart: "06:00:00", windowEnd: "12:00:00" };
const EVENING = { windowStart: "18:00:00", windowEnd: "23:00:00" };
// Запас на разницу между временем базы и моментом проверки в тесте.
const MAX_CLOCK_DRIFT_MS = 5000;

function at(hours: number, minutes = 0): Date {
  return new Date(Date.UTC(2026, 8, 6, hours, minutes, 0));
}

/** Строка версии целиком, как её видит база: сравнение «до и после» идёт по всем полям. */
async function versionRow(id: string): Promise<Record<string, unknown>> {
  const result = await db.execute<{ row: Record<string, unknown> }>(
    sql`select to_jsonb(v) as row from checklist_versions v where v.id = ${id}`,
  );
  const row = result.rows[0]?.row;
  if (row === undefined) throw new Error(`Версии ${id} нет в базе`);
  return row;
}

async function versionsOf(
  checklistId: string,
): Promise<{ id: string; status: string; versionNumber: number | null }[]> {
  return db
    .select({
      id: checklistVersions.id,
      status: checklistVersions.status,
      versionNumber: checklistVersions.versionNumber,
    })
    .from(checklistVersions)
    .where(eq(checklistVersions.checklistId, checklistId))
    .orderBy(checklistVersions.versionNumber);
}

describe("publishVersion", () => {
  test("публикует черновик новой строкой, черновик остаётся на месте", async () => {
    const checklistId = await createChecklist();
    const draftId = await createDraft(checklistId, sampleSections("первый"));

    const published = await publishVersion(checklistId);

    expect(published.id).not.toBe(draftId);
    expect(published.status).toBe("published");
    expect(published.versionNumber).toBe(1);
    expect(published.sections).toStrictEqual(sampleSections("первый"));
    const draft = await getDraft(checklistId);
    expect(draft?.id).toBe(draftId);
  });

  test("прежняя версия не меняется ничем, кроме признака состояния", async () => {
    const checklistId = await createChecklist();
    await createDraft(checklistId, sampleSections("старый"));
    const first = await publishVersion(checklistId);
    const before = await versionRow(first.id);

    await db
      .update(checklistVersions)
      .set({ sections: sampleSections("новый") })
      .where(
        and(
          eq(checklistVersions.checklistId, checklistId),
          eq(checklistVersions.status, "draft"),
        ),
      );
    await publishVersion(checklistId);
    const after = await versionRow(first.id);

    // Содержимое прежней версии обязано совпасть до последнего поля;
    // разрешено измениться только состоянию: published → archived.
    expect({ ...after, status: before["status"] }).toStrictEqual(before);
    expect(after["status"]).toBe("archived");
    expect(before["status"]).toBe("published");
  });

  test("номер версии растёт, опубликованной остаётся одна", async () => {
    const checklistId = await createChecklist();
    await createDraft(checklistId, sampleSections("v"));
    await publishVersion(checklistId);
    await publishVersion(checklistId);
    await publishVersion(checklistId);

    const versions = await versionsOf(checklistId);
    expect(versions.map((each) => each.versionNumber)).toStrictEqual([
      1,
      2,
      3,
      null,
    ]);
    expect(versions.filter((each) => each.status === "published")).toHaveLength(
      1,
    );
    expect(versions.filter((each) => each.status === "archived")).toHaveLength(
      2,
    );
  });

  test("без черновика публикация падает с внятной причиной", async () => {
    const checklistId = await createChecklist();

    await expect(publishVersion(checklistId)).rejects.toThrow(/черновик/i);
  });

  test("две одновременные публикации дают две версии, а не одну сломанную", async () => {
    const checklistId = await createChecklist();
    await createDraft(checklistId, sampleSections("гонка"));

    await Promise.all([
      publishVersion(checklistId),
      publishVersion(checklistId),
    ]);

    const versions = await versionsOf(checklistId);
    expect(versions.filter((each) => each.status === "published")).toHaveLength(
      1,
    );
    expect(
      versions
        .filter((each) => each.versionNumber !== null)
        .map((each) => each.versionNumber),
    ).toStrictEqual([1, 2]);
  });

  test("время публикации берётся у базы, а не у вызывающего", async () => {
    const checklistId = await createChecklist();
    await createDraft(checklistId, sampleSections("время"));

    const published = await publishVersion(checklistId);

    // Сырой запрос через execute отдаёт время строкой: разбор типов Drizzle
    // применяет к колонкам схемы, а не к произвольному выражению.
    const now = await db.execute<{ now: string }>(sql`select now() as now`);
    const serverNow = now.rows[0]?.now;
    expect(serverNow).toBeDefined();
    expect(published.publishedAt).not.toBeNull();
    const drift = Math.abs(
      new Date(serverNow ?? 0).getTime() -
        (published.publishedAt?.getTime() ?? 0),
    );
    expect(drift).toBeLessThan(MAX_CLOCK_DRIFT_MS);
  });

  test("публикация не трогает версию, на которую уже ссылается заполнение", async () => {
    const checklistId = await createChecklist();
    await createDraft(checklistId, sampleSections("исторический"));
    const first = await publishVersion(checklistId);
    const before = await versionRow(first.id);

    await publishVersion(checklistId);

    const after = await versionRow(first.id);
    expect(after["sections"]).toStrictEqual(before["sections"]);
    expect(after["created_at"]).toStrictEqual(before["created_at"]);
    expect(after["published_at"]).toStrictEqual(before["published_at"]);
  });
});

describe("getDraft", () => {
  test("возвращает черновик чек-листа", async () => {
    const checklistId = await createChecklist();
    const draftId = await createDraft(checklistId, sampleSections("черновик"));

    expect((await getDraft(checklistId))?.id).toBe(draftId);
  });

  test("без черновика возвращает null, а не исключение", async () => {
    const checklistId = await createChecklist();

    expect(await getDraft(checklistId)).toBeNull();
  });

  test("не отдаёт опубликованную версию под видом черновика", async () => {
    const checklistId = await createChecklist();
    await createPublishedVersion(checklistId, sampleSections("опубликован"));

    expect(await getDraft(checklistId)).toBeNull();
  });
});

async function stationWithTwoChecklists(): Promise<{
  code: string;
  morningVersionId: string;
  eveningVersionId: string;
}> {
  const station = await createStation();
  const morning = await createChecklist({
    stationId: station.stationId,
    ...MORNING,
  });
  const evening = await createChecklist({
    stationId: station.stationId,
    ...EVENING,
  });
  return {
    code: station.stationCode,
    morningVersionId: await createPublishedVersion(
      morning,
      sampleSections("утро"),
    ),
    eveningVersionId: await createPublishedVersion(
      evening,
      sampleSections("вечер"),
    ),
  };
}

describe("getPublishedVersionForStation", () => {
  test("снятый с работы чек-лист по наклейке не открывается", async () => {
    // Наклейка на станции живёт годами и переклейке не подлежит: сняли чек-лист с работы —
    // сканирование обязано вести в «нечего заполнять», а не открывать снятое.
    const station = await createStation();
    const checklistId = await createChecklist({
      stationId: station.stationId,
      ...MORNING,
    });
    await createPublishedVersion(checklistId, sampleSections("утро"));

    const before = await getPublishedVersionForStation(
      station.stationCode,
      at(9),
    );
    expect(before).not.toBeNull();

    await getTestDb()
      .update(checklists)
      .set({ archivedAt: new Date() })
      .where(eq(checklists.id, checklistId));

    expect(
      await getPublishedVersionForStation(station.stationCode, at(9)),
    ).toBeNull();
  });

  test("в 09:00 отдаёт утренний чек-лист", async () => {
    const { code, morningVersionId } = await stationWithTwoChecklists();

    const found = await getPublishedVersionForStation(code, at(9));

    expect(found?.version.id).toBe(morningVersionId);
  });

  test("в 21:00 отдаёт вечерний чек-лист", async () => {
    const { code, eveningVersionId } = await stationWithTwoChecklists();

    const found = await getPublishedVersionForStation(code, at(21));

    expect(found?.version.id).toBe(eveningVersionId);
  });

  test("в 15:00 не отдаёт ничего: подходящего окна нет", async () => {
    const { code } = await stationWithTwoChecklists();

    expect(await getPublishedVersionForStation(code, at(15))).toBeNull();
  });

  test("неизвестный код станции даёт null, а не исключение и не чужие данные", async () => {
    await stationWithTwoChecklists();

    expect(
      await getPublishedVersionForStation(uniqueStationCode(), at(9)),
    ).toBeNull();
  });

  test("пустой код станции тоже даёт null", async () => {
    expect(await getPublishedVersionForStation("", at(9))).toBeNull();
  });

  test("отдаёт чек-лист своей станции, а не соседней", async () => {
    const mine = await stationWithTwoChecklists();
    const neighbour = await stationWithTwoChecklists();

    const found = await getPublishedVersionForStation(mine.code, at(9));

    expect(found?.version.id).toBe(mine.morningVersionId);
    expect(found?.version.id).not.toBe(neighbour.morningVersionId);
  });

  test("границы окна: начало включительно, конец исключительно", async () => {
    const { code, morningVersionId } = await stationWithTwoChecklists();

    expect((await getPublishedVersionForStation(code, at(6)))?.version.id).toBe(
      morningVersionId,
    );
    expect(await getPublishedVersionForStation(code, at(12))).toBeNull();
  });

  test("окно через полночь работает в обе стороны от суточной границы", async () => {
    const station = await createStation();
    const night = await createChecklist({
      stationId: station.stationId,
      windowStart: "22:00:00",
      windowEnd: "02:00:00",
    });
    const versionId = await createPublishedVersion(
      night,
      sampleSections("ночь"),
    );

    expect(
      (await getPublishedVersionForStation(station.stationCode, at(23, 30)))
        ?.version.id,
    ).toBe(versionId);
    expect(
      (await getPublishedVersionForStation(station.stationCode, at(1)))?.version
        .id,
    ).toBe(versionId);
    expect(
      await getPublishedVersionForStation(station.stationCode, at(12)),
    ).toBeNull();
  });

  test("окно сравнивается с местным временем пиццерии, а не с UTC", async () => {
    // Алма-Ата живёт на UTC+5: утренний чек-лист там открывается в 04:00 UTC.
    const station = await createStation({ timezone: "Asia/Almaty" });
    const checklistId = await createChecklist({
      stationId: station.stationId,
      ...MORNING,
    });
    const versionId = await createPublishedVersion(
      checklistId,
      sampleSections("местное время"),
    );

    expect(
      (await getPublishedVersionForStation(station.stationCode, at(4)))?.version
        .id,
    ).toBe(versionId);
    // 09:00 UTC — это 14:00 по местному, окно уже закрыто.
    expect(
      await getPublishedVersionForStation(station.stationCode, at(9)),
    ).toBeNull();
  });

  test("черновик наружу не уходит", async () => {
    const station = await createStation();
    const checklistId = await createChecklist({
      stationId: station.stationId,
      ...MORNING,
    });
    await createDraft(checklistId, sampleSections("черновик"));

    expect(
      await getPublishedVersionForStation(station.stationCode, at(9)),
    ).toBeNull();
  });

  test("после публикации следующей версии отдаётся новая", async () => {
    const station = await createStation();
    const checklistId = await createChecklist({
      stationId: station.stationId,
      ...MORNING,
    });
    await createDraft(checklistId, sampleSections("первая"));
    const first = await publishVersion(checklistId);
    await db
      .update(checklistVersions)
      .set({ sections: sampleSections("вторая") })
      .where(
        and(
          eq(checklistVersions.checklistId, checklistId),
          eq(checklistVersions.status, "draft"),
        ),
      );
    const second = await publishVersion(checklistId);

    const found = await getPublishedVersionForStation(
      station.stationCode,
      at(9),
    );

    expect(found?.version.id).toBe(second.id);
    expect(found?.version.id).not.toBe(first.id);
    expect(found?.version.sections).toStrictEqual(sampleSections("вторая"));
  });

  test("вместе с версией отдаёт чек-лист и станцию: экрану заполнения нужно всё сразу", async () => {
    const station = await createStation();
    const checklistId = await createChecklist({
      stationId: station.stationId,
      ...MORNING,
      title: { ru: "Утро", en: "Morning" },
    });
    await createPublishedVersion(checklistId, sampleSections("состав"));

    const found = await getPublishedVersionForStation(
      station.stationCode,
      at(9),
    );

    expect(found?.checklist.title).toStrictEqual({ ru: "Утро", en: "Morning" });
    expect(found?.station.id).toBe(station.stationId);
    expect(found?.station.code).toBe(station.stationCode);
  });

  test("после переноса чек-листа его прежняя версия не отдаётся на новой станции", async () => {
    // Версия принадлежит станции, для которой опубликована: её станция заморожена
    // в момент публикации. Отдать такую версию на новой станции значило бы записать
    // заполнение, сделанное здесь, в историю прежней станции.
    const first = await createStation();
    const checklistId = await createChecklist({
      stationId: first.stationId,
      ...MORNING,
    });
    await createPublishedVersion(checklistId, sampleSections("перенос"));
    const second = await createStation();
    await db
      .update(checklists)
      .set({ stationId: second.stationId })
      .where(eq(checklists.id, checklistId));

    expect(
      await getPublishedVersionForStation(second.stationCode, at(9)),
    ).toBeNull();
  });

  test("чек-лист без станции по коду не находится", async () => {
    const checklistId = await createChecklist({ stationId: null, ...MORNING });
    await createPublishedVersion(checklistId, sampleSections("ничей"));
    const station = await createStation();

    expect(
      await getPublishedVersionForStation(station.stationCode, at(9)),
    ).toBeNull();
  });

  test("если окна двух чек-листов станции пересекаются, побеждает начинающийся раньше", async () => {
    // Правило описано только комментарием в реализации и ни разу не проверялось
    // тестом: до сих пор окна станции в тестах никогда не пересекались.
    const station = await createStation();
    const earlier = await createChecklist({
      stationId: station.stationId,
      windowStart: "06:00:00",
      windowEnd: "14:00:00",
    });
    const later = await createChecklist({
      stationId: station.stationId,
      windowStart: "10:00:00",
      windowEnd: "18:00:00",
    });
    const earlierVersionId = await createPublishedVersion(
      earlier,
      sampleSections("раннее"),
    );
    const laterVersionId = await createPublishedVersion(
      later,
      sampleSections("позднее"),
    );

    // 12:00 попадает в оба окна: побеждает то, что начинается раньше.
    expect(
      (await getPublishedVersionForStation(station.stationCode, at(12)))
        ?.version.id,
    ).toBe(earlierVersionId);
    // 16:00 попадает только во второе окно — так видно, что правило не «всегда
    // первый созданный чек-лист», а именно «раньше начинается».
    expect(
      (await getPublishedVersionForStation(station.stationCode, at(16)))
        ?.version.id,
    ).toBe(laterVersionId);
  });
});

describe("listPublishedVersionsForStation", () => {
  /** Обход на весь день поверх утреннего и вечернего: ровно то, что на боевом пакете. */
  const ROUND = { windowStart: "08:00:00", windowEnd: "23:00:00" };

  test("отдаёт ВСЕ чек-листы, открытые в эту минуту, а не первый по началу окна", async () => {
    const station = await createStation();
    const morning = await createChecklist({
      stationId: station.stationId,
      ...MORNING,
    });
    const round = await createChecklist({
      stationId: station.stationId,
      ...ROUND,
    });
    const morningVersion = await createPublishedVersion(
      morning,
      sampleSections("утро"),
    );
    const roundVersion = await createPublishedVersion(
      round,
      sampleSections("обход"),
    );

    // В 09:00 открыты оба: утренний до 12:00 и обход до 23:00.
    const found = await listPublishedVersionsForStation(
      station.stationCode,
      at(9),
    );
    expect(found.map((entry) => entry.version.id)).toEqual([
      morningVersion,
      roundVersion,
    ]);
  });

  test("порядок устойчив: начинающийся раньше идёт первым", async () => {
    const station = await createStation();
    const round = await createChecklist({
      stationId: station.stationId,
      ...ROUND,
    });
    await createPublishedVersion(round, sampleSections("обход"));
    const morning = await createChecklist({
      stationId: station.stationId,
      ...MORNING,
    });
    await createPublishedVersion(morning, sampleSections("утро"));

    const found = await listPublishedVersionsForStation(
      station.stationCode,
      at(9),
    );
    expect(found.map((entry) => entry.checklist.windowStart)).toEqual([
      "06:00:00",
      "08:00:00",
    ]);
  });

  test("закрывшийся чек-лист выпадает, открытый остаётся", async () => {
    const station = await createStation();
    const morning = await createChecklist({
      stationId: station.stationId,
      ...MORNING,
    });
    const round = await createChecklist({
      stationId: station.stationId,
      ...ROUND,
    });
    await createPublishedVersion(morning, sampleSections("утро"));
    const roundVersion = await createPublishedVersion(
      round,
      sampleSections("обход"),
    );

    // В 13:00 утренний уже закрылся, обход ещё идёт.
    const found = await listPublishedVersionsForStation(
      station.stationCode,
      at(13),
    );
    expect(found.map((entry) => entry.version.id)).toEqual([roundVersion]);
  });

  test("когда открыт один, список из одного: экран не спрашивает лишнего", async () => {
    const { code, morningVersionId } = await stationWithTwoChecklists();

    const found = await listPublishedVersionsForStation(code, at(9));
    expect(found.map((entry) => entry.version.id)).toEqual([morningVersionId]);
  });

  test("ничего не открыто — пустой список, а не отказ", async () => {
    const { code } = await stationWithTwoChecklists();

    expect(await listPublishedVersionsForStation(code, at(15))).toEqual([]);
  });

  test("неизвестный и пустой код дают пустой список: перебор не различает их", async () => {
    expect(
      await listPublishedVersionsForStation(uniqueStationCode(), at(9)),
    ).toEqual([]);
    expect(await listPublishedVersionsForStation("", at(9))).toEqual([]);
  });

  test("снятый с работы чек-лист в список не попадает", async () => {
    const station = await createStation();
    const morning = await createChecklist({
      stationId: station.stationId,
      ...MORNING,
    });
    const round = await createChecklist({
      stationId: station.stationId,
      ...ROUND,
    });
    await createPublishedVersion(morning, sampleSections("утро"));
    const roundVersion = await createPublishedVersion(
      round,
      sampleSections("обход"),
    );

    await getTestDb()
      .update(checklists)
      .set({ archivedAt: new Date() })
      .where(eq(checklists.id, morning));

    const found = await listPublishedVersionsForStation(
      station.stationCode,
      at(9),
    );
    expect(found.map((entry) => entry.version.id)).toEqual([roundVersion]);
  });

  test("чужая станция в список не подмешивается", async () => {
    const mine = await stationWithTwoChecklists();
    const other = await stationWithTwoChecklists();

    const found = await listPublishedVersionsForStation(mine.code, at(9));
    expect(found.map((entry) => entry.version.id)).toEqual([
      mine.morningVersionId,
    ]);
    expect(found.map((entry) => entry.version.id)).not.toContain(
      other.morningVersionId,
    );
  });
});
