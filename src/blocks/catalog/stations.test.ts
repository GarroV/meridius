// Станции справочника. Настоящая база, а не заглушки: тут держатся два правила
// продукта, которые заглушкой не проверить, — перевыпуск кода ломает публичную
// ссылку немедленно (D006, D021) и удаление не спорит с историей заполнений.
import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, test } from "vitest";

import {
  checklistVersions,
  checklists,
  countries,
  getDb,
  getPublishedVersionForStation,
  saveSubmission,
  stations,
  stores,
} from "@/blocks/data";
import { closeTestDb } from "@/blocks/data/testing/db";
import {
  createChecklist,
  createDraft,
  createPublishedVersion,
  createStation as createStationFixture,
  sampleSections,
} from "@/blocks/data/testing/fixtures";
import { hqViewer, partnerViewer } from "@/blocks/auth/testing/viewers";

import { STATION_CODE_ALPHABET, STATION_CODE_LENGTH } from "./station-code";
import {
  assignChecklist,
  createStation,
  deleteStation,
  detachChecklist,
  listStations,
  listUnassignedChecklists,
  reissueStationCode,
  updateStation,
} from "./stations";

const db = getDb();

afterAll(closeTestDb);

// Окно фикстуры чек-листа — 06:00–12:00 в UTC: момент внутри него.
const INSIDE_WINDOW = new Date(Date.UTC(2026, 8, 6, 9, 0, 0));

function unique(what: string): string {
  return `${what} ${randomUUID().slice(0, 8)}`;
}

/**
 * Пиццерия без единой станции: станции заводит уже сам справочник, поэтому фикстура
 * `createStation` блока data тут не годится — она сразу кладёт станцию внутрь.
 */
async function emptyStore(): Promise<string> {
  const suffix = randomUUID().slice(0, 8);
  const [country] = await db
    .insert(countries)
    .values({ name: `Страна ${suffix}`, locale: "ru" })
    .returning({ id: countries.id });
  if (country === undefined) throw new Error("страна не завелась");
  const [store] = await db
    .insert(stores)
    .values({ countryId: country.id, name: `Пиццерия ${suffix}` })
    .returning({ id: stores.id });
  if (store === undefined) throw new Error("пиццерия не завелась");
  return store.id;
}

async function stationRow(id: string) {
  const [row] = await db.select().from(stations).where(eq(stations.id, id));
  return row;
}

/** Снимает чек-лист с работы: то же, что делает методист с чек-листом, по которому заполняли. */
async function archive(checklistId: string): Promise<void> {
  await db
    .update(checklists)
    .set({ archivedAt: sql`now()` })
    .where(eq(checklists.id, checklistId));
}

describe("станции справочника", () => {
  test("создаётся с неугадываемым кодом и временем выпуска", async () => {
    const storeId = await emptyStore();

    const created = await createStation({
      storeId,
      name: unique("Кухня"),
    });

    expect(created.code).toHaveLength(STATION_CODE_LENGTH);
    for (const symbol of created.code) {
      expect(STATION_CODE_ALPHABET.includes(symbol)).toBe(true);
    }
    const row = await stationRow(created.id);
    expect(row?.code).toBe(created.code);
    expect(row?.codeIssuedAt).toBeInstanceOf(Date);
  });

  test("у двух станций коды разные", async () => {
    const storeId = await emptyStore();

    const first = await createStation({ storeId, name: unique("Касса") });
    const second = await createStation({ storeId, name: unique("Касса") });

    expect(first.code).not.toBe(second.code);
  });

  test("пустое имя не проходит", async () => {
    const storeId = await emptyStore();

    await expect(createStation({ storeId, name: "   " })).rejects.toMatchObject(
      { code: "nameRequired" },
    );
  });

  test("несуществующая пиццерия не принимает станцию", async () => {
    await expect(
      createStation({ storeId: randomUUID(), name: unique("Упаковка") }),
    ).rejects.toMatchObject({ code: "notFound" });
  });

  test("список отдаёт станции своей пиццерии и не отдаёт чужие", async () => {
    const mine = await emptyStore();
    const alien = await emptyStore();
    const created = await createStation({
      storeId: mine,
      name: unique("Печь"),
    });
    await createStation({ storeId: alien, name: unique("Печь") });

    const rows = await listStations(mine);

    expect(rows.map((row) => row.id)).toStrictEqual([created.id]);
  });

  test("неизвестная пиццерия даёт пустой список, а не падение", async () => {
    expect(await listStations(randomUUID())).toStrictEqual([]);
    expect(await listStations("не-uuid")).toStrictEqual([]);
  });

  test("имя станции правится", async () => {
    const storeId = await emptyStore();
    const created = await createStation({ storeId, name: unique("Кухня") });
    const renamed = unique("Кухня новая");

    await updateStation(created.id, { name: renamed });

    expect((await stationRow(created.id))?.name).toBe(renamed);
  });

  test("несуществующая станция не правится и не удаляется молча", async () => {
    await expect(
      updateStation(randomUUID(), { name: "Кухня" }),
    ).rejects.toMatchObject({ code: "notFound" });
    await expect(deleteStation(randomUUID())).rejects.toMatchObject({
      code: "notFound",
    });
  });
});

