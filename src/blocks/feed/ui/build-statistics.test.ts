// Сборка экранов раздела «Статистика» (D179) на настоящей базе: плитки страны сводят
// статус на сегодня, тревоги и цифры за период по пиццерии, экран пиццерии — её чек-листы,
// и партнёр не видит ни чужих стран, ни чужих пиццерий (D145).
//
// Это обвязка, а не ядро: сами числа держат тесты `today-*` и `stats-*`. Здесь проверено,
// что сборка подаёт их тем пиццериям и тем чек-листам, к которым они относятся, — живой
// стенд на Маке не поднимается (D168), и иначе это видно только в CI.
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, test } from "vitest";

import { saveSubmission, submissions } from "@/blocks/data";
import type { Section } from "@/blocks/data";
import { hqViewer, partnerViewer } from "@/blocks/auth/testing/viewers";
import { closeTestDb, getTestDb } from "@/blocks/data/testing/db";
import {
  createChecklist,
  createPublishedVersion,
  createStation,
} from "@/blocks/data/testing/fixtures";

import { buildCountryModel } from "./build-country-model";
import { buildStoreModel } from "./build-store-model";

const db = getTestDb();
afterAll(closeTestDb);

/** 06.09.2026, 14:00 UTC: утреннее окно 06:00–12:00 закрыто, вечернее 18:00–22:00 впереди. */
const NOW = new Date("2026-09-06T14:00:00Z");
/** Прежние «7 дней» — старым адресом: экран разберёт его в даты своего пояса. */
const WEEK = { kind: "lastDays", days: 7 } as const;

const SECTIONS: Section[] = [
  {
    id: "s-1",
    title: { ru: "Секция", en: "Section" },
    source: "own",
    items: [
      {
        id: "i-gas",
        title: { ru: "Газ", en: "Gas" },
        type: "bool",
        severity: "critical",
      },
    ],
  },
];

async function checklist(stationId: string, start: string, end: string) {
  const checklistId = await createChecklist({
    stationId,
    windowStart: start,
    windowEnd: end,
  });
  const versionId = await createPublishedVersion(checklistId, SECTIONS);
  return { checklistId, versionId };
}

async function fill(versionId: string, at: Date, gasOk: boolean) {
  const id = await saveSubmission({
    mode: "normal",
    versionId,
    answers: [{ itemId: "i-gas", value: gasOk, at: at.getTime() }],
    startedAt: at.getTime() - 60_000,
  });
  await db
    .update(submissions)
    .set({ submittedAt: at })
    .where(eq(submissions.id, id));
}

/** Пиццерия с тремя чек-листами: заполнен с провалом, пропущен, ждёт вечера. */
async function store() {
  const station = await createStation();
  const filled = await checklist(station.stationId, "06:00:00", "12:00:00");
  await checklist(station.stationId, "07:00:00", "11:00:00");
  await checklist(station.stationId, "18:00:00", "22:00:00");
  await fill(filled.versionId, new Date("2026-09-06T09:00:00Z"), false);
  return { ...station, filled };
}

describe("экран страны", () => {
  test("плитка пиццерии: заполнено, ждёт, пропущено, тревоги и цифры за период", async () => {
    const place = await store();
    const model = await buildCountryModel(
      { countryId: place.countryId, period: WEEK },
      "ru",
      await hqViewer(),
      NOW,
    );

    expect(model.countryId).toBe(place.countryId);
    expect(model.isExplicit).toBe(true);
    expect(model.stores).toHaveLength(1);
    expect(model.stores[0]).toMatchObject({
      storeId: place.storeId,
      today: { filled: 1, waiting: 1, missed: 1, total: 3 },
      // Провал критичного и пропущенный чек-лист.
      alarmCount: 2,
      submissionCount: 1,
      criticalFailedCount: 1,
      // Плитка несёт период экрана: пиццерия открывается тем же отрезком (D183 п.4).
      href: `/admin/feed/stores/${place.storeId}?from=2026-08-31&to=2026-09-06`,
    });
    expect(model.summary?.submissionCount).toBe(1);
  });

  test("партнёр видит только свои страны; чужая в адресе — открыта первая своя", async () => {
    const mine = await store();
    const theirs = await store();
    const partner = await partnerViewer([mine.countryId]);

    const model = await buildCountryModel(
      { countryId: theirs.countryId, period: WEEK },
      "ru",
      partner,
      NOW,
    );

    expect(model.countries.map((row) => row.id)).toStrictEqual([
      mine.countryId,
    ]);
    expect(model.countryId).toBe(mine.countryId);
    expect(model.isExplicit).toBe(false);
    expect(model.stores.map((tile) => tile.storeId)).toStrictEqual([
      mine.storeId,
    ]);
  });

  test("у партнёра без стран — пустой экран, а не чужая сеть", async () => {
    const model = await buildCountryModel(
      { period: WEEK },
      "ru",
      await partnerViewer([]),
      NOW,
    );
    expect(model).toMatchObject({
      countries: [],
      countryId: null,
      summary: null,
      stores: [],
    });
  });
});

describe("экран пиццерии", () => {
  test("все живые чек-листы пиццерии со статусом на сегодня и статистикой", async () => {
    const place = await store();
    const model = await buildStoreModel(
      {
        storeId: place.storeId,
        feed: { period: WEEK },
      },
      "ru",
      await hqViewer(),
      NOW,
    );

    expect(
      model?.checklists.map((row) => row.status.kind).toSorted(),
    ).toStrictEqual(["filled", "missed", "upcoming"]);
    const filled = model?.checklists.find(
      (row) => row.checklistId === place.filled.checklistId,
    );
    expect(filled).toMatchObject({
      window: "06:00–12:00",
      summary: { submissionCount: 1, criticalFailedCount: 1 },
    });
    expect(model?.feed.rows).toHaveLength(1);
    expect(model?.feed.alarms.rows).toHaveLength(2);
    expect(model?.backHref).toBe(
      `/admin/feed?country=${place.countryId}&from=2026-08-31&to=2026-09-06`,
    );
    // Один период на весь экран: сводка и лента считают один и тот же отрезок.
    expect(model?.stats.selection.period).toStrictEqual({
      from: "2026-08-31",
      to: "2026-09-06",
    });
    expect(model?.feed.selection.period).toStrictEqual(
      model?.stats.selection.period,
    );
  });

  test("чужая пиццерия — экрана нет", async () => {
    const mine = await store();
    const theirs = await store();
    const partner = await partnerViewer([mine.countryId]);

    expect(
      await buildStoreModel(
        { storeId: theirs.storeId, feed: { period: WEEK } },
        "ru",
        partner,
        NOW,
      ),
    ).toBeNull();
  });
});
