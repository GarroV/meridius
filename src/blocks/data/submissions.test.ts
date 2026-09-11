// Слой доступа к заполнениям проверяется на настоящей базе: снимок, станция и
// время сервера — это гарантии из принципа 3 (история неприкосновенна), их даёт
// PostgreSQL, а не память процесса, и заглушкой их не проверить.
import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, describe, expect, test } from "vitest";

import { getSubmission, listSubmissions, saveSubmission } from "./submissions";
import { checklistVersions, checklists, submissions } from "./schema";
import { closeTestDb, getTestDb } from "./testing/db";
import {
  checklistStationId,
  createChecklist,
  createDraft,
  createPublishedVersion,
  createStation,
  sampleSections,
} from "./testing/fixtures";
import type { Answer, Section } from "./types";

const db = getTestDb();

afterAll(closeTestDb);

/** Версия сразу в состоянии `archived` — методист успел опубликовать следующую. */
async function createArchivedVersion(
  checklistId: string,
  sections: Section[],
  versionNumber: number,
): Promise<string> {
  const [row] = await db
    .insert(checklistVersions)
    .values({
      checklistId,
      status: "archived",
      versionNumber,
      stationId: await checklistStationId(checklistId),
      sections,
      publishedAt: new Date(),
    })
    .returning({ id: checklistVersions.id });
  if (row === undefined)
    throw new Error("Строка не вставилась: checklist_versions");
  return row.id;
}

/** Готовая цепочка станция → чек-лист → опубликованная версия с одним критичным пунктом. */
async function readyVersion(label: string) {
  const station = await createStation();
  const checklistId = await createChecklist({ stationId: station.stationId });
  const sections = sampleSections(label);
  const versionId = await createPublishedVersion(checklistId, sections);
  return { station, checklistId, sections, versionId };
}

function boolAnswer(itemId: string, value: boolean): Answer {
  return { itemId, value, at: Date.now() };
}

/** Версия со всеми тремя уровнями: на ней проверяется счёт по режиму смены. */
async function mixedVersion() {
  const station = await createStation();
  const checklistId = await createChecklist({ stationId: station.stationId });
  const sections: Section[] = [
    {
      id: "s-mode",
      title: { ru: "Закрытие", en: "Closing" },
      source: "own",
      items: [
        {
          id: "i-gas",
          title: { ru: "Газ", en: "Gas" },
          type: "bool",
          severity: "critical",
        },
        {
          id: "i-till",
          title: { ru: "Касса", en: "Till" },
          type: "bool",
          severity: "major",
        },
        {
          id: "i-tables",
          title: { ru: "Столы", en: "Tables" },
          type: "bool",
          severity: "normal",
        },
      ],
    },
  ];
  const versionId = await createPublishedVersion(checklistId, sections);
  return { station, sections, versionId };
}

describe("счёт пунктов идёт по режиму смены, а не по всему снимку", () => {
  test("в критичную смену ждали один пункт из трёх", async () => {
    // Иначе лента показала бы «не отвечено 2» про пункты, которых сотруднику
    // в этом режиме даже не показывали.
    const { versionId } = await mixedVersion();

    const id = await saveSubmission({
      mode: "critical",
      versionId,
      answers: [boolAnswer("i-gas", true)],
      startedAt: Date.now() - 60_000,
    });
    const detail = await getSubmission(id);

    expect(detail?.mode).toBe("critical");
    expect(detail?.itemCount).toBe(1);
    expect(detail?.answeredCount).toBe(1);
    // Снимок остаётся полным: факт сокращения не стирается (D055).
    expect(detail?.snapshot[0]?.items).toHaveLength(3);
  });

  test("в смену с ограничениями ждали два пункта из трёх", async () => {
    const { versionId } = await mixedVersion();

    const id = await saveSubmission({
      mode: "reduced",
      versionId,
      answers: [boolAnswer("i-gas", true), boolAnswer("i-till", true)],
      startedAt: Date.now() - 60_000,
    });

    expect((await getSubmission(id))?.itemCount).toBe(2);
  });

  test("в полную смену ждали все три", async () => {
    const { versionId } = await mixedVersion();

    const id = await saveSubmission({
      mode: "normal",
      versionId,
      answers: [boolAnswer("i-gas", true)],
      startedAt: Date.now() - 60_000,
    });
    const detail = await getSubmission(id);

    expect(detail?.itemCount).toBe(3);
    expect(detail?.answeredCount).toBe(1);
  });
});

