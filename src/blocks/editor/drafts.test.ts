// Черновик чек-листа на настоящей базе: заведение, сохранение секций и пунктов,
// окно времени и привязка к станции. Правила здесь держатся индексами базы
// (один черновик на чек-лист), и заглушкой их не проверить.
import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, test } from "vitest";

import { checklistVersions, checklists, getDraft } from "@/blocks/data";
import { closeTestDb, getTestDb } from "@/blocks/data/testing/db";
import {
  createChecklist as createChecklistRow,
  createPublishedVersion,
  createStation,
  sampleSections,
} from "@/blocks/data/testing/fixtures";

import {
  createChecklist,
  loadEditor,
  saveDraft,
  updateChecklist,
} from "./drafts";
import { EditorInputError } from "./validation";

const db = getTestDb();

afterAll(closeTestDb);

const MORNING = { start: "06:00", end: "11:00" };

/** Строка версии целиком: сравнение «до и после» идёт по всем полям, а не по секциям. */
async function versionRow(id: string): Promise<Record<string, unknown>> {
  const result = await db.execute<{ row: Record<string, unknown> }>(
    sql`select to_jsonb(v) as row from checklist_versions v where v.id = ${id}`,
  );
  const row = result.rows[0]?.row;
  if (row === undefined) throw new Error(`Версии ${id} нет в базе`);
  return row;
}

async function draftCount(checklistId: string): Promise<number> {
  const rows = await db
    .select({ status: checklistVersions.status })
    .from(checklistVersions)
    .where(eq(checklistVersions.checklistId, checklistId));
  return rows.filter((row) => row.status === "draft").length;
}

describe("createChecklist", () => {
  test("заводит чек-лист вместе с черновиком: заполнять нечего — печатать можно сразу", async () => {
    const station = await createStation();

    const checklistId = await createChecklist({
      stationId: station.stationId,
      title: { ru: "Открытие кухни", en: "Kitchen opening" },
      window: MORNING,
    });

    const draft = await getDraft(checklistId);
    expect(draft).not.toBeNull();
    expect(draft?.status).toBe("draft");
    // Одна пустая секция с одним пустым пунктом: курсор сразу в поле, а не в пустоте.
    expect(draft?.sections).toHaveLength(1);
    expect(draft?.sections[0]?.source).toBe("own");
    expect(draft?.sections[0]?.items).toHaveLength(1);

    const [row] = await db
      .select()
      .from(checklists)
      .where(eq(checklists.id, checklistId));
    expect(row?.title).toStrictEqual({
      ru: "Открытие кухни",
      en: "Kitchen opening",
    });
    expect(row?.stationId).toBe(station.stationId);
    expect(row?.windowStart).toBe("06:00:00");
    expect(row?.windowEnd).toBe("11:00:00");
  });

  test("чек-лист без станции заводится: станцию назначат позже", async () => {
    const checklistId = await createChecklist({
      stationId: null,
      title: { ru: "Заготовка", en: "Prep" },
      window: MORNING,
    });

    const [row] = await db
      .select()
      .from(checklists)
      .where(eq(checklists.id, checklistId));
    expect(row?.stationId).toBeNull();
  });

  test("пустое окно отвергается до базы и с внятным кодом", async () => {
    await expect(
      createChecklist({
        stationId: null,
        title: { ru: "Никогда" },
        window: { start: "08:00", end: "08:00" },
      }),
    ).rejects.toMatchObject({ code: "emptyWindow" });
  });

  test("название без единого языка отвергается", async () => {
    await expect(
      createChecklist({
        stationId: null,
        title: { ru: "   " },
        window: MORNING,
      }),
    ).rejects.toBeInstanceOf(EditorInputError);
  });
});

describe("saveDraft", () => {
  test("сохраняет секции и пункты и перезаписывает их при повторном сохранении", async () => {
    const checklistId = await createChecklist({
      stationId: null,
      title: { ru: "Открытие кухни" },
      window: MORNING,
    });

    await saveDraft(checklistId, sampleSections("первый"));
    expect((await getDraft(checklistId))?.sections).toStrictEqual(
      sampleSections("первый"),
    );

    await saveDraft(checklistId, sampleSections("второй"));
    expect((await getDraft(checklistId))?.sections).toStrictEqual(
      sampleSections("второй"),
    );
    // Второго черновика не появилось: правило базы «один черновик» соблюдено.
    expect(await draftCount(checklistId)).toBe(1);
  });

  test("опубликованная версия не меняется от правки черновика", async () => {
    // Принцип 3: история заполнений неприкосновенна. Сравнение побайтовое, по всей строке.
    const station = await createStation();
    const checklistId = await createChecklistRow({
      stationId: station.stationId,
    });
    const publishedId = await createPublishedVersion(
      checklistId,
      sampleSections("опубликованный"),
    );
    const before = await versionRow(publishedId);

    await saveDraft(checklistId, sampleSections("правка"));

    expect(await versionRow(publishedId)).toStrictEqual(before);
  });

  test("чек-листу без черновика черновик заводится, а не теряется правка", async () => {
    const checklistId = await createChecklistRow({ stationId: null });

    await saveDraft(checklistId, sampleSections("новый"));

    expect((await getDraft(checklistId))?.sections).toStrictEqual(
      sampleSections("новый"),
    );
  });

  test("несуществующий чек-лист — отказ, а не тихое создание строки", async () => {
    await expect(
      saveDraft("0f3a1f6e-6c1a-4c2e-9f2a-1f2b3c4d5e6f", []),
    ).rejects.toMatchObject({ code: "notFound" });
  });
});

