// Счётчики списка станций читаются из настоящей базы, а не из заглушки.
//
// Сам подсчёт `gapsOf` закрыт отдельно и чисто (`gaps.test.ts`). Здесь проверяется стык,
// на котором он молча ломается: `count()` в PostgreSQL возвращает bigint, драйвер отдаёт
// bigint СТРОКОЙ, а `sql<number>` — обещание, которое TypeScript принимает на веру. Строка
// "0" не равна нулю, сравнение в `gaps.ts` не срабатывает, и экран показывает «разрывов
// нет» ровно там, где станция стоит без чек-листа. Заглушка такую подмену не ловит по
// определению: она вернёт то число, которое в неё положили.
import { describe, expect, test } from "vitest";

import { submissions } from "@/blocks/data";
import { getTestDb } from "@/blocks/data/testing/db";
import {
  createChecklist,
  createPublishedVersion,
  createStation,
  sampleSections,
} from "@/blocks/data/testing/fixtures";

import { listNetworkStations } from "./overview";
import { WHOLE_NETWORK } from "@/blocks/auth/scope";

describe("список станций сети", () => {
  test("станция без чек-листа приходит нулём-числом и попадает в разрыв", async () => {
    const { stationId } = await createStation();

    const stations = await listNetworkStations(WHOLE_NETWORK, new Date());
    const station = stations.find((one) => one.id === stationId);

    expect(
      station,
      "свежесозданная станция не попала в список сети",
    ).toBeDefined();
    // Именно `typeof`, а не `toBe(0)`: строка "0" не равна нулю и провалила бы уже
    // сравнение, но сказала бы про это невнятно — «ожидалось 0, получено "0"» читается
    // как придирка. Тип называет причину.
    expect(typeof station?.checklistCount).toBe("number");
    expect(typeof station?.deviceCount).toBe("number");
    expect(station?.checklistCount).toBe(0);
    expect(station?.gaps).toContain("noChecklist");
  });

  // Тот же стык, вторая его сторона: `max(submitted_at)` подзапросом приходит от драйвера
  // строкой, а подсчёт тишины зовёт у неё `getTime()`. Станция без отправок этот путь не
  // проходит — у неё берётся дата создания из колонки, — поэтому нужна своя отправка.
  test("время последней отправки приходит датой, и список не падает на заполненной станции", async () => {
    const { stationId } = await createStation();
    const checklistId = await createChecklist({ stationId });
    const versionId = await createPublishedVersion(
      checklistId,
      sampleSections("overview"),
    );
    await getTestDb().insert(submissions).values({
      versionId,
      stationId,
      snapshot: [],
      answers: [],
      startedAt: new Date(),
    });

    const stations = await listNetworkStations(WHOLE_NETWORK, new Date());
    const station = stations.find((one) => one.id === stationId);

    expect(station?.lastSubmissionAt).toBeInstanceOf(Date);
    expect(station?.checklistCount).toBe(1);
    expect(station?.gaps).toEqual([]);
  });
});
