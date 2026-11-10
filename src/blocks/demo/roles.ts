// Роли демо-режима (D193): кого можно «надеть» на экране `/demo`.
//
// Опознаватели учёток и тенантов постоянны: сессия лежит в куке по номеру учётки, и
// часовой пересев не должен её обрывать (см. `insertTenants` в seed.ts). Пароля у этих
// учёток нет — войти ими можно только отсюда, а в самом демо-режиме вход паролем закрыт.
import type { DemoAccount, DemoTenant } from "./model";

/** Страны демо-режима. Первая — прежняя Demoland из `dataset.ts`, две остальные заводит `showcase.ts`. */
export const COUNTRY_DEMOLAND_ID = "d0000000-0000-4000-8000-000000000001";
export const COUNTRY_FREEDONIA_ID = "e0000000-0000-4000-8000-000000000002";
export const COUNTRY_RURITANIA_ID = "e0000000-0000-4000-8000-000000000003";

export const TENANT_FREEDONIA_ID = "d9000000-0000-4000-8000-000000000001";
export const TENANT_RURITANIA_ID = "d9000000-0000-4000-8000-000000000002";

const ACCOUNT_HQ_ID = "d8000000-0000-4000-8000-000000000001";
const ACCOUNT_SUNRISE_ID = "d8000000-0000-4000-8000-000000000002";
const ACCOUNT_LAKESIDE_ID = "d8000000-0000-4000-8000-000000000003";

const PARTNER_SUNRISE = "Sunrise Pizza Partners";
const PARTNER_LAKESIDE = "Lakeside Pizza Group";

export const DEMO_TENANTS: readonly DemoTenant[] = [
  {
    id: TENANT_FREEDONIA_ID,
    name: PARTNER_SUNRISE,
    countryIds: [COUNTRY_FREEDONIA_ID],
  },
  {
    id: TENANT_RURITANIA_ID,
    name: PARTNER_LAKESIDE,
    countryIds: [COUNTRY_RURITANIA_ID],
  },
];

export const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  { id: ACCOUNT_HQ_ID, login: "demo-hq" },
  {
    id: ACCOUNT_SUNRISE_ID,
    login: "demo-partner-sunrise",
    tenantId: TENANT_FREEDONIA_ID,
  },
  {
    id: ACCOUNT_LAKESIDE_ID,
    login: "demo-partner-lakeside",
    tenantId: TENANT_RURITANIA_ID,
  },
];

/** Роль на экране выбора: ключ уходит в форму, остальное — подпись и кого входить. */
export interface DemoRole {
  readonly key: "hq" | "partner-sunrise" | "partner-lakeside";
  readonly kind: "hq" | "partner";
  readonly accountId: string;
  /** Название партнёра для подписи карточки; у УК нет. */
  readonly partnerName?: string;
}

export const DEMO_ROLES: readonly DemoRole[] = [
  {
    key: "hq",
    kind: "hq",
    accountId: ACCOUNT_HQ_ID,
  },
  {
    key: "partner-sunrise",
    kind: "partner",
    accountId: ACCOUNT_SUNRISE_ID,
    partnerName: PARTNER_SUNRISE,
  },
  {
    key: "partner-lakeside",
    kind: "partner",
    accountId: ACCOUNT_LAKESIDE_ID,
    partnerName: PARTNER_LAKESIDE,
  },
];

/** Роль по ключу из формы. Чужой ключ — `undefined`: форма приходит из браузера. */
export function findDemoRole(key: unknown): DemoRole | undefined {
  return DEMO_ROLES.find((role) => role.key === key);
}

/** Станция, на которую ведёт карточка «Кухня»: Kitchen центральной пиццерии, у неё открыт чек-лист в любой час. */
export const KITCHEN_STATION_CODE = "dmcskt2394";
