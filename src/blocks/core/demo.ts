// Контракт открытого демо (D194): роли, их логины и адрес входа. Один факт на две стороны.
//
// Здесь, в `core`, потому что его читают сразу двое, и между ними нет прямой связи: сид
// учёток (`auth/demo-accounts.ts`) заводит по учётке на роль, а вход `/demo`
// (`auth/demo-entry.ts`) открывает сессию выбранной. Блок `demo` — сид контура — на `auth`
// не ссылается, а `auth` на `demo`. Логины, записанные дважды, разойдутся молча: сид
// заведёт `demo-hq`, а вход будет искать `demo_hq`, и демо ответит «готовится» вечно.
//
// Вход без пароля включается ТОЛЬКО переменной `DEMO_MODE=1` (`auth/config.ts`). Без неё
// маршрутов `/demo*` нет вовсе: 404, как на любой несуществующий адрес.

/** Корень открытого входа: страница выбора роли и `POST /demo/<ключ роли>`. */
export const DEMO_PATH = "/demo";

/** Страна демо-контура. Название то же, что в сиде контура (`demo/dataset.ts`); стережёт тест. */
export const DEMO_COUNTRY_NAME = "Demoland";

/** Тенант партнёра демо: привязан к стране Demoland (D145, D169). */
export const DEMO_PARTNER_TENANT_NAME = "Demoland Partner";

export type DemoRoleKey = "hq" | "partner";

export interface DemoRole {
  /** Ключ в адресе `/demo/<ключ>` и в словаре (`demo.roles.<ключ>`). */
  readonly key: DemoRoleKey;
  readonly login: string;
  /** hq — управляющая компания, видит всю сеть; partner — свой тенант со страной Demoland. */
  readonly tenant: "hq" | "partner";
}

/**
 * В порядке показа на экране выбора роли. Логин `admin` занят учёткой УК из окружения
 * площадки и в базе запрещён; её демо не использует.
 */
export const DEMO_ROLES: readonly DemoRole[] = [
  { key: "hq", login: "demo-hq", tenant: "hq" },
  { key: "partner", login: "demo-partner", tenant: "partner" },
];

/** Роль по ключу из адреса; чужой ключ — `undefined`. */
export function demoRole(key: string): DemoRole | undefined {
  return DEMO_ROLES.find((role) => role.key === key);
}
