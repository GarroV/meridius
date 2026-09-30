import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, test } from "vitest";

import { stores } from "@/blocks/data";

import {
  canEditChecklist,
  canSeeChecklist,
  canSeeCountry,
  countryCondition,
  scopeOf,
  visibleCountryIds,
  type Viewer,
} from "./scope";

const RUSSIA = "11111111-1111-4111-8111-111111111111";
const KAZAKHSTAN = "22222222-2222-4222-8222-222222222222";
const SERBIA = "33333333-3333-4333-8333-333333333333";

const HQ_TENANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PARTNER_TENANT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OTHER_PARTNER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const hq: Viewer = {
  accountId: null,
  login: "admin",
  tenantId: HQ_TENANT,
  tenantKind: "hq",
  tenantName: "УК",
  countryIds: [],
};

const partner: Viewer = {
  accountId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  login: "kz-partner",
  tenantId: PARTNER_TENANT,
  tenantKind: "partner",
  tenantName: "Казахстан",
  countryIds: [KAZAKHSTAN],
};

const emptyPartner: Viewer = { ...partner, countryIds: [] };

describe("область видимости", () => {
  test("УК видит любую страну, в том числе заведённую после входа", () => {
    expect(canSeeCountry(scopeOf(hq), RUSSIA)).toBe(true);
    expect(canSeeCountry(scopeOf(hq), SERBIA)).toBe(true);
  });

  test("партнёр видит только свои страны", () => {
    const scope = scopeOf(partner);
    expect(canSeeCountry(scope, KAZAKHSTAN)).toBe(true);
    expect(canSeeCountry(scope, RUSSIA)).toBe(false);
  });

  test("партнёр без стран не видит ни одной — а не все", () => {
    const scope = scopeOf(emptyPartner);
    expect(canSeeCountry(scope, KAZAKHSTAN)).toBe(false);
    expect(visibleCountryIds(scope)).toEqual([]);
  });

  test("у УК список стран не задан: фильтра нет, а не пустой список", () => {
    expect(visibleCountryIds(scopeOf(hq))).toBeNull();
  });

  test("страны УК из списка не сужают её область: УК видит все", () => {
    const narrowedHq: Viewer = { ...hq, countryIds: [RUSSIA] };
    expect(canSeeCountry(scopeOf(narrowedHq), SERBIA)).toBe(true);
  });

  test("неизвестная страна (null) не видна партнёру и видна УК", () => {
    expect(canSeeCountry(scopeOf(partner), null)).toBe(false);
    expect(canSeeCountry(scopeOf(hq), null)).toBe(true);
  });
});

describe("чек-лист в области видимости", () => {
  const own = {
    tenantId: PARTNER_TENANT,
    isTemplate: false,
    countryId: null,
  };
  const foreignOnMyStation = {
    tenantId: HQ_TENANT,
    isTemplate: false,
    countryId: KAZAKHSTAN,
  };
  const foreignElsewhere = {
    tenantId: OTHER_PARTNER,
    isTemplate: false,
    countryId: RUSSIA,
  };
  const foreignUnassigned = {
    tenantId: OTHER_PARTNER,
    isTemplate: false,
    countryId: null,
  };
  const template = { tenantId: HQ_TENANT, isTemplate: true, countryId: null };

  test("свой чек-лист виден и правится, даже без станции", () => {
    expect(canSeeChecklist(partner, own)).toBe(true);
    expect(canEditChecklist(partner, own)).toBe(true);
  });

  test("чужой чек-лист на станции своей страны виден и правится: станция своя", () => {
    expect(canSeeChecklist(partner, foreignOnMyStation)).toBe(true);
    expect(canEditChecklist(partner, foreignOnMyStation)).toBe(true);
  });

  test("чужой чек-лист в чужой стране не виден и не правится", () => {
    expect(canSeeChecklist(partner, foreignElsewhere)).toBe(false);
    expect(canEditChecklist(partner, foreignElsewhere)).toBe(false);
  });

  test("чужой чек-лист без станции не виден: он не лежит ни в одной своей стране", () => {
    expect(canSeeChecklist(partner, foreignUnassigned)).toBe(false);
  });

  test("шаблон виден партнёру, но правит его только УК (D149)", () => {
    expect(canSeeChecklist(partner, template)).toBe(true);
    expect(canEditChecklist(partner, template)).toBe(false);
    expect(canEditChecklist(hq, template)).toBe(true);
  });

  test("УК видит и правит любой чек-лист", () => {
    expect(canSeeChecklist(hq, foreignElsewhere)).toBe(true);
    expect(canEditChecklist(hq, foreignUnassigned)).toBe(true);
  });
});

describe("условие запроса по стране", () => {
  const dialect = new PgDialect();
  const render = (condition: ReturnType<typeof countryCondition>) =>
    condition === undefined ? undefined : dialect.sqlToQuery(condition);

  test("у УК условия нет вовсе", () => {
    expect(countryCondition(scopeOf(hq), stores.countryId)).toBeUndefined();
  });

  test("у партнёра — его страны и только они", () => {
    const query = render(countryCondition(scopeOf(partner), stores.countryId));
    expect(query?.sql).toContain('"country_id" in');
    expect(query?.params).toEqual([KAZAKHSTAN]);
  });

  test("партнёр без стран получает ложь, а не пропуск условия", () => {
    const query = render(
      countryCondition(scopeOf(emptyPartner), stores.countryId),
    );
    expect(query?.sql).toBe("false");
  });
});