describe("updateChecklist", () => {
  test("меняет название и окно, а станцию чек-листа не трогает", async () => {
    // Станцию чек-листа ведёт раздел «Станции» (T312): сохранение свойств на экране
    // чек-листа не должно снимать его со станции, на которую его повесили там.
    const station = await createStation();
    const checklistId = await createChecklist({
      stationId: station.stationId,
      title: { ru: "Было" },
      window: MORNING,
    });

    await updateChecklist(checklistId, {
      title: { ru: "Стало", en: "Now" },
      window: { start: "20:00", end: "00:00" },
    });

    const [row] = await db
      .select()
      .from(checklists)
      .where(eq(checklists.id, checklistId));
    expect(row?.title).toStrictEqual({ ru: "Стало", en: "Now" });
    expect(row?.stationId).toBe(station.stationId);
    expect(row?.windowStart).toBe("20:00:00");
    expect(row?.windowEnd).toBe("00:00:00");
  });

  test("окно «без ограничения» принимается базой", async () => {
    // 00:00–24:00 годится там, где равные границы запрещены ограничением базы.
    const checklistId = await createChecklist({
      stationId: null,
      title: { ru: "Всегда" },
      window: MORNING,
    });

    await updateChecklist(checklistId, {
      title: { ru: "Всегда" },
      window: { start: "00:00", end: "24:00" },
    });

    const [row] = await db
      .select()
      .from(checklists)
      .where(eq(checklists.id, checklistId));
    expect(row?.windowStart).toBe("00:00:00");
    expect(row?.windowEnd).toBe("24:00:00");
  });
});

describe("loadEditor", () => {
  test("отдаёт экрану всё за один заход: чек-лист, станцию с адресом, черновик и версии", async () => {
    const station = await createStation();
    const checklistId = await createChecklist({
      stationId: station.stationId,
      title: { ru: "Открытие кухни" },
      window: MORNING,
    });
    await saveDraft(checklistId, sampleSections("черновик"));
    await createPublishedVersion(checklistId, sampleSections("v1"), 1);

    const state = await loadEditor(checklistId);

    expect(state?.checklist.id).toBe(checklistId);
    expect(state?.station?.id).toBe(station.stationId);
    expect(state?.station?.storeName).toContain("Пиццерия");
    expect(state?.station?.countryName).toContain("Страна");
    expect(state?.sections).toStrictEqual(sampleSections("черновик"));
    expect(state?.versions.map((version) => version.status)).toStrictEqual([
      "draft",
      "published",
    ]);
    expect(
      state?.versions.find((version) => version.status === "published")
        ?.versionNumber,
    ).toBe(1);
    // Пункты считает сервер: экрану незачем разворачивать секции ради числа.
    expect(
      state?.versions.find((version) => version.status === "published")
        ?.itemCount,
    ).toBe(1);
  });

  test("время публикации приходит датой, а не строкой из базы", async () => {
    // Экран форматирует его как «17 августа». Сырая строка timestamptz прошла бы
    // в разметку целиком — и в правой колонке оказалось бы «2026-08-17 15:25:59.392272+00».
    const checklistId = await createChecklist({
      stationId: null,
      title: { ru: "Со временем" },
      window: MORNING,
    });
    await createPublishedVersion(checklistId, sampleSections("v1"), 1);

    const state = await loadEditor(checklistId);
    const published = state?.versions.find(
      (version) => version.status === "published",
    );

    expect(published?.publishedAt).toBeInstanceOf(Date);
    expect(Number.isNaN(published?.publishedAt?.getTime())).toBe(false);
  });

  test("неизвестный чек-лист даёт null, а не исключение", async () => {
    expect(await loadEditor("0f3a1f6e-6c1a-4c2e-9f2a-1f2b3c4d5e6f")).toBeNull();
  });
});
