// Две проверки вокруг правила «одно заполнение — одна запись» (T219), которых не
// делает ни один прогон через настоящую базу.
//
// Первая: помеченный повтор прошлого не выдаётся за прежнюю запись. Такие строки
// оставила миграция 0012 на живой базе, и квитанция по ним указывала бы не на ту
// запись, которую сама миграция признала канонической.
//
// Вторая: правило базы сработало, а прежней записи нет. С настоящей базой это
// недостижимо, поэтому запись подменяется. Случай выглядит невозможным, и именно
// поэтому проверяется: выдуманная квитанция — это «отправлено» на экране сотрудника
// при ответах, которые никуда не легли.
import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getDb,
  publishVersion,
  saveSubmission,
  submissions,
} from "@/blocks/data";
import {
  createChecklist,
  createDraft,
  createStation,
  sampleSections,
} from "@/blocks/data/testing/fixtures";

import { findRepeatedSubmission, saveOnce } from "./repeat";

vi.mock("@/blocks/data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/blocks/data")>();
  return { ...actual, saveSubmission: vi.fn(actual.saveSubmission) };
});

/** Отказ ровно того правила, которое `saveOnce` обязана превращать в квитанцию. */
const ONE_PER_FILLING_INDEX = "submissions_one_per_filling_idx";

async function publishedVersionId(label: string): Promise<string> {
  const station = await createStation();
  const checklistId = await createChecklist({ stationId: station.stationId });
  await createDraft(checklistId, sampleSections(label));
  return (await publishVersion(checklistId)).id;
}

beforeEach(() => {
  vi.mocked(saveSubmission).mockClear();
});

describe("поиск прежней записи не смотрит на помеченные повторы", () => {
  it("у пары «канонная запись + помеченный повтор» возвращается канонная", async () => {
    const versionId = await publishedVersionId("канон");
    const startedAt = Date.parse("2026-09-18T06:00:00.000Z");
    // Так выглядит пара, оставшаяся от старой гонки: первая запись помечена
    // миграцией, вторая легла уже под правилом и является канонной.
    const marked = await saveSubmission({
      versionId,
      answers: [],
      startedAt,
      mode: "normal",
    });
    await getDb()
      .update(submissions)
      .set({ duplicate: true })
      .where(eq(submissions.id, marked));
    const canonical = await saveSubmission({
      versionId,
      answers: [],
      startedAt,
      mode: "normal",
    });

    const found = await findRepeatedSubmission(versionId, startedAt);

    expect(found).toBe(canonical);
    expect(found).not.toBe(marked);
  });
});

describe("saveOnce не выдумывает квитанцию", () => {
  it("правило базы сработало, а прежней записи нет — падает настоящей ошибкой", async () => {
    const versionId = randomUUID();
    const conflict = Object.assign(
      new Error('duplicate key value violates unique constraint "…"'),
      { code: "23505", constraint: ONE_PER_FILLING_INDEX },
    );
    vi.mocked(saveSubmission).mockRejectedValueOnce(conflict);

    await expect(
      saveOnce({
        versionId,
        answers: [],
        startedAt: Date.now(),
        mode: "normal",
      }),
    ).rejects.toBe(conflict);
  });
});