describe("привязка чек-листа к станции (T017)", () => {
  test("станция без чек-листа отдаёт пустой список — экран помечает её явно", async () => {
    const storeId = await emptyStore();
    const created = await createStation({ storeId, name: unique("Упаковка") });

    const [row] = await listStations(storeId);

    expect(row?.id).toBe(created.id);
    expect(row?.checklists).toStrictEqual([]);
  });

  test("привязанный чек-лист виден в списке станций", async () => {
    const storeId = await emptyStore();
    const created = await createStation({ storeId, name: unique("Кухня") });
    const title = { ru: unique("Открытие"), en: unique("Opening") };
    const checklistId = await createChecklist({ title });

    await assignChecklist(created.id, checklistId);

    const [row] = await listStations(storeId);
    expect(row?.checklists).toStrictEqual([{ id: checklistId, title }]);
  });

  test("чек-лист виден только у своей станции, соседняя по пиццерии остаётся пустой", async () => {
    // Список станций собирает чек-листы одним запросом на всю пиццерию и раскладывает
    // их сам: ошибка раскладки молча показывала бы чужой чек-лист соседней станции (T350).
    const storeId = await emptyStore();
    const kitchen = await createStation({ storeId, name: "А кухня" });
    const counter = await createStation({ storeId, name: "Б касса" });
    const checklistId = await createChecklist();
    await assignChecklist(kitchen.id, checklistId);

    const rows = await listStations(storeId);

    expect(
      rows.map((row) => [row.id, row.checklists.map((item) => item.id)]),
    ).toStrictEqual([
      [kitchen.id, [checklistId]],
      [counter.id, []],
    ]);
  });

  test("два чек-листа станции идут в порядке дня, а не в порядке привязки", async () => {
    // Порядок дня не зависит от языка интерфейса: сортировать по названию значило бы
    // выбрать язык прямо в запросе и получить разный порядок в ru и en.
    const storeId = await emptyStore();
    const created = await createStation({ storeId, name: unique("Кухня") });
    const evening = await createChecklist({
      windowStart: "18:00:00",
      windowEnd: "23:00:00",
    });
    const morning = await createChecklist({
      windowStart: "06:00:00",
      windowEnd: "12:00:00",
    });

    await assignChecklist(created.id, evening);
    await assignChecklist(created.id, morning);

    const [row] = await listStations(storeId);
    expect(row?.checklists.map((item) => item.id)).toStrictEqual([
      morning,
      evening,
    ]);
  });

  test("привязка к несуществующей станции или чек-листу отказывает понятно", async () => {
    const storeId = await emptyStore();
    const created = await createStation({ storeId, name: unique("Кухня") });
    const checklistId = await createChecklist();

    await expect(
      assignChecklist(randomUUID(), checklistId),
    ).rejects.toMatchObject({ code: "notFound" });
    await expect(
      assignChecklist(created.id, randomUUID()),
    ).rejects.toMatchObject({ code: "notFound" });
  });

  test("отвязка возвращает чек-лист в свободные", async () => {
    const storeId = await emptyStore();
    const created = await createStation({ storeId, name: unique("Кухня") });
    const checklistId = await createChecklist();
    await assignChecklist(created.id, checklistId);

    await detachChecklist(checklistId);

    const [row] = await listStations(storeId);
    expect(row?.checklists).toStrictEqual([]);
    const free = await listUnassignedChecklists(await hqViewer());
    expect(free.map((item) => item.id)).toContain(checklistId);
  });

  test("свободные чек-листы — только не привязанные ни к одной станции", async () => {
    const storeId = await emptyStore();
    const created = await createStation({ storeId, name: unique("Кухня") });
    const taken = await createChecklist();
    const free = await createChecklist();
    await assignChecklist(created.id, taken);

    const ids = (await listUnassignedChecklists(await hqViewer())).map(
      (item) => item.id,
    );

    expect(ids).toContain(free);
    expect(ids).not.toContain(taken);
  });

  test("удаление станции отвязывает чек-лист, но не удаляет его", async () => {
    const storeId = await emptyStore();
    const created = await createStation({ storeId, name: unique("Кухня") });
    const checklistId = await createChecklist();
    await assignChecklist(created.id, checklistId);

    await deleteStation(created.id);

    const [checklist] = await db
      .select({ stationId: checklists.stationId })
      .from(checklists)
      .where(eq(checklists.id, checklistId));
    expect(checklist).toBeDefined();
    expect(checklist?.stationId).toBeNull();
  });

  test("снятый с работы чек-лист после сноса станции не попадает в свободные", async () => {
    // Снос пиццерии отвязывает её чек-листы (`on delete set null`), и снятые с работы
    // возвращались в список привязки наравне с рабочими. Найдено 13.09: после сноса
    // демо-пиццерий там осело три архивных чек-листа. Это мусор, который копится
    // незаметно, — и хуже того, привязка вернула бы в работу то, что методист снял.
    const storeId = await emptyStore();
    const created = await createStation({ storeId, name: unique("Кухня") });
    const archived = await createChecklist();
    const working = await createChecklist();
    await assignChecklist(created.id, archived);
    await assignChecklist(created.id, working);
    await archive(archived);

    await deleteStation(created.id);

    const ids = (await listUnassignedChecklists(await hqViewer())).map(
      (item) => item.id,
    );
    expect(ids).not.toContain(archived);
    // Рабочий чек-лист, наоборот, обязан вернуться в свободные: его привязывают заново.
    expect(ids).toContain(working);
  });

  test("снятый с работы чек-лист привязать нельзя: checklistArchived", async () => {
    // Список свободных — не единственный путь: чек-лист снимают с работы, пока экран
    // справочника открыт со старым списком. Правило стоит в слое, как и проверка пояса.
    const storeId = await emptyStore();
    const created = await createStation({ storeId, name: unique("Кухня") });
    const archived = await createChecklist();
    await archive(archived);

    await expect(assignChecklist(created.id, archived)).rejects.toMatchObject({
      code: "checklistArchived",
    });

    const [row] = await db
      .select({ stationId: checklists.stationId })
      .from(checklists)
      .where(eq(checklists.id, archived));
    expect(row?.stationId).toBeNull();
  });
});