describe("провалы в строке ленты", () => {
  test("failedCount считает провалы всех уровней, failedCriticalCount — только критичные", async () => {
    // Оба числа обязаны приходить из одной строки. Пока строка отдавала только
    // критичные провалы, лента дочитывала остальные вторым запросом мимо слоя
    // доступа — и правило провала жило в двух местах сразу (T100).
    const { station, versionId } = await mixedVersion();

    const id = await saveSubmission({
      mode: "normal",
      versionId,
      answers: [
        boolAnswer("i-gas", false),
        boolAnswer("i-till", false),
        boolAnswer("i-tables", true),
      ],
      startedAt: Date.now() - 60_000,
    });

    const [row] = await listSubmissions({ stationId: station.stationId });
    expect(row?.id).toBe(id);
    expect(row?.failedCount).toBe(2);
    expect(row?.failedCriticalCount).toBe(1);
    // Карточка собирается тем же преобразованием строки — число обязано совпасть.
    expect((await getSubmission(id))?.failedCount).toBe(2);
  });

  test("заполнение без провалов даёт ноль", async () => {
    const { station, versionId } = await mixedVersion();

    await saveSubmission({
      mode: "normal",
      versionId,
      answers: [
        boolAnswer("i-gas", true),
        boolAnswer("i-till", true),
        boolAnswer("i-tables", true),
      ],
      startedAt: Date.now() - 60_000,
    });

    const [row] = await listSubmissions({ stationId: station.stationId });
    expect(row?.failedCount).toBe(0);
  });

  test("пункт, которого в этом режиме не спрашивали, провалом не считается", async () => {
    // Сокращённая смена не показывает обычные пункты; они остаются без ответа,
    // а без ответа провала нет. Иначе лента объявила бы проваленным то,
    // чего у сотрудника даже не спрашивали.
    const { station, versionId } = await mixedVersion();

    await saveSubmission({
      mode: "critical",
      versionId,
      answers: [boolAnswer("i-gas", true)],
      startedAt: Date.now() - 60_000,
    });

    const [row] = await listSubmissions({ stationId: station.stationId });
    expect(row?.itemCount).toBe(1);
    expect(row?.failedCount).toBe(0);
  });
});

