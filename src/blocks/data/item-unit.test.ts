// Единица измерения числового пункта (D110) доезжает от черновика методиста до
// прочитанного заполнения. Проверка идёт по всему пути на настоящей базе, а не по
// одному месту: единица лежит внутри JSONB, базе о ней знать нечего, и потерять её
// может любой слой, который пересобирает пункт полями вместо того, чтобы нести его
// целиком. Такая потеря молчалива — методист единицу ввёл, сотрудник её не увидел,
// и никакой ошибки нигде нет.
import { afterAll, expect, test } from "vitest";

import {
  getDraft,
  getPublishedVersionForStation,
  publishVersion,
} from "./checklists";
import { getSubmission, saveSubmission } from "./submissions";
import { closeTestDb } from "./testing/db";
import {
  createChecklist,
  createDraft,
  createStation,
} from "./testing/fixtures";
import type { Item, Section } from "./types";

afterAll(closeTestDb);

const UNIT: Item["unit"] = { ru: "°C", en: "°C" };

/** Секция с одним числовым пунктом, у которого задана единица измерения. */
function sectionsWithUnit(): Section[] {
  return [
    {
      id: "section-температура",
      title: { ru: "Температура", en: "Temperature" },
      source: "own",
      items: [
        {
          id: "item-морозильник",
          title: { ru: "Морозильник", en: "Freezer" },
          type: "number",
          severity: "critical",
          min: -22,
          max: -10,
          unit: UNIT,
        },
      ],
    },
  ];
}

/** Единица первого пункта первой секции — то, что должно пережить каждый переход. */
function unitOf(sections: readonly Section[] | undefined): unknown {
  return sections?.[0]?.items[0]?.unit;
}

test("единица измерения доезжает от черновика до прочитанного заполнения", async () => {
  const station = await createStation();
  const checklistId = await createChecklist({
    stationId: station.stationId,
    windowStart: "06:00:00",
    windowEnd: "12:00:00",
  });
  await createDraft(checklistId, sectionsWithUnit());

  const draft = await getDraft(checklistId);
  expect(unitOf(draft?.sections)).toStrictEqual(UNIT);

  const published = await publishVersion(checklistId);
  expect(unitOf(published.sections)).toStrictEqual(UNIT);

  const forStation = await getPublishedVersionForStation(
    station.stationCode,
    new Date(Date.UTC(2026, 8, 6, 9, 0, 0)),
  );
  expect(unitOf(forStation?.version.sections)).toStrictEqual(UNIT);

  const submissionId = await saveSubmission({
    versionId: published.id,
    answers: [{ itemId: "item-морозильник", value: -18, at: Date.now() }],
    startedAt: Date.now(),
    mode: "normal",
  });

  const saved = await getSubmission(submissionId);
  expect(unitOf(saved?.snapshot)).toStrictEqual(UNIT);
});

test("пункт без единицы остаётся без неё, а не получает пустую", async () => {
  // «Без единицы» — обычное состояние пункта (D110): перечня зашитых единиц нет,
  // и пустое значение не должно превращаться в пустую строку, которую экран потом
  // выведет разделителем в никуда.
  const checklistId = await createChecklist();
  const sections = sectionsWithUnit();
  const [section] = sections;
  const [item] = section?.items ?? [];
  if (section === undefined || item === undefined) {
    throw new Error("Заготовка секции пуста");
  }
  const { unit, ...withoutUnit } = item;
  void unit;
  await createDraft(checklistId, [{ ...section, items: [withoutUnit] }]);

  const draft = await getDraft(checklistId);

  expect(draft?.sections[0]?.items[0]).not.toHaveProperty("unit");
});
