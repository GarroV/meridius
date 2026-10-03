// Цифры главной (D174) на настоящей базе: заполнения, проваленные критичные пункты и
// средняя длительность за период.
//
// Главное здесь — что цифры не зависят от ленты. Лента обрезана на 200 строк, и счёт
// по её строкам молча занижал бы главную у пиццерии, где за неделю заполнили больше.
// Правило счёта — то же, что у «Статистики»: повтор (`duplicate`) — вторая запись того
// же заполнения, в счёт не идёт; период — календарные сутки в поясе экрана.
import { afterAll, describe, expect, test } from "vitest";

import { WHOLE_NETWORK } from "@/blocks/auth/scope";
import { hqViewer } from "@/blocks/auth/testing/viewers";
import type { AnswerValue, Item, Section } from "@/blocks/data";
import { submissions } from "@/blocks/data";
import { closeTestDb, getTestDb } from "@/blocks/data/testing/db";
import {
  createChecklist,
  createPublishedVersion,
  createStation,
} from "@/blocks/data/testing/fixtures";
import { loadStats } from "@/blocks/feed/stats";

import { loadHome } from "./load";
import { parseHomeView } from "./view";

const db = getTestDb();
afterAll(closeTestDb);

const NOW = new Date("2026-09-20T12:00:00Z");
const MINUTE = 60_000;
const DAY = 86_400_000;

/** Больше, чем лента показывает строками (`FEED_LIMIT` = 200). */
const MANY = 205;

const ITEMS: readonly Item[] = [
  {
    id: "gas",
    title: { ru: "Газ", en: "Gas" },
    type: "bool",
    severity: "critical",
  },
  {
    id: "fire",
    title: { ru: "Огнетушитель", en: "Extinguisher" },
    type: "bool",
    severity: "critical",
  },
  {
    id: "tables",
    title: { ru: "Столы", en: "Tables" },
    type: "bool",
    severity: "normal",
  },
];

function sections(): Section[] {
  return [
    {
      id: "s-1",
      title: { ru: "Секция", en: "Section" },
      source: "own",
      items: [...ITEMS],
    },
  ];
}

interface Place {
  readonly storeId: string;
  readonly stationId: string;
  readonly versionId: string;
}

async function place(): Promise<Place> {
  const station = await createStation();
  const checklistId = await createChecklist({ stationId: station.stationId });
  const versionId = await createPublishedVersion(checklistId, sections());
  return { storeId: station.storeId, stationId: station.stationId, versionId };
}

interface Fill {
  readonly submittedAt: Date;
  readonly durationMs?: number;
  readonly answers?: Record<string, AnswerValue>;
  readonly duplicate?: boolean;
}

async function fillAll(at: Place, fills: readonly Fill[]): Promise<void> {
  await db.insert(submissions).values(
    fills.map((fill) => ({
      versionId: at.versionId,
      stationId: at.stationId,
      snapshot: sections(),
      answers: Object.entries(fill.answers ?? {}).map(([itemId, value]) => ({
        itemId,
        value,
        at: fill.submittedAt.getTime(),
      })),
      startedAt: new Date(
        fill.submittedAt.getTime() - (fill.durationMs ?? MINUTE),
      ),
      submittedAt: fill.submittedAt,
      duplicate: fill.duplicate ?? false,
    })),
  );
}

async function homeOf(storeId: string) {
  return loadHome(
    parseHomeView({ store: storeId }),
    "ru",
    await hqViewer(),
    NOW,
  );
}

describe("цифры главной", () => {
  test("заполнений больше предела ленты — главная считает все", async () => {
    const at = await place();
    await fillAll(
      at,
      Array.from({ length: MANY }, (_, n) => ({
        submittedAt: new Date(NOW.getTime() - (n + 1) * MINUTE),
      })),
    );

    const home = await homeOf(at.storeId);

    // Случай действительно за пределом ленты: она упёрлась и показывает 200.
    expect(home.feed.limitReached).toBe(true);
    expect(home.feed.rows).toHaveLength(200);
    expect(home.metrics.submissionCount).toBe(MANY);
    expect(home.metrics.averageDurationMs).toBe(MINUTE);
  });

  test("повтор не считается — как в «Статистике»", async () => {
    const at = await place();
    await fillAll(at, [
      { submittedAt: new Date(NOW.getTime() - DAY), answers: { gas: false } },
      // Повтор того же заполнения: в ленте он есть, в счёте — нет.
      {
        submittedAt: new Date(NOW.getTime() - DAY + MINUTE),
        answers: { gas: false },
        duplicate: true,
      },
      { submittedAt: new Date(NOW.getTime() - 2 * DAY) },
    ]);

    const home = await homeOf(at.storeId);
    const stats = await loadStats(
      { visible: WHOLE_NETWORK, storeId: at.storeId },
      7,
      NOW,
      "UTC",
    );

    expect(home.metrics.submissionCount).toBe(2);
    expect(home.metrics.submissionCount).toBe(stats.submissionCount);
    expect(home.metrics.failedCriticalCount).toBe(1);
  });

  test("проваленные критичные — пунктами; обычный провал и пропуск не в счёт", async () => {
    const at = await place();
    await fillAll(at, [
      {
        submittedAt: new Date(NOW.getTime() - DAY),
        answers: { gas: false, fire: false, tables: false },
      },
      // Критичный пункт без ответа — не провал; «да» — не провал.
      {
        submittedAt: new Date(NOW.getTime() - 2 * DAY),
        answers: { gas: true, tables: false },
      },
    ]);

    const home = await homeOf(at.storeId);

    expect(home.metrics.failedCriticalCount).toBe(2);
  });

  test("период — календарные сутки; часы устройства не дают отрицательной длительности", async () => {
    const at = await place();
    const weekStart = new Date("2026-09-14T00:00:00Z");
    await fillAll(at, [
      { submittedAt: weekStart, durationMs: 4 * MINUTE },
      // Начато «после» отправки — часы планшета ушли вперёд: длительность 0.
      { submittedAt: new Date(NOW.getTime() - DAY), durationMs: -10 * MINUTE },
      // За минуту до начала недели — уже вне периода.
      { submittedAt: new Date(weekStart.getTime() - MINUTE) },
    ]);

    const home = await homeOf(at.storeId);

    expect(home.metrics.submissionCount).toBe(2);
    expect(home.metrics.averageDurationMs).toBe(2 * MINUTE);
  });

  test("пусто за период — среднего нет, а не ноль", async () => {
    const at = await place();

    const home = await homeOf(at.storeId);

    expect(home.metrics).toEqual({
      submissionCount: 0,
      failedCriticalCount: 0,
      averageDurationMs: null,
    });
  });
});
