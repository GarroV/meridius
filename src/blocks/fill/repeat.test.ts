// Запись с защитой от повтора (`saveOnce`) обязана превращать в квитанцию ТОЛЬКО отказ
// правила «одно заполнение — одна запись». Любой другой отказ, превращённый в квитанцию
// прежней записи, — это «отправлено» на экране сотрудника при ответах, которые никуда
// не легли: худший вид сбоя, потому что выглядит успехом. Сама гонка проверяется в
// `submit.test.ts`; здесь — что лишнего `saveOnce` не глотает.
import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { publishVersion } from "@/blocks/data";
import {
  createChecklist,
  createDraft,
  createStation,
  sampleSections,
} from "@/blocks/data/testing/fixtures";
import { PG_CHECK_VIOLATION, dbErrorCode } from "@/blocks/data/testing/errors";

import { saveOnce } from "./repeat";

/** Больше предела размера ответов в базе (64 КиБ, `submissions_answers_size`). */
const OVERSIZED_TEXT_LENGTH = 70_000;

async function publishedVersionId(label: string): Promise<string> {
  const station = await createStation();
  const checklistId = await createChecklist({ stationId: station.stationId });
  await createDraft(checklistId, sampleSections(label));
  return (await publishVersion(checklistId)).id;
}

describe("saveOnce не глотает отказы, которые не повтор", () => {
  it("отказ по другому правилу базы — даже на уже записанной паре — не становится квитанцией", async () => {
    // Пара «версия + начало» уже записана, поэтому ошибочно широкое опознание повтора
    // нашло бы прежнюю запись и вернуло её как успех.
    const versionId = await publishedVersionId("не-повтор");
    const startedAt = Date.parse("2026-09-18T07:00:00.000Z");
    await saveOnce({ versionId, answers: [], startedAt, mode: "normal" });
    const oversized = [
      { itemId: "i", value: "x".repeat(OVERSIZED_TEXT_LENGTH), at: startedAt },
    ];

    const code = await dbErrorCode(
      saveOnce({ versionId, answers: oversized, startedAt, mode: "normal" }),
    );

    expect(code).toBe(PG_CHECK_VIOLATION);
  });

  it("ошибка без кода базы доходит до вызвавшего как есть", async () => {
    await expect(
      saveOnce({
        versionId: randomUUID(),
        answers: [],
        startedAt: Date.now(),
        mode: "normal",
      }),
    ).rejects.toThrow(/версия/i);
  });
});
