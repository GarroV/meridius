// Раздел «Устройства» отвечает на вопрос «какой планшет к какой станции привязан и где
// планшета нет» (D163). Ошибка здесь молчит: станция, выпавшая из списка, выглядит как
// «её нет», а планшет, приписанный не той станции, — как исправная привязка. Поэтому
// проверки написаны ДО кода и идут на настоящей базе: левое соединение и свёртка строк
// по станции — ровно то место, где размножение и потеря строк случаются незаметно.
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { getDb, stations } from "@/blocks/data";
import { createChecklist, createStation } from "@/blocks/data/testing/fixtures";
import { WHOLE_NETWORK } from "@/blocks/auth/scope";

import { pairDevice, unpairDevice } from "./devices";
import { findStationTablets, listStationTablets } from "./station-tablets";

const NOW = new Date("2026-09-28T10:00:00Z");
const SECOND = 1000;

function later(seconds: number): Date {
  return new Date(NOW.getTime() + seconds * SECOND);
}

async function entryOf(stationId: string) {
  const all = await listStationTablets(WHOLE_NETWORK);
  return all.filter((entry) => entry.stationId === stationId);
}

describe("станции и их планшеты", () => {
  it("показывает станцию без планшета — с пустым списком, а не выбрасывает её", async () => {
    // Ради этого соединение левое: станция без планшета — главный ответ раздела
    // («куда ещё не поставили»), и внутреннее соединение потеряло бы её молча.
    const { stationId, storeId, countryId } = await createStation();

    const [entry, ...rest] = await entryOf(stationId);

    expect(rest).toHaveLength(0);
    expect(entry).toMatchObject({
      stationId,
      storeId,
      countryId,
      tablets: [],
    });
    expect(entry?.stationName).toMatch(/^Станция /);
    expect(entry?.storeName).toMatch(/^Пиццерия /);
    expect(entry?.countryName).toMatch(/^Страна /);
  });

  it("сворачивает два планшета станции в ОДНУ станцию, по порядку привязки", async () => {
    const { stationId } = await createStation();
    const second = await pairDevice({ stationId }, later(60));
    const first = await pairDevice({ stationId }, NOW);

    const entries = await entryOf(stationId);

    expect(entries).toHaveLength(1);
    expect(entries[0]?.tablets.map((tablet) => tablet.id)).toEqual([
      first.id,
      second.id,
    ]);
    expect(entries[0]?.tablets[0]?.pairedAt).toEqual(NOW);
    expect(entries[0]?.tablets[0]?.lastSeenAt).toEqual(NOW);
  });

  it("не приписывает планшет соседней станции той же пиццерии", async () => {
    const a = await createStation();
    const b = await createStation();
    const tablet = await pairDevice({ stationId: a.stationId }, NOW);

    const [entryA] = await entryOf(a.stationId);
    const [entryB] = await entryOf(b.stationId);

    expect(entryA?.tablets.map((row) => row.id)).toEqual([tablet.id]);
    expect(entryB?.tablets).toEqual([]);
  });

  it("считает чек-листы станции числом: ноль значит «планшету нечего показать»", async () => {
    const bare = await createStation();
    const covered = await createStation();
    await createChecklist({ stationId: covered.stationId });

    const [bareEntry] = await entryOf(bare.stationId);
    const [coveredEntry] = await entryOf(covered.stationId);

    // `toBe(0)`, а не `toBeFalsy()`: драйвер отдаёт bigint строкой, и "0" прошло бы
    // сравнение с нулём на экране как «чек-лист есть» (тот же случай в stations/overview).
    expect(bareEntry?.checklistCount).toBe(0);
    expect(coveredEntry?.checklistCount).toBe(1);
  });

  it("отвязанный планшет пропадает из станции, а сама станция остаётся", async () => {
    const { stationId } = await createStation();
    const tablet = await pairDevice({ stationId }, NOW);

    await unpairDevice(tablet.id);

    const entries = await entryOf(stationId);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.tablets).toEqual([]);
  });
});

describe("одна станция для панели", () => {
  it("отдаёт станцию с её планшетами", async () => {
    const { stationId } = await createStation();
    const tablet = await pairDevice({ stationId }, NOW);

    const entry = await findStationTablets(stationId, WHOLE_NETWORK);

    expect(entry?.stationId).toBe(stationId);
    expect(entry?.tablets.map((row) => row.id)).toEqual([tablet.id]);
  });

  it("не находит удалённую станцию", async () => {
    const { stationId } = await createStation();
    await getDb().delete(stations).where(eq(stations.id, stationId));

    expect(await findStationTablets(stationId, WHOLE_NETWORK)).toBeNull();
  });

  it("не падает на мусоре из адреса: параметр панели пишет кто угодно", async () => {
    expect(await findStationTablets("не uuid", WHOLE_NETWORK)).toBeNull();
    expect(await findStationTablets("", WHOLE_NETWORK)).toBeNull();
  });
});
