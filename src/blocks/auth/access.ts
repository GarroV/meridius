/**
 * Доступ к одной записи по её идентификатору (D145). Ядро: идентификатор приходит снаружи
 * — из адреса, из поля формы, — и чужой идентификатор, пропущенный здесь, отдаёт чужую
 * страну при исправно работающем экране.
 *
 * Отказ — `notFound()`, то есть тот же ответ, что и на несуществующую запись: партнёр не
 * должен по кодам ответа узнавать, какие станции и чек-листы в сети есть у других.
 *
 * Списки фильтруются не здесь, а условием `countryCondition` в самом запросе списка:
 * отбирать чужое после выборки — значит всё равно его выбрать.
 */
import { eq, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";

import {
  checklists,
  devices,
  getDb,
  stations,
  stores,
  submissions,
} from "@/blocks/data";

import {
  canEditChecklist,
  canSeeChecklist,
  canSeeCountry,
  scopeOf,
  type ChecklistOwnership,
  type Viewer,
} from "./scope";

const UUID_SHAPE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Идентификатор не того вида в базу не ходит: `uuid` в запросе с мусором — пятисотка. */
function isId(value: string): boolean {
  return UUID_SHAPE.test(value);
}

/**
 * Страна записи; `undefined` — записи нет. У чек-листа без станции страны нет (null),
 * у остальных она есть всегда.
 */
async function countryOfStation(id: string): Promise<string | undefined> {
  if (!isId(id)) return undefined;
  const [row] = await getDb()
    .select({ countryId: stores.countryId })
    .from(stations)
    .innerJoin(stores, eq(stores.id, stations.storeId))
    .where(eq(stations.id, id));
  return row?.countryId;
}

async function countryOfStore(id: string): Promise<string | undefined> {
  if (!isId(id)) return undefined;
  const [row] = await getDb()
    .select({ countryId: stores.countryId })
    .from(stores)
    .where(eq(stores.id, id));
  return row?.countryId;
}

async function countryOfSubmission(id: string): Promise<string | undefined> {
  if (!isId(id)) return undefined;
  const [row] = await getDb()
    .select({ countryId: stores.countryId })
    .from(submissions)
    .innerJoin(stations, eq(stations.id, submissions.stationId))
    .innerJoin(stores, eq(stores.id, stations.storeId))
    .where(eq(submissions.id, id));
  return row?.countryId;
}

async function countryOfDevice(id: string): Promise<string | undefined> {
  if (!isId(id)) return undefined;
  const [row] = await getDb()
    .select({ countryId: stores.countryId })
    .from(devices)
    .innerJoin(stations, eq(stations.id, devices.stationId))
    .innerJoin(stores, eq(stores.id, stations.storeId))
    .where(eq(devices.id, id));
  return row?.countryId;
}

/** Чей чек-лист; null — такого нет. */
async function checklistOwnership(
  id: string,
): Promise<ChecklistOwnership | null> {
  if (!isId(id)) return null;
  const [row] = await getDb()
    .select({
      tenantId: checklists.tenantId,
      isTemplate: checklists.isTemplate,
      countryId: stores.countryId,
    })
    .from(checklists)
    .leftJoin(stations, eq(stations.id, checklists.stationId))
    .leftJoin(stores, eq(stores.id, stations.storeId))
    .where(eq(checklists.id, id));
  return row ?? null;
}

type Kind = "station" | "store" | "submission" | "device";

const COUNTRY_OF: Record<Kind, (id: string) => Promise<string | undefined>> = {
  station: countryOfStation,
  store: countryOfStore,
  submission: countryOfSubmission,
  device: countryOfDevice,
};

/** Видна ли запись. Несуществующая не видна никому. */
export async function canSee(
  viewer: Viewer,
  kind: Kind,
  id: string,
): Promise<boolean> {
  const countryId = await COUNTRY_OF[kind](id);
  return countryId !== undefined && canSeeCountry(scopeOf(viewer), countryId);
}

/** Требует, чтобы запись была видна; иначе — «такой нет». */
export async function requireVisible(
  viewer: Viewer,
  kind: Kind,
  id: string,
): Promise<void> {
  if (!(await canSee(viewer, kind, id))) notFound();
}

/** Видна ли страна по идентификатору (фильтр адреса, поле формы). */
export function requireCountry(viewer: Viewer, countryId: string): void {
  if (!canSeeCountry(scopeOf(viewer), countryId)) notFound();
}

/**
 * Все ли станции видны. Одна чужая в списке — отказ целиком, а не молчаливый отсев:
 * отсев превратил бы подделанную форму в «успех на части станций».
 */
export async function requireStations(
  viewer: Viewer,
  stationIds: readonly string[],
): Promise<void> {
  if (stationIds.length === 0) return;
  if (!stationIds.every(isId)) notFound();
  const unique = [...new Set(stationIds)];
  const rows = await getDb()
    .select({ countryId: stores.countryId })
    .from(stations)
    .innerJoin(stores, eq(stores.id, stations.storeId))
    .where(inArray(stations.id, unique));
  const scope = scopeOf(viewer);
  if (
    rows.length !== unique.length ||
    !rows.every((row) => canSeeCountry(scope, row.countryId))
  ) {
    notFound();
  }
}

/** Требует, чтобы чек-лист был виден (открыть, посмотреть, взять копию). */
export async function requireChecklistVisible(
  viewer: Viewer,
  checklistId: string,
): Promise<ChecklistOwnership> {
  const ownership = await checklistOwnership(checklistId);
  if (ownership === null || !canSeeChecklist(viewer, ownership)) notFound();
  return ownership;
}

/** Требует, чтобы чек-лист можно было править (сохранить, опубликовать, удалить). */
export async function requireChecklistEditable(
  viewer: Viewer,
  checklistId: string,
): Promise<ChecklistOwnership> {
  const ownership = await requireChecklistVisible(viewer, checklistId);
  if (!canEditChecklist(viewer, ownership)) notFound();
  return ownership;
}

/**
 * Требует учётку УК — для того, что меняет саму сеть (страны) или общее для всех
 * (шаблоны). Партнёру — «такого нет», как и на любой чужой адрес.
 */
export function requireHqViewer(viewer: Viewer): void {
  if (viewer.tenantKind !== "hq") notFound();
}
