// Список чек-листов и список станций для экрана. Оба запроса читают чужие таблицы
// (справочник блока catalog, заполнения блока fill) — через схему и getDb() слоя data,
// как велит D024. Проверяются на настоящей базе: смысл здесь в SQL.
import { afterAll, describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";

import {
  checklists,
  getDb,
  saveSubmission,
  stations,
  stores,
} from "@/blocks/data";
import { closeTestDb } from "@/blocks/data/testing/db";
import {
  createPublishedVersion,
  createStation,
  sampleSections,
} from "@/blocks/data/testing/fixtures";

import { createChecklist, saveDraft } from "./drafts";
import { NO_FILTER } from "./filter";
import { listChecklists, listStations } from "./listing";
import { publish } from "./publish";

afterAll(closeTestDb);

const MORNING = { start: "06:00", end: "11:00" };

describe("listChecklists", () => {
  test("строка списка отвечает на вопросы экрана: где, когда, какая версия, сколько пунктов", async () => {
    const station = await createStation();
    const checklistId = await createChecklist({
      stationId: station.stationId,
      title: { ru: "Открытие кухни", en: "Kitchen opening" },
      window: MORNING,
    });
    await saveDraft(checklistId, sampleSections("список"));
    const versionId = await createPublishedVersion(
      checklistId,
      sampleSections("опубликованный"),
    );
    await saveSubmission({
      mode: "normal",
      versionId,
      answers: [{ itemId: "item-опубликованный", value: true, at: Date.now() }],
      startedAt: Date.now(),
    });

    const row = (await listChecklists(NO_FILTER)).find(
      (entry) => entry.id === checklistId,
    );

    expect(row).toMatchObject({
      title: { ru: "Открытие кухни", en: "Kitchen opening" },
      windowStart: "06:00:00",
      windowEnd: "11:00:00",
      publishedNumber: 1,
      hasUnpublishedChanges: true,
      itemCount: 1,
      submissions7d: 1,
    });
    expect(row?.stationName).toContain("Станция");
    expect(row?.storeName).toContain("Пиццерия");
    expect(row?.countryName).toContain("Страна");
  });

  test("чек-лист без станции и без публикации показывается, а не пропадает из списка", async () => {
    // Иначе только что заведённый чек-лист исчезает с экрана, и методист заводит второй.
    const checklistId = await createChecklist({
      stationId: null,
      title: { ru: "Заготовка" },
      window: MORNING,
    });

    const row = (await listChecklists(NO_FILTER)).find(
      (entry) => entry.id === checklistId,
    );

    expect(row).toBeDefined();
    expect(row?.stationName).toBeNull();
    expect(row?.publishedNumber).toBeNull();
    expect(row?.hasUnpublishedChanges).toBe(true);
  });

  test("чек-листы одной пиццерии идут подряд: список читается как путь", async () => {
    const station = await createStation();
    const second = await createChecklist({
      stationId: station.stationId,
      title: { ru: "Ббб" },
      window: MORNING,
    });
    const first = await createChecklist({
      stationId: station.stationId,
      title: { ru: "Ааа" },
      window: MORNING,
    });

    const mine = (await listChecklists(NO_FILTER))
      .filter((entry) => entry.id === first || entry.id === second)
      .map((entry) => entry.id);

    expect(mine).toStrictEqual([first, second]);
  });
});

/** Чек-лист, доведённый до опубликованной версии: черновик и публикация совпадают. */
async function publishedChecklist(title: string): Promise<string> {
  const station = await createStation();
  const checklistId = await createChecklist({
    stationId: station.stationId,
    title: { ru: title },
    window: MORNING,
  });
  await saveDraft(checklistId, sampleSections("исходный"));
  await publish(checklistId);
  return checklistId;
}

/** Горит ли метка «черновик» у этого чек-листа на экране списка. */
async function draftLabelOf(checklistId: string): Promise<boolean | undefined> {
  return (await listChecklists(NO_FILTER)).find(
    (entry) => entry.id === checklistId,
  )?.hasUnpublishedChanges;
}

describe("метка «черновик» в списке (T152)", () => {
  // Метка обещает методисту «здесь есть неопубликованные правки». Зажигалась она по
  // наличию строки черновика — а `publishVersion` черновик не удаляет, он остаётся
  // жить как единственная мутируемая строка в цепочке. Значит метка горела у всех
  // чек-листов всегда: на стенде показа — у всех девяти, при побайтово совпадающих
  // `sections`. Постоянный шум неотличим от настоящего расхождения, то есть метка
  // не сообщала ничего. Считается она теперь по РАЗЛИЧИЮ СОДЕРЖИМОГО.

  test("сразу после публикации метка гаснет: править нечего", async () => {
    // Отрицательный прогон задачи. Идём настоящей публикацией, а не подкладыванием
    // одинаковых строк: черновик после неё остаётся, и именно это ломало метку.
    const checklistId = await publishedChecklist("Опубликован и не тронут");

    expect(await draftLabelOf(checklistId)).toBe(false);
  });

  test("настоящая правка после публикации метку зажигает", async () => {
    const checklistId = await publishedChecklist("Опубликован и поправлен");

    await saveDraft(checklistId, sampleSections("поправленный"));

    expect(await draftLabelOf(checklistId)).toBe(true);
  });

  test("правка на один символ считается правкой", async () => {
    // Граница: расхождение бывает и в одну букву названия пункта, и метка обязана
    // его увидеть. Сравнение по содержимому, а не по числу пунктов или секций.
    const checklistId = await publishedChecklist("Опубликован и переименован");
    const edited = sampleSections("исходный");
    const section = edited[0];
    const item = section?.items[0];
    if (section === undefined || item === undefined) {
      throw new Error("Образец разметки пуст: проверять нечего");
    }

    await saveDraft(checklistId, [
      {
        ...section,
        items: [{ ...item, title: { ...item.title, ru: "Пункт исходныи" } }],
      },
    ]);

    expect(await draftLabelOf(checklistId)).toBe(true);
  });

  test("возврат правки обратно метку снова гасит", async () => {
    // Метка следит за состоянием, а не за тем, что черновик когда-то трогали:
    // иначе она загоралась бы навсегда от первой же отменённой правки.
    const checklistId = await publishedChecklist("Поправлен и возвращён");
    await saveDraft(checklistId, sampleSections("поправленный"));
    expect(await draftLabelOf(checklistId)).toBe(true);

    await saveDraft(checklistId, sampleSections("исходный"));

    expect(await draftLabelOf(checklistId)).toBe(false);
  });

  test("до первой публикации метка горит: не опубликовано ничего", async () => {
    const station = await createStation();
    const checklistId = await createChecklist({
      stationId: station.stationId,
      title: { ru: "Ещё не публиковался" },
      window: MORNING,
    });
    await saveDraft(checklistId, sampleSections("набранный"));

    expect(await draftLabelOf(checklistId)).toBe(true);
  });
});

describe("listChecklists и снятые с работы", () => {
  test("снятый с работы чек-лист из списка уходит, а соседний остаётся", async () => {
    // Смысл удаления для методиста — «этого больше нет в работе». Если снятый чек-лист
    // остаётся в списке, он заводит второй такой же и путается в них.
    const station = await createStation();
    const kept = await createChecklist({
      stationId: station.stationId,
      title: { ru: "Остаётся" },
      window: MORNING,
    });
    const removed = await createChecklist({
      stationId: station.stationId,
      title: { ru: "Снят с работы" },
      window: MORNING,
    });

    await getDb()
      .update(checklists)
      .set({ archivedAt: new Date() })
      .where(eq(checklists.id, removed));

    const ids = (await listChecklists(NO_FILTER)).map((row) => row.id);
    expect(ids).toContain(kept);
    expect(ids).not.toContain(removed);
  });
});

describe("listChecklists под фильтром", () => {
  test("выбранная страна оставляет свои чек-листы и убирает чужие", async () => {
    const mine = await createStation();
    const other = await createStation();
    const kept = await createChecklist({
      stationId: mine.stationId,
      title: { ru: "Своя страна" },
      window: MORNING,
    });
    const dropped = await createChecklist({
      stationId: other.stationId,
      title: { ru: "Чужая страна" },
      window: MORNING,
    });

    const ids = (
      await listChecklists({ ...NO_FILTER, countryId: mine.countryId })
    ).map((row) => row.id);

    expect(ids).toContain(kept);
    expect(ids).not.toContain(dropped);
  });

  test("выбранная пиццерия сужает список до своих чек-листов", async () => {
    const mine = await createStation();
    const other = await createStation();
    const kept = await createChecklist({
      stationId: mine.stationId,
      title: { ru: "Своя пиццерия" },
      window: MORNING,
    });
    const dropped = await createChecklist({
      stationId: other.stationId,
      title: { ru: "Чужая пиццерия" },
      window: MORNING,
    });

    const ids = (
      await listChecklists({ ...NO_FILTER, storeId: mine.storeId })
    ).map((row) => row.id);

    expect(ids).toStrictEqual([kept]);
    expect(ids).not.toContain(dropped);
  });

  test("выбранная станция сужает список до своих чек-листов", async () => {
    const station = await createStation();
    const db = getDb();
    const [neighbour] = await db
      .insert(stations)
      .values({
        storeId: station.storeId,
        name: "Соседняя",
        code: `n${station.stationCode}`.slice(0, 10),
      })
      .returning({ id: stations.id });
    if (neighbour === undefined) throw new Error("Соседней станции нет");

    const kept = await createChecklist({
      stationId: station.stationId,
      title: { ru: "Своя станция" },
      window: MORNING,
    });
    await createChecklist({
      stationId: neighbour.id,
      title: { ru: "Соседняя станция" },
      window: MORNING,
    });

    const ids = (
      await listChecklists({ ...NO_FILTER, stationId: station.stationId })
    ).map((row) => row.id);

    expect(ids).toStrictEqual([kept]);
  });

  test("чек-лист без станции под фильтром по стране не показывается", async () => {
    // У него нет ни страны, ни пиццерии: показать его в списке «Казахстана» значит
    // соврать про то, где он живёт.
    const station = await createStation();
    const homeless = await createChecklist({
      stationId: null,
      title: { ru: "Без станции" },
      window: MORNING,
    });

    const ids = (
      await listChecklists({ ...NO_FILTER, countryId: station.countryId })
    ).map((row) => row.id);

    expect(ids).not.toContain(homeless);
  });

  test("несогласованный фильтр даёт пустой список, а не отказ базы", async () => {
    // Страна одной сети и пиццерия другой: такой адрес приходит из ссылки, пролежавшей
    // в чате, и экран обязан открыться пустым списком.
    const first = await createStation();
    const second = await createStation();
    await createChecklist({
      stationId: first.stationId,
      title: { ru: "Есть" },
      window: MORNING,
    });

    const rows = await listChecklists({
      countryId: first.countryId,
      storeId: second.storeId,
      stationId: null,
    });

    expect(rows).toStrictEqual([]);
  });

  test("непохожий на идентификатор фильтр не роняет запрос, а просто не сужает", async () => {
    // Значения приходят из адреса. Разбор их отбрасывает, но список — граница блока,
    // и на ней тоже нельзя верить входу: строка «Казахстан» в uuid не приводится.
    const station = await createStation();
    const checklistId = await createChecklist({
      stationId: station.stationId,
      title: { ru: "Виден" },
      window: MORNING,
    });

    const ids = (
      await listChecklists({ ...NO_FILTER, countryId: "Казахстан" })
    ).map((row) => row.id);

    expect(ids).toContain(checklistId);
  });
});

describe("listStations", () => {
  test("станция приходит вместе с пиццерией и страной: в списке их различают по адресу", async () => {
    const station = await createStation();

    const option = (await listStations()).find(
      (entry) => entry.id === station.stationId,
    );

    expect(option?.name).toContain("Станция");
    expect(option?.storeName).toContain("Пиццерия");
    expect(option?.countryName).toContain("Страна");
  });

  test("вместе с названиями приходят идентификаторы: из них строится справочник фильтра", async () => {
    const station = await createStation();

    const option = (await listStations()).find(
      (entry) => entry.id === station.stationId,
    );

    expect(option?.storeId).toStrictEqual(station.storeId);
    expect(option?.countryId).toStrictEqual(station.countryId);
  });

  test("станции одной пиццерии идут подряд и по алфавиту", async () => {
    const station = await createStation();
    const db = getDb();
    const [store] = await db
      .select({ id: stores.id })
      .from(stores)
      .where(eq(stores.id, station.storeId));
    if (store === undefined) throw new Error("Пиццерии нет");

    const inserted = await db
      .insert(stations)
      .values([
        { storeId: store.id, name: "Ящик", code: `z${station.stationCode}` },
        { storeId: store.id, name: "Абрикос", code: `a${station.stationCode}` },
      ])
      .returning({ id: stations.id, name: stations.name });

    const all = await listStations();
    const mine = all
      .filter((entry) => inserted.some((row) => row.id === entry.id))
      .map((entry) => entry.name);

    expect(mine).toStrictEqual(["Абрикос", "Ящик"]);
  });
});
