import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import {
  checklistVersions,
  countries,
  getDb,
  publishVersion,
  stations,
  setShiftMode,
} from "@/blocks/data";
import type { Section } from "@/blocks/data";
import {
  createChecklist,
  createDraft,
  createStation,
  sampleSections,
} from "@/blocks/data/testing/fixtures";

import { findStationVersion, loadFillTarget } from "./station";

/** Язык страны пиццерии: по нему пишется отбивка «заполнять нечего» (D122). */
async function setCountryLocale(
  countryId: string,
  locale: string,
): Promise<void> {
  await getDb()
    .update(countries)
    .set({ locale })
    .where(eq(countries.id, countryId));
}

const MORNING = new Date("2026-09-06T09:00:00Z");
const AFTERNOON = new Date("2026-09-06T15:00:00Z");

async function publishedStation(): Promise<{
  code: string;
  stationId: string;
  versionId: string;
}> {
  const station = await createStation();
  const checklistId = await createChecklist({
    stationId: station.stationId,
    windowStart: "06:00:00",
    windowEnd: "12:00:00",
  });
  await createDraft(checklistId, sampleSections("опора"));
  const version = await publishVersion(checklistId);
  return {
    code: station.stationCode,
    stationId: station.stationId,
    versionId: version.id,
  };
}

/** Чек-лист со всеми тремя уровнями: на нём и проверяется фильтр по режиму. */
function mixedSections(): Section[] {
  return [
    {
      id: "s-mixed",
      title: { ru: "Закрытие", en: "Closing" },
      source: "own",
      items: [
        {
          id: "i-gas",
          title: { ru: "Газ выключен", en: "Gas off" },
          type: "bool",
          severity: "critical",
        },
        {
          id: "i-till",
          title: { ru: "Касса пересчитана", en: "Till counted" },
          type: "bool",
          severity: "major",
        },
        {
          id: "i-tables",
          title: { ru: "Столы протёрты", en: "Tables wiped" },
          type: "bool",
          severity: "normal",
        },
      ],
    },
  ];
}

async function mixedStation(): Promise<{ code: string; storeId: string }> {
  const station = await createStation();
  const checklistId = await createChecklist({
    stationId: station.stationId,
    windowStart: "06:00:00",
    windowEnd: "12:00:00",
  });
  await createDraft(checklistId, mixedSections());
  await publishVersion(checklistId);
  return { code: station.stationCode, storeId: station.storeId };
}

/** Идентификаторы пунктов, которые экран покажет сотруднику. */
async function shownItemIds(code: string): Promise<string[]> {
  const target = await loadFillTarget(code, MORNING);
  if (target.kind !== "ok") return [];
  return target.sections.flatMap((section) =>
    section.items.map((item) => item.id),
  );
}

describe("режим смены решает, что попадёт на экран", () => {
  it("без выбора режима работает полная смена: показаны все пункты", async () => {
    const { code } = await mixedStation();

    expect(await shownItemIds(code)).toStrictEqual([
      "i-gas",
      "i-till",
      "i-tables",
    ]);
  });

  it("шапка говорит, что режим никто не ставил", async () => {
    const { code } = await mixedStation();

    const target = await loadFillTarget(code, MORNING);

    expect(target).toMatchObject({ mode: "normal", modeChosen: false });
  });

  it("смена с ограничениями убирает обычные пункты", async () => {
    const { code, storeId } = await mixedStation();

    await setShiftMode({ storeId, mode: "reduced" }, MORNING);

    expect(await shownItemIds(code)).toStrictEqual(["i-gas", "i-till"]);
  });

  it("критичная смена оставляет только критичное", async () => {
    const { code, storeId } = await mixedStation();

    await setShiftMode({ storeId, mode: "critical" }, MORNING);

    const target = await loadFillTarget(code, MORNING);

    expect(target).toMatchObject({ mode: "critical", modeChosen: true });
    expect(await shownItemIds(code)).toStrictEqual(["i-gas"]);
  });

  it("режим, в котором не осталось пунктов, не открывает пустой чек-лист", async () => {
    // Чек-лист без критичных пунктов в критичную смену: честнее сказать «заполнять
    // нечего», чем показать экран без пунктов с активной кнопкой отправки.
    const station = await createStation();
    const checklistId = await createChecklist({
      stationId: station.stationId,
      windowStart: "06:00:00",
      windowEnd: "12:00:00",
    });
    await createDraft(checklistId, [
      {
        id: "s-soft",
        title: { ru: "Уборка", en: "Cleaning" },
        source: "own",
        items: [
          {
            id: "i-soft",
            title: { ru: "Полить цветы", en: "Water the plants" },
            type: "bool",
            severity: "normal",
          },
        ],
      },
    ]);
    await publishVersion(checklistId);
    await setShiftMode({ storeId: station.storeId, mode: "critical" }, MORNING);

    expect((await loadFillTarget(station.stationCode, MORNING)).kind).toBe(
      "no-checklist",
    );
  });

  it("режим соседней пиццерии на эту станцию не влияет", async () => {
    const mine = await mixedStation();
    const other = await mixedStation();

    await setShiftMode({ storeId: other.storeId, mode: "critical" }, MORNING);

    expect(await shownItemIds(mine.code)).toHaveLength(3);
  });
});