/** Версии чек-листа по номеру — чтобы видеть, что привязка выпустила и что оставила. */
async function versionsOf(checklistId: string) {
  return db
    .select({
      status: checklistVersions.status,
      versionNumber: checklistVersions.versionNumber,
      stationId: checklistVersions.stationId,
    })
    .from(checklistVersions)
    .where(eq(checklistVersions.checklistId, checklistId))
    .orderBy(checklistVersions.versionNumber);
}

describe("привязка уже опубликованного чек-листа (T348)", () => {
  // Версия замораживает станцию в момент публикации (T056), а с T312 чек-лист вешают
  // на станцию только на её карточке — то есть ПОСЛЕ публикации. Привязка, не
  // переопубликовавшая версию для станции, оставляла QR на «заполнять нечего»: главный
  // путь продукта не проходил, и заметил это только сквозной смоук.

  test("чек-лист, опубликованный без станции, после привязки открывается по её коду", async () => {
    const { stationId, stationCode } = await createStationFixture();
    const checklistId = await createChecklist();
    const sections = sampleSections("до привязки");
    await createPublishedVersion(checklistId, sections);

    await assignChecklist(stationId, checklistId);

    const served = await getPublishedVersionForStation(
      stationCode,
      INSIDE_WINDOW,
    );
    expect(served?.checklist.id).toBe(checklistId);
    expect(served?.version.stationId).toBe(stationId);
    expect(served?.version.sections).toStrictEqual(sections);
  });

  test("на станцию уходит опубликованное содержимое, а не неопубликованный черновик", async () => {
    const { stationId, stationCode } = await createStationFixture();
    const checklistId = await createChecklist();
    const published = sampleSections("опубликовано");
    await createPublishedVersion(checklistId, published);
    await createDraft(checklistId, sampleSections("черновик"));

    await assignChecklist(stationId, checklistId);

    const served = await getPublishedVersionForStation(
      stationCode,
      INSIDE_WINDOW,
    );
    expect(served?.version.sections).toStrictEqual(published);
  });

  test("перенос на другую станцию: новая отдаёт чек-лист, прежняя версия остаётся за прежней", async () => {
    const first = await createStationFixture();
    const second = await createStationFixture();
    const checklistId = await createChecklist({ stationId: first.stationId });
    await createPublishedVersion(checklistId, sampleSections("перенос"));

    await assignChecklist(second.stationId, checklistId);

    expect(
      await getPublishedVersionForStation(first.stationCode, INSIDE_WINDOW),
    ).toBeNull();
    expect(
      (await getPublishedVersionForStation(second.stationCode, INSIDE_WINDOW))
        ?.version.stationId,
    ).toBe(second.stationId);
    // История не переписана: прежняя версия осталась со своей станцией, только в архиве.
    expect(
      (await versionsOf(checklistId)).map((row) => [
        row.status,
        row.versionNumber,
        row.stationId,
      ]),
    ).toStrictEqual([
      ["archived", 1, first.stationId],
      ["published", 2, second.stationId],
    ]);
  });

  test("повторная привязка к той же станции новой версии не выпускает", async () => {
    const { stationId } = await createStationFixture();
    const checklistId = await createChecklist({ stationId });
    await createPublishedVersion(checklistId, sampleSections("та же"));

    await assignChecklist(stationId, checklistId);

    expect(
      (await versionsOf(checklistId)).map((row) => row.versionNumber),
    ).toStrictEqual([1]);
  });

  test("неопубликованный чек-лист привязывается без версии: публиковать нечего", async () => {
    const { stationId } = await createStationFixture();
    const checklistId = await createChecklist();
    await createDraft(checklistId, sampleSections("только черновик"));

    await assignChecklist(stationId, checklistId);

    expect(
      (await versionsOf(checklistId)).map((row) => row.status),
    ).toStrictEqual(["draft"]);
  });
});