describe("saveSubmission", () => {
  test("сохраняет снимок пунктов версии и считает провалы по нему", async () => {
    const { station, sections, versionId } = await readyVersion("save");
    const itemId = sections[0]?.items[0]?.id ?? "";
    const answers = [boolAnswer(itemId, false)];

    const id = await saveSubmission({
      mode: "normal",
      versionId,
      answers,
      startedAt: Date.now() - 60_000,
    });
    const detail = await getSubmission(id);

    expect(detail).not.toBeNull();
    expect(detail?.snapshot).toStrictEqual(sections);
    expect(detail?.answers).toStrictEqual(answers);
    expect(detail?.stationId).toBe(station.stationId);
    expect(detail?.itemCount).toBe(1);
    expect(detail?.answeredCount).toBe(1);
    expect(detail?.failedCriticalCount).toBe(1);
  });

  test("submittedAt берётся из времени базы, а не из входного startedAt", async () => {
    const { sections, versionId } = await readyVersion("clock");
    const itemId = sections[0]?.items[0]?.id ?? "";
    const startedAt = Date.now() - 5 * 60_000;

    const before = Date.now();
    const id = await saveSubmission({
      mode: "normal",
      versionId,
      answers: [boolAnswer(itemId, true)],
      startedAt,
    });
    const after = Date.now();
    const detail = await getSubmission(id);

    expect(detail?.startedAt.getTime()).toBe(startedAt);
    const submittedAtMs = detail?.submittedAt.getTime() ?? 0;
    expect(submittedAtMs).toBeGreaterThanOrEqual(before - 1000);
    expect(submittedAtMs).toBeLessThanOrEqual(after + 1000);
    expect(detail?.durationMs).toBe(submittedAtMs - startedAt);
    expect(detail?.durationMs ?? -1).toBeGreaterThanOrEqual(0);
  });

  test("станция берётся из чек-листа в момент сохранения и не меняется при переносе", async () => {
    const { station, sections, versionId } = await readyVersion("station-pin");
    const itemId = sections[0]?.items[0]?.id ?? "";
    const otherStation = await createStation();

    const id = await saveSubmission({
      mode: "normal",
      versionId,
      answers: [boolAnswer(itemId, true)],
      startedAt: Date.now(),
    });
    // Перенос чек-листа на другую станцию задним числом не переписывает историю.
    const [version] = await db
      .select({ checklistId: checklistVersions.checklistId })
      .from(checklistVersions)
      .where(eq(checklistVersions.id, versionId));
    await db
      .update(checklists)
      .set({ stationId: otherStation.stationId })
      .where(eq(checklists.id, version?.checklistId ?? ""));

    const detail = await getSubmission(id);

    expect(detail?.stationId).toBe(station.stationId);
  });

  test("перевязка чек-листа между выдачей версии и отправкой не уводит заполнение", async () => {
    // Гонка со станцией: сотрудник отсканировал QR станции A и получил версию,
    // методист в это же время перевязывает чек-лист на станцию B, сотрудник
    // отправляет заполнение. Оно физически сделано на A и обязано остаться на A:
    // станция замораживается в версии при публикации, а не читается из
    // мутируемой checklists.station_id в момент сохранения (принцип 3).
    const { station, checklistId, sections, versionId } =
      await readyVersion("гонка");
    const itemId = sections[0]?.items[0]?.id ?? "";
    const another = await createStation();

    await db
      .update(checklists)
      .set({ stationId: another.stationId })
      .where(eq(checklists.id, checklistId));

    const id = await saveSubmission({
      mode: "normal",
      versionId,
      answers: [boolAnswer(itemId, true)],
      startedAt: Date.now(),
    });
    const detail = await getSubmission(id);

    expect(detail?.stationId).toBe(station.stationId);
  });

  test("снимок и заполнение не меняются после публикации следующей версии чек-листа", async () => {
    const { checklistId, sections, versionId } = await readyVersion("history");
    const itemId = sections[0]?.items[0]?.id ?? "";
    const answers = [boolAnswer(itemId, true)];

    const id = await saveSubmission({
      mode: "normal",
      versionId,
      answers,
      startedAt: Date.now(),
    });
    // Методист публикует следующую версию: прежняя уходит в архив, у неё новое содержимое.
    await db
      .update(checklistVersions)
      .set({ status: "archived" })
      .where(eq(checklistVersions.id, versionId));
    await createPublishedVersion(checklistId, sampleSections("history-v2"), 2);

    const detail = await getSubmission(id);

    expect(detail?.snapshot).toStrictEqual(sections);
    expect(detail?.versionId).toBe(versionId);
    expect(detail?.answers).toStrictEqual(answers);
  });

  test("принимает заполнение на версии в состоянии archived", async () => {
    const station = await createStation();
    const checklistId = await createChecklist({ stationId: station.stationId });
    const sections = sampleSections("archived-accept");
    const versionId = await createArchivedVersion(checklistId, sections, 1);
    const itemId = sections[0]?.items[0]?.id ?? "";

    const id = await saveSubmission({
      mode: "normal",
      versionId,
      answers: [boolAnswer(itemId, false)],
      startedAt: Date.now(),
    });
    const detail = await getSubmission(id);

    expect(detail).not.toBeNull();
    expect(detail?.versionNumber).toBe(1);
  });

  test("отказывает на версии в состоянии draft", async () => {
    const station = await createStation();
    const checklistId = await createChecklist({ stationId: station.stationId });
    const versionId = await createDraft(checklistId, sampleSections("draft"));

    await expect(
      saveSubmission({
        mode: "normal",
        versionId,
        answers: [],
        startedAt: Date.now(),
      }),
    ).rejects.toThrow();
  });

  test("отказывает, если чек-листу этой версии не назначена станция", async () => {
    const checklistId = await createChecklist({ stationId: null });
    const versionId = await createPublishedVersion(
      checklistId,
      sampleSections("no-station"),
    );

    await expect(
      saveSubmission({
        mode: "normal",
        versionId,
        answers: [],
        startedAt: Date.now(),
      }),
    ).rejects.toThrow();
  });

  test("отказывает понятной ошибкой, если версии не существует", async () => {
    await expect(
      saveSubmission({
        mode: "normal",
        versionId: randomUUID(),
        answers: [],
        startedAt: Date.now(),
      }),
    ).rejects.toThrow(/версия/i);
  });
});