describe("что отдаёт публичный маршрут по коду станции", () => {
  it("отдаёт опубликованную версию, название пиццерии и язык страны", async () => {
    // Arrange
    const { code, versionId } = await publishedStation();

    // Act
    const target = await loadFillTarget(code, MORNING);

    // Assert
    expect(target.kind).toBe("ok");
    if (target.kind !== "ok") return;
    expect(target.version.id).toBe(versionId);
    expect(target.storeName).toMatch(/^Пиццерия /);
    expect(target.stationName).toMatch(/^Станция /);
    expect(target.countryLocale).toBe("ru");
  });

  it("не отдаёт ничего сверх чек-листа: ни истории станции, ни других чек-листов", async () => {
    // Arrange: у той же станции есть заполнение и второй чек-лист на другое окно.
    const { code, stationId } = await publishedStation();
    const evening = await createChecklist({
      stationId,
      windowStart: "18:00:00",
      windowEnd: "23:00:00",
      title: { ru: "Вечерний", en: "Evening" },
    });
    await createDraft(evening, sampleSections("вечер"));
    await publishVersion(evening);

    // Act
    const target = await loadFillTarget(code, MORNING);

    // Assert: в ответе ровно один чек-лист и ни одного поля с историей.
    expect(target.kind).toBe("ok");
    const fields = Object.keys(target).sort();
    expect(fields).toStrictEqual([
      "checklist",
      "countryLocale",
      "kind",
      // Режим смены и отфильтрованные им пункты — то, что экран и так показывает
      // человеку с наклейкой в руках; истории станции среди них нет (D021, D055).
      "mode",
      "modeChosen",
      "sections",
      "stationName",
      "storeName",
      // Часовой пояс пиццерии — той же породы, что `countryLocale`: не история и не
      // соседний чек-лист, а то, без чего экран показывает не своё. Время отправки
      // считается в нём, иначе кухня видит час, которого у неё не было (T234).
      "timeZone",
      "version",
    ]);
    const serialized = JSON.stringify(target);
    expect(serialized).not.toContain("Вечерний");
    expect(serialized).not.toContain("submission");
  });

  it("неизвестный код даёт отказ, а не пустой экран и не чужой чек-лист", async () => {
    expect(await loadFillTarget("нетакогокода", MORNING)).toStrictEqual({
      kind: "unknown-code",
    });
  });

  it("перевыпущенный код неотличим от несуществующего", async () => {
    // Arrange: перевыпуск переписывает код станции — прежней строки нигде не остаётся,
    // поэтому старая наклейка обязана давать ровно тот же отказ, что и случайный код.
    const { code, stationId } = await publishedStation();
    await getDb()
      .update(stations)
      .set({ code: `re${code}`.slice(0, 10) })
      .where(eq(stations.id, stationId));

    expect(await loadFillTarget(code, MORNING)).toStrictEqual({
      kind: "unknown-code",
    });
  });

  it("код в чужом формате отбивается до похода в базу", async () => {
    expect(await loadFillTarget("", MORNING)).toStrictEqual({
      kind: "unknown-code",
    });
    expect(await loadFillTarget("a".repeat(500), MORNING)).toStrictEqual({
      kind: "unknown-code",
    });
    expect(await loadFillTarget("../../etc/passwd", MORNING)).toStrictEqual({
      kind: "unknown-code",
    });
  });

  it("живой код без подходящего чек-листа отличается от неизвестного кода", async () => {
    // Станция настоящая, но в 15:00 её утренний чек-лист закрыт: это другое состояние
    // экрана — «сейчас заполнять нечего», а не «наклейка не действует».
    const { code } = await publishedStation();

    expect((await loadFillTarget(code, AFTERNOON)).kind).toBe("no-checklist");
  });
});

