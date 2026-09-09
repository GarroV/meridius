// Модель экрана библиотеки: что именно увидит методист. Проверяется на настоящей базе —
// список, выбор открытого блока и последствия правки считаются запросами, а не в разметке.
import { afterAll, describe, expect, test } from "vitest";

import type { Item } from "@/blocks/data";
import { closeTestDb } from "@/blocks/data/testing/db";
import { createStation } from "@/blocks/data/testing/fixtures";
import { createChecklist, saveDraft } from "@/blocks/editor/drafts";
import { publish } from "@/blocks/editor/publish";
import { checklistPath } from "@/blocks/editor/routes";

import { createBlock, saveBlock } from "../blocks";
import { buildLibraryModel, pickText, usageLabel } from "./build-model";

afterAll(closeTestDb);

const MORNING = { start: "06:00", end: "11:00" };

function uniqueTitle(label: string): Record<string, string> {
  return {
    ru: `${label} ${crypto.randomUUID().slice(0, 8)}`,
    en: `${label} en`,
  };
}

function item(label: string): Item {
  return {
    id: crypto.randomUUID(),
    title: { ru: `Пункт ${label}` },
    type: "bool",
    severity: "normal",
  };
}

async function newBlock(label: string, items: Item[]): Promise<string> {
  const title = uniqueTitle(label);
  const blockId = await createBlock(title);
  await saveBlock(blockId, { title, items });
  return blockId;
}

describe("выбор языка", () => {
  test("название берётся на языке интерфейса", () => {
    expect(pickText({ ru: "Холодильники", en: "Refrigerators" }, "en")).toBe(
      "Refrigerators",
    );
  });

  test("нет перевода — берётся первое, что есть: блок мог начаться на другом языке", () => {
    expect(pickText({ ru: "Холодильники" }, "en")).toBe("Холодильники");
    expect(pickText({}, "ru")).toBe("");
  });

  test("подпись ссылки называет и чек-лист, и пиццерию", () => {
    expect(
      usageLabel(
        {
          checklistId: "c1",
          title: { ru: "Открытие кухни" },
          station: "Кухня",
          store: "Алматы",
          draft: true,
          published: false,
        },
        "ru",
      ),
    ).toBe("Открытие кухни · Алматы");
  });

  test("чек-лист без пиццерии называется одним своим названием", () => {
    expect(
      usageLabel(
        {
          checklistId: "c1",
          title: { ru: "Черновик" },
          station: null,
          store: null,
          draft: true,
          published: false,
        },
        "ru",
      ),
    ).toBe("Черновик");
  });
});

describe("модель экрана библиотеки", () => {
  test("открывается блок из адреса, он же помечен выбранным в списке", async () => {
    const wanted = await newBlock("Санитария", [item("санитария")]);

    const model = await buildLibraryModel({ blockId: wanted }, "ru");

    expect(model.selection?.id).toBe(wanted);
    const row = model.blocks.find((block) => block.id === wanted);
    expect(row?.selected).toBe(true);
    expect(row?.itemCount).toBe(1);
    expect(row?.href).toContain(wanted);
  });

  test("блока из адреса больше нет — открывается первый в списке, а не пустота", async () => {
    await newBlock("Первый", [item("первый")]);

    const model = await buildLibraryModel(
      { blockId: "9d3f6f2a-0f1e-4a8b-8c2d-1f2b3c4d5e6f" },
      "ru",
    );

    expect(model.selection).not.toBeNull();
    expect(model.selection?.id).toBe(model.blocks[0]?.id);
  });

  test("«где используется» приходит ссылками в редактор и сводкой правки", async () => {
    const blockId = await newBlock("Холодильники", [item("холод")]);
    const station = await createStation();
    const checklistId = await createChecklist({
      stationId: station.stationId,
      title: uniqueTitle("Открытие кухни"),
      window: MORNING,
    });
    await saveDraft(checklistId, [
      {
        id: crypto.randomUUID(),
        title: { ru: "Холодильники" },
        source: { blockId },
        items: [],
      },
    ]);
    await publish(checklistId);

    const model = await buildLibraryModel({ blockId }, "ru");

    const usage = model.selection?.usages[0];
    expect(model.selection?.usages).toHaveLength(1);
    expect(usage?.checklistId).toBe(checklistId);
    expect(usage?.href).toBe(checklistPath(checklistId));
    expect(usage?.published).toBe(true);
    // Подпись — «название · пиццерия»: одно название не различает пиццерии сети.
    expect(usage?.label).toContain("Открытие кухни");
    expect(usage?.label).toContain(" · ");
    expect(model.selection?.impact).toStrictEqual({
      checklists: 1,
      drafts: 1,
      published: 1,
    });
  });
});