describe("getSubmission", () => {
  test("читает снимок из самого заполнения, а не текущие пункты версии", async () => {
    // История держится на двух опорах сразу (D002): версии неизменяемы И заполнение
    // хранит свою копию пунктов. Если карточка читает версию, вторая опора мнимая —
    // достаточно одной правки версии мимо слоя доступа, чтобы история переписалась.
    const { sections, versionId } = await readyVersion("опора");
    const id = await saveSubmission({
      mode: "normal",
      versionId,
      answers: [boolAnswer(sections[0]?.items[0]?.id ?? "", false)],
      startedAt: Date.now(),
    });
    await db
      .update(checklistVersions)
      .set({ sections: sampleSections("подменённый") })
      .where(eq(checklistVersions.id, versionId));

    const detail = await getSubmission(id);

    expect(detail?.snapshot).toStrictEqual(sections);
    expect(detail?.failedCriticalCount).toBe(1);
  });

  test("возвращает null для несуществующего, но корректного uuid", async () => {
    await expect(getSubmission(randomUUID())).resolves.toBeNull();
  });

  test("возвращает null, а не бросает исключение, для некорректного формата uuid", async () => {
    await expect(getSubmission("not-a-uuid")).resolves.toBeNull();
  });
});

describe("listSubmissions — фильтры", () => {
  test("фильтрует по стране, пиццерии и станции по отдельности", async () => {
    const a = await readyVersion("filter-a");
    const b = await readyVersion("filter-b");
    const itemA = a.sections[0]?.items[0]?.id ?? "";
    const itemB = b.sections[0]?.items[0]?.id ?? "";
    const idA = await saveSubmission({
      mode: "normal",
      versionId: a.versionId,
      answers: [boolAnswer(itemA, true)],
      startedAt: Date.now(),
    });
    const idB = await saveSubmission({
      mode: "normal",
      versionId: b.versionId,
      answers: [boolAnswer(itemB, true)],
      startedAt: Date.now(),
    });

    const byCountry = await listSubmissions({ countryId: a.station.countryId });
    const byStore = await listSubmissions({ storeId: a.station.storeId });
    const byStation = await listSubmissions({ stationId: a.station.stationId });

    for (const rows of [byCountry, byStore, byStation]) {
      const ids = rows.map((row) => row.id);
      expect(ids).toContain(idA);
      expect(ids).not.toContain(idB);
    }
  });

  test("фильтрует по периоду включительно с обеих сторон и комбинирует фильтры", async () => {
    const { station, versionId } = await readyVersion("period");
    const early = new Date("2026-01-01T00:00:00.000Z");
    const boundaryFrom = new Date("2026-01-05T00:00:00.000Z");
    const boundaryTo = new Date("2026-01-10T00:00:00.000Z");
    const late = new Date("2026-01-20T00:00:00.000Z");

    const insertAt = async (submittedAt: Date): Promise<string> => {
      const [row] = await db
        .insert(submissions)
        .values({
          versionId,
          stationId: station.stationId,
          snapshot: [],
          answers: [],
          startedAt: submittedAt,
          submittedAt,
        })
        .returning({ id: submissions.id });
      if (row === undefined)
        throw new Error("Строка не вставилась: submissions");
      return row.id;
    };
    const idEarly = await insertAt(early);
    const idFrom = await insertAt(boundaryFrom);
    const idTo = await insertAt(boundaryTo);
    const idLate = await insertAt(late);

    const rows = await listSubmissions({
      stationId: station.stationId,
      from: boundaryFrom,
      to: boundaryTo,
    });
    const ids = rows.map((row) => row.id);

    expect(ids).toContain(idFrom);
    expect(ids).toContain(idTo);
    expect(ids).not.toContain(idEarly);
    expect(ids).not.toContain(idLate);
  });

  test("сортирует по времени отправки по убыванию", async () => {
    const { station, versionId } = await readyVersion("order");
    const older = new Date("2026-02-01T00:00:00.000Z");
    const newer = new Date("2026-02-02T00:00:00.000Z");
    const insertAt = async (submittedAt: Date): Promise<string> => {
      const [row] = await db
        .insert(submissions)
        .values({
          versionId,
          stationId: station.stationId,
          snapshot: [],
          answers: [],
          startedAt: submittedAt,
          submittedAt,
        })
        .returning({ id: submissions.id });
      if (row === undefined)
        throw new Error("Строка не вставилась: submissions");
      return row.id;
    };
    const idOlder = await insertAt(older);
    const idNewer = await insertAt(newer);

    const rows = await listSubmissions({ stationId: station.stationId });
    const ids = rows.map((row) => row.id);

    expect(ids.indexOf(idNewer)).toBeLessThan(ids.indexOf(idOlder));
  });

  test("пятьсот заполнений с одинаковой отметкой времени отдаются в одном порядке", async () => {
    // Пачка, вставленная одним запросом, получает одинаковый submitted_at. Сортировки
    // только по нему не хватает: порядок внутри пачки не определён, и LIMIT отдаёт
    // разные подмножества от запроса к запросу. Вторичный ключ — id по убыванию.
    const { station, versionId } = await readyVersion("устойчивый-порядок");
    const submittedAt = new Date("2026-03-01T12:00:00.000Z");
    const inserted = await db
      .insert(submissions)
      .values(
        Array.from({ length: 500 }, () => ({
          versionId,
          stationId: station.stationId,
          snapshot: [] as Section[],
          answers: [] as Answer[],
          startedAt: submittedAt,
          submittedAt,
        })),
      )
      .returning({ id: submissions.id });
    const expected = inserted
      .map((row) => row.id)
      .sort()
      .reverse()
      .slice(0, 200);

    const first = await listSubmissions({ stationId: station.stationId });
    const second = await listSubmissions({ stationId: station.stationId });

    expect(first.map((row) => row.id)).toStrictEqual(expected);
    expect(second.map((row) => row.id)).toStrictEqual(expected);
  });

  test("отрицательный лимит не роняет ленту", async () => {
    // Опечатка в фильтре не должна превращаться в ошибку драйвера.
    await expect(listSubmissions({ limit: -5 })).resolves.toHaveLength(1);
  });

  test("ограничивает выдачу лимитом и обрезает значение выше 500 до 500", async () => {
    const { station, versionId } = await readyVersion("limit");
    const total = 505;
    const rows = Array.from({ length: total }, () => ({
      versionId,
      stationId: station.stationId,
      snapshot: [] as Section[],
      answers: [] as Answer[],
      startedAt: new Date(),
    }));
    await db.insert(submissions).values(rows);

    const defaultLimit = await listSubmissions({
      stationId: station.stationId,
    });
    const explicitLimit = await listSubmissions({
      stationId: station.stationId,
      limit: 3,
    });
    const aboveMax = await listSubmissions({
      stationId: station.stationId,
      limit: 10_000,
    });

    expect(defaultLimit).toHaveLength(200);
    expect(explicitLimit).toHaveLength(3);
    expect(aboveMax).toHaveLength(500);
  });
});
