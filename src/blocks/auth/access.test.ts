// Доступ к одной записи по идентификатору — на настоящей базе: весь смысл в том, по
// какой цепочке таблиц запись приводится к стране.
import { randomUUID } from "node:crypto";

import { describe, expect, test, vi } from "vitest";

import { devices, getDb, submissions, tenants } from "@/blocks/data";
import {
  createChecklist,
  createPublishedVersion,
  createStation,
  hqTenant,
} from "@/blocks/data/testing/fixtures";

import {
  canSee,
  requireChecklistEditable,
  requireChecklistVisible,
  requireCountry,
  requireStations,
  requireVisible,
} from "./access";
import type { Viewer } from "./scope";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

async function partnerTenant(): Promise<string> {
  const [row] = await getDb()
    .insert(tenants)
    .values({ kind: "partner", name: `Партнёр ${randomUUID().slice(0, 8)}` })
    .returning({ id: tenants.id });
  if (row === undefined) throw new Error("тенант не вставился");
  return row.id;
}

function partner(tenantId: string, countryIds: readonly string[]): Viewer {
  return {
    accountId: randomUUID(),
    login: "partner",
    tenantId,
    tenantKind: "partner",
    tenantName: "Партнёр",
    countryIds,
  };
}

async function hq(): Promise<Viewer> {
  return {
    accountId: null,
    login: "admin",
    tenantId: await hqTenant(),
    tenantKind: "hq",
    tenantName: "УК",
    countryIds: [],
  };
}

async function submissionAt(stationId: string): Promise<string> {
  const checklistId = await createChecklist({ stationId });
  const versionId = await createPublishedVersion(checklistId, []);
  const [row] = await getDb()
    .insert(submissions)
    .values({
      versionId,
      stationId,
      snapshot: [],
      answers: [],
      startedAt: new Date(),
    })
    .returning({ id: submissions.id });
  if (row === undefined) throw new Error("заполнение не вставилось");
  return row.id;
}

describe("запись по идентификатору", () => {
  test("станция, пиццерия, заполнение и планшет своей страны видны, чужой — нет", async () => {
    const mine = await createStation();
    const theirs = await createStation();
    const viewer = partner(await partnerTenant(), [mine.countryId]);

    const mySubmission = await submissionAt(mine.stationId);
    const theirSubmission = await submissionAt(theirs.stationId);
    const [myDevice, theirDevice] = await getDb()
      .insert(devices)
      .values([{ stationId: mine.stationId }, { stationId: theirs.stationId }])
      .returning({ id: devices.id });

    expect(await canSee(viewer, "station", mine.stationId)).toBe(true);
    expect(await canSee(viewer, "station", theirs.stationId)).toBe(false);
    expect(await canSee(viewer, "store", mine.storeId)).toBe(true);
    expect(await canSee(viewer, "store", theirs.storeId)).toBe(false);
    expect(await canSee(viewer, "submission", mySubmission)).toBe(true);
    expect(await canSee(viewer, "submission", theirSubmission)).toBe(false);
    expect(await canSee(viewer, "device", myDevice?.id ?? "")).toBe(true);
    expect(await canSee(viewer, "device", theirDevice?.id ?? "")).toBe(false);
  });

  test("УК видит любую запись; несуществующую и мусор — никто", async () => {
    const station = await createStation();
    const viewer = await hq();

    expect(await canSee(viewer, "station", station.stationId)).toBe(true);
    expect(await canSee(viewer, "station", randomUUID())).toBe(false);
    expect(await canSee(viewer, "station", "не-uuid")).toBe(false);
  });

  test("чужая запись отвечает тем же, что и несуществующая", async () => {
    const theirs = await createStation();
    const viewer = partner(await partnerTenant(), []);

    await expect(
      requireVisible(viewer, "station", theirs.stationId),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(
      requireVisible(viewer, "station", randomUUID()),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  test("страна из адреса проверяется по области", async () => {
    const mine = await createStation();
    const theirs = await createStation();
    const viewer = partner(await partnerTenant(), [mine.countryId]);

    expect(() => {
      requireCountry(viewer, mine.countryId);
    }).not.toThrow();
    expect(() => {
      requireCountry(viewer, theirs.countryId);
    }).toThrow("NEXT_NOT_FOUND");
  });
});

describe("список станций из формы", () => {
  test("одна чужая станция в списке — отказ целиком", async () => {
    const mine = await createStation();
    const theirs = await createStation();
    const viewer = partner(await partnerTenant(), [mine.countryId]);

    await expect(
      requireStations(viewer, [mine.stationId]),
    ).resolves.toBeUndefined();
    await expect(
      requireStations(viewer, [mine.stationId, theirs.stationId]),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(
      requireStations(viewer, [mine.stationId, randomUUID()]),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  test("повтор своей станции в списке — не отказ", async () => {
    const mine = await createStation();
    const viewer = partner(await partnerTenant(), [mine.countryId]);
    await expect(
      requireStations(viewer, [mine.stationId, mine.stationId]),
    ).resolves.toBeUndefined();
  });
});

describe("чек-лист", () => {
  test("свой без станции виден и правится; чужой без станции не виден", async () => {
    const tenantId = await partnerTenant();
    const viewer = partner(tenantId, []);
    const own = await createChecklist({ tenantId });
    const foreign = await createChecklist({ tenantId: await partnerTenant() });

    await expect(requireChecklistEditable(viewer, own)).resolves.toBeDefined();
    await expect(requireChecklistVisible(viewer, foreign)).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });

  test("чек-лист УК на станции своей страны виден партнёру", async () => {
    const mine = await createStation();
    const viewer = partner(await partnerTenant(), [mine.countryId]);
    const checklistId = await createChecklist({ stationId: mine.stationId });

    await expect(
      requireChecklistVisible(viewer, checklistId),
    ).resolves.toMatchObject({ countryId: mine.countryId });
  });

  test("шаблон виден партнёру, но не правится им", async () => {
    const viewer = partner(await partnerTenant(), []);
    const template = await createChecklist({ isTemplate: true });

    await expect(
      requireChecklistVisible(viewer, template),
    ).resolves.toBeDefined();
    await expect(requireChecklistEditable(viewer, template)).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    await expect(
      requireChecklistEditable(await hq(), template),
    ).resolves.toBeDefined();
  });
});