describe("отказы справочника станций, которые иначе молчат (T350)", () => {
  // Мусорный идентификатор из адреса или формы отвечает так же, как несуществующий:
  // иначе ошибка синтаксиса uuid из базы уходила бы пятисоткой, и перебор отличал бы
  // «такого нет» от «такого не бывает» (D021, D145).
  const GARBAGE = "не-uuid";

  test.each([
    ["createStation", () => createStation({ storeId: GARBAGE, name: "Кухня" })],
    ["updateStation", () => updateStation(GARBAGE, { name: "Кухня" })],
    ["deleteStation", () => deleteStation(GARBAGE)],
    ["reissueStationCode", () => reissueStationCode(GARBAGE)],
    ["assignChecklist, станция", () => assignChecklist(GARBAGE, randomUUID())],
    ["assignChecklist, чек-лист", () => assignChecklist(randomUUID(), GARBAGE)],
    ["detachChecklist", () => detachChecklist(GARBAGE)],
  ])("%s: мусорный идентификатор — «не найдено»", async (_name, call) => {
    await expect(call()).rejects.toMatchObject({ code: "notFound" });
  });

  test("отвязка несуществующего чек-листа не выдаёт себя за удачу", async () => {
    await expect(detachChecklist(randomUUID())).rejects.toMatchObject({
      code: "notFound",
    });
  });

  test("партнёру в свободных — только его чек-листы, УК — все", async () => {
    // Чек-лист без станции не лежит ни в одной стране, и отбор по тенанту — единственное,
    // что не даёт партнёру привязать к своей станции чужой (D145).
    const partner = await partnerViewer([]);
    const own = await createChecklist({ tenantId: partner.tenantId });
    const foreign = await createChecklist();

    const partnerIds = (await listUnassignedChecklists(partner)).map(
      (item) => item.id,
    );
    const hqIds = (await listUnassignedChecklists(await hqViewer())).map(
      (item) => item.id,
    );

    expect(partnerIds).toContain(own);
    expect(partnerIds).not.toContain(foreign);
    expect(hqIds).toEqual(expect.arrayContaining([own, foreign]));
  });
});

