// Слой доступа к заполнениям: сохранение и чтение истории (лента и карточка).
// Снимок пунктов и станция фиксируются в момент заполнения (принцип 3, D002) —
// правка чек-листа или перенос его на другую станцию не должны переписывать
// историю задним числом.
import { and, desc, eq, gte, lte } from "drizzle-orm";
import type { SQL } from "drizzle-orm";

import type { Database } from "./client";
import { getDb } from "./client";
import { countFailed, countFailedCritical, flattenItems } from "./grading";
import { isItemInMode } from "./severity";
import {
  checklistVersions,
  checklists,
  countries,
  stations,
  stores,
  submissions,
} from "./schema";
import type { Answer, LocalizedText, Section, ShiftMode } from "./types";

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

// Формат uuid проверяется до похода в базу: иначе некорректная строка доходит
// до драйвера и падает кодом 22P02 (проверено на этой базе), а по контракту
// getSubmission обязан вернуть null, а не бросить исключение.
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface SaveSubmissionInput {
  versionId: string;
  answers: Answer[];
  startedAt: number;
  /**
   * Режим смены, действовавший в момент отправки (D055). Читается на сервере, а не
   * приходит из браузера: заполнение обязано помнить, при каком режиме его собирали,
   * а вечерняя перестановка режима не имеет права переписать утреннюю историю.
   */
  mode: ShiftMode;
}

export interface SubmissionFilter {
  countryId?: string;
  storeId?: string;
  stationId?: string;
  from?: Date;
  to?: Date;
  limit?: number;
}

export interface SubmissionRow {
  id: string;
  submittedAt: Date;
  startedAt: Date;
  durationMs: number;
  countryId: string;
  countryName: string;
  storeId: string;
  storeName: string;
  stationId: string;
  stationName: string;
  checklistId: string;
  checklistTitle: LocalizedText;
  versionId: string;
  versionNumber: number | null;
  itemCount: number;
  answeredCount: number;
  /** Провалено всего — критичных и остальных вместе: столбец «Результат» ленты. */
  failedCount: number;
  failedCriticalCount: number;
  /** Режим смены, в котором заполняли: лента обязана показывать сокращённый прогон. */
  mode: ShiftMode;
}

export interface SubmissionDetail extends SubmissionRow {
  snapshot: Section[];
  answers: Answer[];
}

// Общий набор колонок ленты и карточки: и `listSubmissions`, и `getSubmission`
// собирают одну и ту же историю через один и тот же набор джойнов, иначе они
// рано или поздно разойдутся в том, что считается заполнением.
const SUBMISSION_COLUMNS = {
  id: submissions.id,
  submittedAt: submissions.submittedAt,
  startedAt: submissions.startedAt,
  countryId: countries.id,
  countryName: countries.name,
  storeId: stores.id,
  storeName: stores.name,
  stationId: stations.id,
  stationName: stations.name,
  checklistId: checklists.id,
  checklistTitle: checklists.title,
  versionId: checklistVersions.id,
  versionNumber: checklistVersions.versionNumber,
  // Снимок берётся из самого заполнения, а не из версии: это вторая опора истории
  // (D002). Читать пункты из версии значило бы, что снимок хранится зря и любая
  // правка версии мимо слоя доступа переписывает то, что видел сотрудник.
  snapshot: submissions.snapshot,
  answers: submissions.answers,
  mode: submissions.mode,
};

function submissionsBaseQuery(db: Database) {
  return db
    .select(SUBMISSION_COLUMNS)
    .from(submissions)
    .innerJoin(
      checklistVersions,
      eq(submissions.versionId, checklistVersions.id),
    )
    .innerJoin(checklists, eq(checklistVersions.checklistId, checklists.id))
    .innerJoin(stations, eq(submissions.stationId, stations.id))
    .innerJoin(stores, eq(stations.storeId, stores.id))
    .innerJoin(countries, eq(stores.countryId, countries.id));
}

type SubmissionQueryRow = Awaited<
  ReturnType<typeof submissionsBaseQuery>
>[number];