describe("проверка версии на принадлежность станции", () => {
  it("отдаёт версию своей станции", async () => {
    const { code, versionId, stationId } = await publishedStation();

    const found = await findStationVersion(code, versionId);

    expect(found?.stationId).toBe(stationId);
    expect(found?.sections).toHaveLength(1);
  });

  it("отдаёт прежнюю версию той же станции: сотрудник заполнял её", async () => {
    // Опора T041: пока сотрудник заполнял, методист опубликовал следующую версию.
    const station = await createStation();
    const checklistId = await createChecklist({ stationId: station.stationId });
    await createDraft(checklistId, sampleSections("первая"));
    const first = await publishVersion(checklistId);
    // Черновик после публикации остаётся на месте — методист правит его дальше.
    await getDb()
      .update(checklistVersions)
      .set({ sections: sampleSections("вторая") })
      .where(
        and(
          eq(checklistVersions.checklistId, checklistId),
          eq(checklistVersions.status, "draft"),
        ),
      );
    await publishVersion(checklistId);

    const found = await findStationVersion(station.stationCode, first.id);

    expect(found?.versionId).toBe(first.id);
  });

  it("не отдаёт версию чужой станции", async () => {
    // Иначе кто угодно с одним живым кодом писал бы заполнения в историю любой станции сети.
    const mine = await publishedStation();
    const other = await publishedStation();

    expect(await findStationVersion(mine.code, other.versionId)).toBeNull();
  });

  it("не отдаёт черновик и мусор вместо идентификатора версии", async () => {
    const { code } = await publishedStation();

    expect(await findStationVersion(code, "не-uuid")).toBeNull();
    expect(
      await findStationVersion(code, "00000000-0000-0000-0000-000000000000"),
    ).toBeNull();
  });
});

/** Утренний и дневной обход поверх него: ровно расстановка боевого пакета. */
async function stationWithTwoOpen(): Promise<{
  code: string;
  morningId: string;
  roundId: string;
}> {
  const station = await createStation();
  const morning = await createChecklist({
    stationId: station.stationId,
    windowStart: "06:00:00",
    windowEnd: "12:00:00",
    title: { ru: "Открытие", en: "Opening" },
  });
  const round = await createChecklist({
    stationId: station.stationId,
    windowStart: "08:00:00",
    windowEnd: "23:00:00",
    title: { ru: "Обход", en: "Round" },
  });
  await createDraft(morning, sampleSections("утро"));
  await publishVersion(morning);
  await createDraft(round, sampleSections("обход"));
  await publishVersion(round);
  return { code: station.stationCode, morningId: morning, roundId: round };
}

