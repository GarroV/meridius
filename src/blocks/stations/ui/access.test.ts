// Действия карточки станции под партнёром (D145): чужая станция из формы отвечает как
// несуществующая, и в базе ничего не меняется. Форма серверного действия — это
// обычный POST: сквозной сценарий через кнопки этого не проверит, кнопок чужой станции
// у партнёра просто нет, а подставить id в тело запроса ничего не стоит.
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { Viewer } from "@/blocks/auth/scope";
import { partnerViewer } from "@/blocks/auth/testing/viewers";
import { checklists, getDb, stations } from "@/blocks/data";
import {
  createChecklist,
  createStation,
  type StationFixture,
} from "@/blocks/data/testing/fixtures";

const state = vi.hoisted(() => ({ viewer: null as Viewer | null }));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`NEXT_REDIRECT ${path}`);
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/blocks/auth/guard", () => ({
  requireAdmin: () => {
    if (state.viewer === null) throw new Error("вошедший не задан");
    return Promise.resolve(state.viewer);
  },
}));

const {
  submitAssignChecklist,
  submitCopyToStations,
  submitDetachChecklist,
  submitReissueCode,
} = await import("./actions");

function form(entries: readonly (readonly [string, string])[]): FormData {
  const data = new FormData();
  for (const [key, value] of entries) data.append(key, value);
  return data;
}

async function codeOf(stationId: string): Promise<string | undefined> {
  const [row] = await getDb()
    .select({ code: stations.code })
    .from(stations)
    .where(eq(stations.id, stationId));
  return row?.code;
}

async function stationOfChecklist(id: string): Promise<string | null> {
  const [row] = await getDb()
    .select({ stationId: checklists.stationId })
    .from(checklists)
    .where(eq(checklists.id, id));
  return row?.stationId ?? null;
}

async function checklistsOn(stationId: string): Promise<number> {
  const rows = await getDb()
    .select({ id: checklists.id })
    .from(checklists)
    .where(eq(checklists.stationId, stationId));
  return rows.length;
}

async function world(): Promise<{
  mine: StationFixture;
  theirs: StationFixture;
  viewer: Viewer;
}> {
  const mine = await createStation();
  const theirs = await createStation();
  const viewer = await partnerViewer([mine.countryId]);
  state.viewer = viewer;
  return { mine, theirs, viewer };
}

afterEach(() => {
  state.viewer = null;
});

describe("действия карточки станции под партнёром (D145)", () => {
  test("перевыпуск кода чужой станции — «нет такой», код прежний; своей — перевыпущен", async () => {
    const { mine, theirs } = await world();

    await expect(
      submitReissueCode(
        form([
          ["stationId", theirs.stationId],
          ["confirmed", "1"],
        ]),
      ),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(await codeOf(theirs.stationId)).toBe(theirs.stationCode);

    await expect(
      submitReissueCode(
        form([
          ["stationId", mine.stationId],
          ["confirmed", "1"],
        ]),
      ),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(await codeOf(mine.stationId)).not.toBe(mine.stationCode);
  });

  test("свой чек-лист на чужую станцию не вешается", async () => {
    const { theirs, viewer } = await world();
    const own = await createChecklist({ tenantId: viewer.tenantId });

    await expect(
      submitAssignChecklist(
        form([
          ["stationId", theirs.stationId],
          ["checklistId", own],
        ]),
      ),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(await stationOfChecklist(own)).toBeNull();
  });

  test("чужой чек-лист с чужой станции не снимается", async () => {
    const { theirs } = await world();
    const foreign = await createChecklist({ stationId: theirs.stationId });

    await expect(
      submitDetachChecklist(
        form([
          ["stationId", theirs.stationId],
          ["checklistId", foreign],
        ]),
      ),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(await stationOfChecklist(foreign)).toBe(theirs.stationId);
  });

  test("раскатка шаблона с чужой станцией в списке — отказ целиком, своя тоже не тронута", async () => {
    const { mine, theirs } = await world();
    const template = await createChecklist({ isTemplate: true });

    await expect(
      submitCopyToStations(
        form([
          ["templateId", template],
          ["stationIds", mine.stationId],
          ["stationIds", theirs.stationId],
        ]),
      ),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(await checklistsOn(mine.stationId)).toBe(0);
    expect(await checklistsOn(theirs.stationId)).toBe(0);
  });
});
