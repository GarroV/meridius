/**
 * Область видимости кабинета (D145, снимает D014). Ядро: отказ, который не сработал,
 * неотличим от успеха — партнёр просто увидит чужую страну, и экран будет выглядеть
 * исправным.
 *
 * Правило одно на весь кабинет: УК видит все страны, партнёр — только свои. Каждое
 * место, которое что-то показывает или меняет, спрашивает отсюда, а не решает само:
 * две копии правила разъехались бы молча.
 */
import type { SQL } from "drizzle-orm";
import { inArray, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

type TenantKind = "hq" | "partner";

/** Кто вошёл. `accountId` — null у учётки УК из окружения площадки (`ADMIN_PASSWORD_HASH`). */
export interface Viewer {
  readonly accountId: string | null;
  readonly login: string;
  readonly tenantId: string;
  readonly tenantKind: TenantKind;
  readonly tenantName: string;
  /** Страны тенанта. У УК не читается: она видит все. */
  readonly countryIds: readonly string[];
}

export type Scope =
  | { readonly kind: "all" }
  | { readonly kind: "countries"; readonly countryIds: ReadonlySet<string> };

export function scopeOf(viewer: Viewer): Scope {
  // «Все страны» у УК — отсутствие фильтра, а не список: список отстал бы от сети на
  // каждую страну, заведённую после входа.
  if (viewer.tenantKind === "hq") return { kind: "all" };
  return { kind: "countries", countryIds: new Set(viewer.countryIds) };
}

/**
 * Видна ли страна. `null` — место, у которого страны нет (чек-лист без станции): партнёру
 * оно не принадлежит ни по одной стране, поэтому не видно.
 */
export function canSeeCountry(scope: Scope, countryId: string | null): boolean {
  if (scope.kind === "all") return true;
  return countryId !== null && scope.countryIds.has(countryId);
}

/** Страны для фильтра запроса: null — фильтра нет (УК), пустой список — не видно ничего. */
export function visibleCountryIds(scope: Scope): readonly string[] | null {
  return scope.kind === "all" ? null : [...scope.countryIds];
}

/**
 * Условие запроса «страна в области видимости» для колонки страны. `undefined` — условия
 * нет (УК). Пустой список стран даёт ЛОЖЬ, а не пропуск условия: `inArray` с пустым
 * списком — ровно то место, где «ничего» молча становится «всё».
 */
export function countryCondition(
  scope: Scope,
  column: AnyPgColumn,
): SQL | undefined {
  const ids = visibleCountryIds(scope);
  if (ids === null) return undefined;
  if (ids.length === 0) return sql`false`;
  return inArray(column, ids);
}

/** Что про чек-лист нужно знать, чтобы решить, чей он. */
export interface ChecklistOwnership {
  readonly tenantId: string;
  readonly isTemplate: boolean;
  /** Страна станции, на которой висит; null — не висит нигде. */
  readonly countryId: string | null;
}

/**
 * Виден ли чек-лист: шаблон виден всем (его берут к себе, D149); свой — всегда, даже без
 * станции; чужой — только если висит на станции своей страны (станция своя, и что на ней
 * висит, человек видеть обязан).
 */
export function canSeeChecklist(
  viewer: Viewer,
  checklist: ChecklistOwnership,
): boolean {
  if (viewer.tenantKind === "hq") return true;
  if (checklist.isTemplate) return true;
  if (checklist.tenantId === viewer.tenantId) return true;
  return canSeeCountry(scopeOf(viewer), checklist.countryId);
}

/** Правится ли чек-лист: шаблон — только УК (D149, §5.2 user-flow), прочее — если виден. */
export function canEditChecklist(
  viewer: Viewer,
  checklist: ChecklistOwnership,
): boolean {
  if (viewer.tenantKind === "hq") return true;
  if (checklist.isTemplate) return false;
  return canSeeChecklist(viewer, checklist);
}

/**
 * Область «вся сеть» — явно, для сида, проверок и команд площадки, где вошедшего нет.
 * Экраны кабинета её не берут: у них область всегда от вошедшего (`scopeOf`).
 */
export const WHOLE_NETWORK: Scope = { kind: "all" };
