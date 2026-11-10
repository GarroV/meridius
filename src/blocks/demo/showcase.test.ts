// Состав контура демо-режима (D193): то, что видят УК и партнёры, не должно протухнуть
// молча. Проверяется описание, а не база: порождённая история — код, и ошибка в нём
// выглядит как правдоподобная, но пустая «Статистика».
import { describe, expect, it } from "vitest";

import { STATION_CODE_ALPHABET, STATION_CODE_LENGTH } from "@/blocks/catalog";
import type { Answer } from "@/blocks/data";
import {
  countFailed,
  countFailedCritical,
  countUnansweredCritical,
} from "@/blocks/data";

import type { DemoAnswer } from "./model";
import { HISTORY_DAYS, showcaseDatasets } from "./showcase";
import { COUNTRY_FREEDONIA_ID, DEMO_ACCOUNTS, DEMO_TENANTS } from "./roles";

const datasets = showcaseDatasets();

function countryName(index: number): string {
  return datasets[index]?.country.name ?? "";
}

describe("контур демо-режима", () => {
  it("три страны и от шести до восьми пиццерий", () => {
    expect(datasets).toHaveLength(3);
    const stores = datasets.flatMap((data) => data.stores);
    expect(stores.length).toBeGreaterThanOrEqual(6);
    expect(stores.length).toBeLessThanOrEqual(8);
    expect(new Set(datasets.map((data) => data.country.id)).size).toBe(3);
  });

  it("все опознаватели и коды станций уникальны, коды — из алфавита наклейки", () => {
    const ids = datasets.flatMap((data) => [
      data.country.id,
      ...data.stores.map((s) => s.id),
      ...data.stations.map((s) => s.id),
      ...data.checklists.flatMap((c) => [
        c.id,
        c.draft.id,
        ...c.versions.map((v) => v.id),
      ]),
      ...(data.templates ?? []).flatMap((t) => [
        t.id,
        t.draft.id,
        ...t.versions.map((v) => v.id),
      ]),
      ...data.submissions.map((s) => s.id),
    ]);
    // Базовые строки Demoland входят в первое описание целиком, повторов нет и среди них.
    expect(new Set(ids).size).toBe(ids.length);

    const codes = datasets.flatMap((data) => data.stations.map((s) => s.code));
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) {
      expect(code).toHaveLength(STATION_CODE_LENGTH);
      for (const char of code) expect(STATION_CODE_ALPHABET).toContain(char);
    }
  });

  it("каждое заполнение ссылается на версию и станцию своего же чек-листа", () => {
    for (const data of datasets) {
      const versionOwner = new Map(
        data.checklists.flatMap((c) =>
          c.versions.map((v) => [v.id, c.stationId] as const),
        ),
      );
      const stationIds = new Set(data.stations.map((s) => s.id));
      for (const submission of data.submissions) {
        expect(versionOwner.get(submission.versionId)).toBe(
          submission.stationId,
        );
        expect(stationIds.has(submission.stationId)).toBe(true);
      }
    }
  });

  it("история — 60 суток назад от дня посева, плотная в каждой стране", () => {
    for (const data of datasets) {
      const days = data.submissions.map((s) => s.daysAgo);
      expect(Math.max(...days)).toBeGreaterThanOrEqual(HISTORY_DAYS - 5);
      expect(Math.min(...days)).toBe(0);
      expect(data.submissions.length).toBeGreaterThan(150);
    }
  });

  it("провалы живые: заметная доля, критичные есть в каждой стране, молчаливые — в сети", () => {
    for (const data of datasets) {
      const sectionsByVersion = new Map(
        data.checklists.flatMap((c) =>
          c.versions.map((v) => [v.id, v.sections] as const),
        ),
      );
      const failing = data.submissions.filter(
        (s) =>
          countFailed(
            [...(sectionsByVersion.get(s.versionId) ?? [])],
            withTime(s.answers),
          ) > 0,
      );
      const share = failing.length / data.submissions.length;
      expect(share).toBeGreaterThan(0.08);
      expect(share).toBeLessThan(0.5);

      const critical = data.submissions.filter((s) => {
        const sections = sectionsByVersion.get(s.versionId) ?? [];
        return countFailedCritical([...sections], withTime(s.answers)) > 0;
      });
      expect(critical.length, countryNameOf(data)).toBeGreaterThan(0);
    }

    const unanswered = datasets
      .flatMap((data) => {
        const sectionsByVersion = new Map(
          data.checklists.flatMap((c) =>
            c.versions.map((v) => [v.id, v.sections] as const),
          ),
        );
        return data.submissions.filter(
          (s) =>
            countUnansweredCritical(
              [...(sectionsByVersion.get(s.versionId) ?? [])],
              withTime(s.answers),
            ) > 0,
        );
      })
      .map((s) => s.id);
    expect(unanswered.length).toBeGreaterThan(0);
  });

  it("порождается детерминированно: два вызова дают то же описание", () => {
    expect(JSON.stringify(showcaseDatasets())).toBe(JSON.stringify(datasets));
  });

  it("шаблоны УК есть, на станциях не висят", () => {
    const templates = datasets.flatMap((data) => data.templates ?? []);
    expect(templates.length).toBeGreaterThanOrEqual(2);
    for (const template of templates) {
      expect(template.versions.some((v) => v.status === "published")).toBe(
        true,
      );
    }
  });

  it("партнёры получают свои страны и свои чек-листы, а УК — прежнюю Demoland", () => {
    expect(DEMO_TENANTS).toHaveLength(2);
    for (const tenant of DEMO_TENANTS) {
      const own = datasets.filter((data) =>
        tenant.countryIds.includes(data.country.id),
      );
      expect(own).toHaveLength(1);
      expect(own[0]?.checklists.every((c) => c.tenantId === tenant.id)).toBe(
        true,
      );
      expect(own[0]?.accounts?.map((a) => a.tenantId)).toEqual([tenant.id]);
    }
    expect(DEMO_TENANTS[0]?.countryIds).toEqual([COUNTRY_FREEDONIA_ID]);
    // Учётка УК — в первом описании, у партнёров свои: тенант заводится раньше учётки.
    expect(datasets[0]?.accounts?.map((a) => a.tenantId)).toEqual([undefined]);
    expect(countryName(0)).toBe("Demoland");
    expect(DEMO_ACCOUNTS).toHaveLength(3);
  });
});

function countryNameOf(data: { country: { name: string } }): string {
  return `страна ${data.country.name}`;
}

/** Ответы без момента: счётчики блока data принимают `Answer` с `at`, которого описанию не нужно. */
function withTime(answers: readonly DemoAnswer[]): Answer[] {
  return answers.map((answer) => ({ ...answer, at: 0 }));
}