describe("перевыпуск кода станции (T016)", () => {
  test("старый код перестаёт открывать чек-лист сразу, новый работает", async () => {
    // Единственная защита публичной ссылки (D021): пока старый код открывает
    // чек-лист, перевыпуск не защищает ни от чего — наклейку уже сфотографировали.
    const { stationId, stationCode: oldCode } = await createStationFixture();
    const checklistId = await createChecklist({ stationId });
    await createPublishedVersion(checklistId, sampleSections("перевыпуск"));

    expect(
      await getPublishedVersionForStation(oldCode, INSIDE_WINDOW),
    ).not.toBeNull();

    const reissued = await reissueStationCode(stationId);

    expect(reissued.code).not.toBe(oldCode);
    expect(
      await getPublishedVersionForStation(oldCode, INSIDE_WINDOW),
    ).toBeNull();
    expect(
      await getPublishedVersionForStation(reissued.code, INSIDE_WINDOW),
    ).not.toBeNull();
  });

  test("новый код тоже из алфавита без похожих знаков и с новым временем выпуска", async () => {
    const { stationId } = await createStationFixture();
    const before = (await stationRow(stationId))?.codeIssuedAt;

    const reissued = await reissueStationCode(stationId);

    expect(reissued.code).toHaveLength(STATION_CODE_LENGTH);
    for (const symbol of reissued.code) {
      expect(STATION_CODE_ALPHABET.includes(symbol)).toBe(true);
    }
    expect(before).toBeDefined();
    expect(reissued.issuedAt.getTime()).toBeGreaterThanOrEqual(
      before?.getTime() ?? 0,
    );
    expect((await stationRow(stationId))?.code).toBe(reissued.code);
  });

  test("перевыпуск несуществующей станции отказывает понятно", async () => {
    await expect(reissueStationCode(randomUUID())).rejects.toMatchObject({
      code: "notFound",
    });
  });

  test("перевыпуск не трогает историю заполнений", async () => {
    // Заполнение ссылается на станцию, а не на код: смена кода не должна ни
    // переписывать историю, ни мешать её сохранять (принцип 3).
    const { stationId, stationCode } = await createStationFixture();
    const checklistId = await createChecklist({ stationId });
    const versionId = await createPublishedVersion(
      checklistId,
      sampleSections("история"),
    );
    const submissionId = await saveSubmission({
      mode: "normal",
      versionId,
      answers: [{ itemId: "item-история", value: true, at: Date.now() }],
      startedAt: Date.now(),
    });

    await reissueStationCode(stationId);

    expect(submissionId).toBeTruthy();
    expect(
      await getPublishedVersionForStation(stationCode, INSIDE_WINDOW),
    ).toBeNull();
  });

  test("станцию с заполнениями удалить нельзя, и отказ понятен человеку", async () => {
    const { stationId } = await createStationFixture();
    const checklistId = await createChecklist({ stationId });
    const versionId = await createPublishedVersion(
      checklistId,
      sampleSections("удаление"),
    );
    await saveSubmission({
      mode: "normal",
      versionId,
      answers: [{ itemId: "item-удаление", value: true, at: Date.now() }],
      startedAt: Date.now(),
    });

    await expect(deleteStation(stationId)).rejects.toMatchObject({
      code: "referencedByHistory",
    });
    expect(await stationRow(stationId)).toBeDefined();
  });
});