describe("на станции открыто несколько чек-листов сразу", () => {
  it("предлагает выбрать, а не открывает первый по началу окна", async () => {
    const { code, morningId, roundId } = await stationWithTwoOpen();

    const target = await loadFillTarget(code, MORNING);

    expect(target.kind).toBe("choice");
    if (target.kind !== "choice") return;
    expect(target.options.map((option) => option.checklistId)).toEqual([
      morningId,
      roundId,
    ]);
    expect(target.options.map((option) => option.window)).toEqual([
      "06:00–12:00",
      "08:00–23:00",
    ]);
  });

  it("выбранный чек-лист открывается сразу", async () => {
    const { code, roundId } = await stationWithTwoOpen();

    const target = await loadFillTarget(code, MORNING, roundId);

    expect(target.kind).toBe("ok");
    if (target.kind !== "ok") return;
    expect(target.checklist.id).toBe(roundId);
  });

  it("чужой чек-лист по коду станции не открыть: снова выбор, а не подстановка", async () => {
    const { code } = await stationWithTwoOpen();
    const other = await stationWithTwoOpen();

    const target = await loadFillTarget(code, MORNING, other.roundId);

    // Молча подставить свой было бы хуже: сотрудник думал бы, что открыл тот.
    expect(target.kind).toBe("choice");
  });

  it("закрывшийся чек-лист из выбора уходит, и оставшийся открывается сразу", async () => {
    const { code, roundId } = await stationWithTwoOpen();

    // В 15:00 утренний закрыт, обход идёт: выбирать больше не из чего.
    const target = await loadFillTarget(code, AFTERNOON);

    expect(target.kind).toBe("ok");
    if (target.kind !== "ok") return;
    expect(target.checklist.id).toBe(roundId);
  });

  it("выбор не рассказывает о станции больше, чем открытый чек-лист", async () => {
    const { code } = await stationWithTwoOpen();

    const target = await loadFillTarget(code, MORNING);

    if (target.kind !== "choice") throw new Error("ожидался выбор");
    // Ни пунктов, ни версий, ни истории: ссылка публичная (D021).
    expect(Object.keys(target.options[0] ?? {})).toEqual([
      "checklistId",
      "title",
      "window",
    ]);
  });
});

/**
 * D122: «отбивки и сервисные сообщения также должны быть на этом языке» — на языке,
 * заведённом у пиццерии. Отбивку «сейчас заполнять нечего» видит человек с настоящей
 * наклейкой на кухне настоящей пиццерии, поэтому её язык обязан доехать до экрана
 * вместе с ответом. Без этого экран знал бы только телефон и написал бы её на нём.
 */
describe("отбивка «заполнять нечего» знает язык своей пиццерии", () => {
  it("язык берётся из страны пиццерии, а не из константы", async () => {
    // Arrange: настоящая станция, чей утренний чек-лист в 15:00 закрыт.
    const station = await createStation();
    const checklistId = await createChecklist({
      stationId: station.stationId,
      windowStart: "06:00:00",
      windowEnd: "12:00:00",
    });
    await createDraft(checklistId, sampleSections("отбивка"));
    await publishVersion(checklistId);

    // Act + Assert: у страны заведён русский — отбивка приедет русской.
    const russian = await loadFillTarget(station.stationCode, AFTERNOON);
    expect(russian).toStrictEqual({
      kind: "no-checklist",
      countryLocale: "ru",
    });

    // Та же станция, у страны сменили язык: ответ обязан смениться вместе с данными.
    await setCountryLocale(station.countryId, "en");
    const english = await loadFillTarget(station.stationCode, AFTERNOON);
    expect(english).toStrictEqual({
      kind: "no-checklist",
      countryLocale: "en",
    });
  });

  it("режим смены, срезавший все пункты, отвечает тем же языком", async () => {
    // Второй путь в ту же отбивку: чек-лист открыт, но в критичном режиме от станции
    // сегодня не ждут ничего. Язык обязан доехать и здесь — иначе одна и та же надпись
    // приходила бы на двух разных языках в зависимости от того, как она получилась.
    const station = await createStation();
    await setCountryLocale(station.countryId, "en");
    const checklistId = await createChecklist({
      stationId: station.stationId,
      windowStart: "06:00:00",
      windowEnd: "12:00:00",
    });
    await createDraft(checklistId, [
      {
        id: "s-soft",
        title: { ru: "Мягкие", en: "Soft" },
        source: "own",
        items: [
          {
            id: "i-soft",
            title: { ru: "Полить цветы", en: "Water the plants" },
            type: "bool",
            severity: "normal",
          },
        ],
      },
    ]);
    await publishVersion(checklistId);
    await setShiftMode({ storeId: station.storeId, mode: "critical" }, MORNING);

    expect(await loadFillTarget(station.stationCode, MORNING)).toStrictEqual({
      kind: "no-checklist",
      countryLocale: "en",
    });
  });
});