function toSubmissionRow(row: SubmissionQueryRow): SubmissionRow {
  return {
    id: row.id,
    submittedAt: row.submittedAt,
    startedAt: row.startedAt,
    // Не меньше нуля: часы устройства сотрудника не синхронизированы с сервером,
    // и не должны показывать отрицательную длительность заполнения.
    durationMs: Math.max(
      0,
      row.submittedAt.getTime() - row.startedAt.getTime(),
    ),
    countryId: row.countryId,
    countryName: row.countryName,
    storeId: row.storeId,
    storeName: row.storeName,
    stationId: row.stationId,
    stationName: row.stationName,
    checklistId: row.checklistId,
    checklistTitle: row.checklistTitle,
    versionId: row.versionId,
    versionNumber: row.versionNumber,
    // Считаются только пункты, которых в этом режиме смены ждали. Полный снимок
    // хранится целиком намеренно (факт сокращения не должен стираться), но счёт по
    // нему соврал бы: в критичную смену лента показывала бы «не отвечено 2» там,
    // где эти два пункта у сотрудника даже не спрашивали.
    itemCount: flattenItems(row.snapshot).filter((item) =>
      isItemInMode(item, row.mode),
    ).length,
    answeredCount: row.answers.length,
    // Оба счёта провалов считаются здесь, по уже прочитанным снимку и ответам.
    // Отдавать наружу только критичные значило заставлять экран дочитывать
    // остальные вторым запросом и заводить второе место, где живёт правило
    // провала: строка ленты обязана быть самодостаточной (T100).
    failedCount: countFailed(row.snapshot, row.answers),
    failedCriticalCount: countFailedCritical(row.snapshot, row.answers),
    mode: row.mode,
  };
}

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/**
 * Лимит по умолчанию 200, значение выше 500 обрезается до 500 (контракт).
 * Ноль и отрицательное значение поднимаются до одной строки: `limit -1` в SQL —
 * ошибка драйвера, а лента не должна падать из-за опечатки в фильтре.
 */
function clampLimit(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_LIMIT;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_LIMIT);
}

function buildFilterConditions(filter: SubmissionFilter): SQL[] {
  const conditions: SQL[] = [];
  if (filter.countryId !== undefined) {
    conditions.push(eq(countries.id, filter.countryId));
  }
  if (filter.storeId !== undefined) {
    conditions.push(eq(stores.id, filter.storeId));
  }
  if (filter.stationId !== undefined) {
    conditions.push(eq(stations.id, filter.stationId));
  }
  if (filter.from !== undefined) {
    conditions.push(gte(submissions.submittedAt, filter.from));
  }
  if (filter.to !== undefined) {
    // Включительно с обеих сторон (контракт): `to` — не исключающая граница.
    conditions.push(lte(submissions.submittedAt, filter.to));
  }
  return conditions;
}

/**
 * Сохраняет заполнение чек-листа. Снимок пунктов и станция берутся из самой версии:
 * и то и другое заморожено в ней в момент публикации. Читать станцию из
 * `checklists.station_id` нельзя — это обычная мутируемая колонка, и перенос чек-листа
 * между выдачей версии и отправкой уводил бы заполнение в чужую историю (T056).
 * Клиент станцию не передаёт: она всегда выводится сервером из версии.
 */
export async function saveSubmission(
  input: SaveSubmissionInput,
): Promise<string> {
  const db = getDb();

  const [version] = await db
    .select({
      status: checklistVersions.status,
      sections: checklistVersions.sections,
      stationId: checklistVersions.stationId,
    })
    .from(checklistVersions)
    .where(eq(checklistVersions.id, input.versionId));

  if (version === undefined) {
    throw new Error(`Версия чек-листа не найдена: ${input.versionId}`);
  }
  if (version.status === "draft") {
    throw new Error(
      "Версия в состоянии «черновик» — это предпросмотр методиста, заполнять её нельзя",
    );
  }
  if (version.stationId === null) {
    throw new Error(
      "У этой версии не заморожена станция: на момент публикации чек-лист не был ни к одной привязан, заполнение невозможно",
    );
  }

  const [inserted] = await db
    .insert(submissions)
    .values({
      versionId: input.versionId,
      stationId: version.stationId,
      snapshot: version.sections,
      answers: input.answers,
      startedAt: new Date(input.startedAt),
      mode: input.mode,
    })
    .returning({ id: submissions.id });

  if (inserted === undefined) {
    throw new Error("Заполнение не сохранилось");
  }
  return inserted.id;
}

/**
 * Лента заполнений: фильтры по стране, пиццерии, станции и периоду комбинируются,
 * сортировка по времени отправки по убыванию, лимит — по умолчанию 200, максимум 500.
 *
 * Вторичный ключ сортировки — `id` по убыванию. Пачка заполнений, вставленная одним
 * запросом, имеет одинаковый `submitted_at`, и порядок внутри неё без второго ключа
 * не определён: `LIMIT` отдавал бы разные подмножества от запроса к запросу.
 */
export async function listSubmissions(
  filter: SubmissionFilter = {},
): Promise<SubmissionRow[]> {
  const db = getDb();
  const conditions = buildFilterConditions(filter);

  const rows = await submissionsBaseQuery(db)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(submissions.submittedAt), desc(submissions.id))
    .limit(clampLimit(filter.limit));

  return rows.map(toSubmissionRow);
}

/**
 * Карточка одного заполнения. Неизвестный идентификатор и идентификатор
 * в неверном формате uuid — оба дают `null`, а не исключение.
 */
export async function getSubmission(
  id: string,
): Promise<SubmissionDetail | null> {
  if (!isUuid(id)) return null;

  const db = getDb();
  const [row] = await submissionsBaseQuery(db).where(eq(submissions.id, id));
  if (row === undefined) return null;

  return {
    ...toSubmissionRow(row),
    snapshot: row.snapshot,
    answers: row.answers,
  };
}
