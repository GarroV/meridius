// Сид демонстрационного контура: один прогон приводит базу к состоянию, которое
// можно показывать (T049).
//
// Идемпотентность здесь устроена не «посмотреть и досоздать недостающее», а
// «снять своё и завести заново». Досоздание требует сравнивать содержимое каждой
// строки с описанием и разбирать частичные расхождения — а это ровно тот код,
// который тихо расходится с данными. Опознаватели контура постоянны (см. model.ts),
// поэтому снятие точечное: чужой строки сид не касается ни одной.
import { and, eq, inArray, notInArray, or, sql } from "drizzle-orm";

import type { Answer, Database, Section } from "@/blocks/data";
import {
  alarms,
  blocks,
  checklistVersions,
  checklists,
  checks,
  countries,
  getDb,
  stations,
  storeShiftModes,
  stores,
  submissions,
} from "@/blocks/data";

import { DEMO } from "./dataset";
import { DemoSeedError } from "./failure";
import type { DemoDataset } from "./model";

const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;
const MS_PER_SECOND = 1000;

export interface DemoStationCode {
  readonly station: string;
  readonly store: string;
  readonly code: string;
}

/** Что сид сделал: печатается запускающим и годится для проверки глазами. */
export interface DemoSeedSummary {
  readonly removedRows: number;
  readonly country: string;
  readonly stores: number;
  readonly stations: number;
  readonly blocks: number;
  readonly checklists: number;
  readonly versions: number;
  readonly submissions: number;
  readonly codes: readonly DemoStationCode[];
}

export interface SeedOptions {
  /**
   * Опорный момент: заполнения и публикации датируются смещением назад от него.
   * Задаётся в тестах, чтобы два прогона можно было сравнить строка в строку.
   */
  readonly now?: Date;
  readonly dataset?: DemoDataset;
}

function hoursBefore(now: Date, hours: number): Date {
  return new Date(now.getTime() - hours * HOUR_MS);
}

/**
 * Моменты ответов внутри заполнения: равномерно от начала до отправки.
 * Последний ответ приходится ровно на отправку — так же, как это выглядит в жизни:
 * сотрудник отвечает на последний пункт и нажимает кнопку.
 */
function withAnswerTimes(
  answers: readonly Omit<Answer, "at">[],
  startedAt: Date,
  durationMs: number,
): Answer[] {
  return answers.map((answer, index) => ({
    ...answer,
    at:
      startedAt.getTime() +
      Math.round(((index + 1) * durationMs) / answers.length),
  }));
}

/** Транзакция слоя доступа: тип берётся у самого `transaction`, чтобы не разъехаться с ним. */
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * Что в базе принадлежит демонстрационному контуру ПРЯМО СЕЙЧАС.
 *
 * Границу проводит страна: своё — это всё, что висит под демонстрационной страной, и
 * ничего сверх неё. Опознаватели из описания добавляются к найденному, а не заменяют
 * его: описание говорит, что в контуре обязано быть, но не что в нём успели завести
 * руками на показе.
 *
 * До T173 снятие шло ТОЛЬКО по опознавателям из описания, и первая же станция,
 * заведённая в демо-пиццерии обычным действием в админке, ломала стенд необратимо:
 * станция оставалась, внешний ключ не давал удалить пиццерию, а сид падал трассой
 * драйвера. То же уровнем выше — заведённая пиццерия не давала удалить страну.
 *
 * Чек-лист считается своим не только по текущей станции, но и по станции, замороженной
 * в любой его версии. Методист вправе отвязать чек-лист от станции (`on delete set null`
 * в схеме, `detachChecklist` в справочнике), и без второго условия отвязанный чек-лист
 * выпадал бы из контура насовсем — та же щель, из-за которой уборка смоука снимает
 * чек-листы раньше станций (журнал блока, 07.09.2026).
 */
interface Contour {
  readonly storeIds: readonly string[];
  readonly stationIds: readonly string[];
  readonly checklistIds: readonly string[];
  readonly versionIds: readonly string[];
}

function distinct(...groups: readonly (readonly string[])[]): string[] {
  return [...new Set(groups.flat())];
}

async function contourOf(tx: Transaction, data: DemoDataset): Promise<Contour> {
  const storeRows = await tx
    .select({ id: stores.id })
    .from(stores)
    .where(eq(stores.countryId, data.country.id));
  const storeIds = distinct(
    storeRows.map((row) => row.id),
    data.stores.map((store) => store.id),
  );

  const stationRows = await tx
    .select({ id: stations.id })
    .from(stations)
    .where(inArray(stations.storeId, storeIds));
  const stationIds = distinct(
    stationRows.map((row) => row.id),
    data.stations.map((station) => station.id),
  );

  const attachedChecklists = await tx
    .select({ id: checklists.id })
    .from(checklists)
    .where(inArray(checklists.stationId, stationIds));
  const publishedOnContour = await tx
    .select({ id: checklistVersions.checklistId })
    .from(checklistVersions)
    .where(inArray(checklistVersions.stationId, stationIds));
  const checklistIds = distinct(
    attachedChecklists.map((row) => row.id),
    publishedOnContour.map((row) => row.id),
    data.checklists.map((checklist) => checklist.id),
  );

  const versionRows = await tx
    .select({ id: checklistVersions.id })
    .from(checklistVersions)
    .where(inArray(checklistVersions.checklistId, checklistIds));
  const versionIds = distinct(
    versionRows.map((row) => row.id),
    data.checklists.map((checklist) => checklist.draft.id),
    data.checklists.flatMap((checklist) =>
      checklist.versions.map((version) => version.id),
    ),
  );

  return { storeIds, stationIds, checklistIds, versionIds };
}

/**
 * Рабочие строки, которые держат контур снаружи: заполнение или отметка обхода,
 * сделанные на станции ВНЕ контура по версии демонстрационного чек-листа. Снять их
 * сид не имеет права — это настоящее свидетельство о смене, а история неприкосновенна
 * (принцип 3); оставить тоже нельзя — база не даст удалить версию.
 *
 * Случай не выдуманный: он получается, если демонстрационный чек-лист назначили на
 * рабочую станцию. Поэтому сид отказывается и называет помеху поимённо, а не падает
 * кодом внешнего ключа.
 */
async function foreignHolds(
  tx: Transaction,
  contour: Contour,
): Promise<string[]> {
  // Копия списка, а не он сам: `notInArray` принимает только изменяемый массив,
  // а описание контура наружу отдаётся неизменяемым.
  const inside = [...contour.stationIds];
  const heldSubmissions = await tx
    .select({ id: submissions.id, stationId: submissions.stationId })
    .from(submissions)
    .where(
      and(
        inArray(submissions.versionId, contour.versionIds),
        notInArray(submissions.stationId, inside),
      ),
    );
  const heldChecks = await tx
    .select({ id: checks.id, stationId: checks.stationId })
    .from(checks)
    .where(
      and(
        inArray(checks.versionId, contour.versionIds),
        notInArray(checks.stationId, inside),
      ),
    );

  return [
    ...heldSubmissions.map(
      (row) =>
        `заполнение ${row.id} сделано на станции ${row.stationId} вне контура`,
    ),
    ...heldChecks.map(
      (row) =>
        `отметка обхода ${row.id} сделана на станции ${row.stationId} вне контура`,
    ),
  ];
}

/**
 * Снимает прошлый контур. Порядок обратный вставке: сначала то, что ссылается,
 * потом то, на что ссылаются, — иначе внешний ключ не даст удалить.
 */
async function removeContour(
  tx: Transaction,
  data: DemoDataset,
): Promise<number> {
  if (data.stations.length === 0 || data.checklists.length === 0) {
    throw new DemoSeedError(
      "Описание контура без станций или чек-листов: заводить и снимать нечего",
    );
  }

  const contour = await contourOf(tx, data);

  const holds = await foreignHolds(tx, contour);
  if (holds.length > 0) {
    throw new DemoSeedError(
      [
        "Демонстрационный контур не снять: на него ссылаются заполнения или отметки",
        "обхода, сделанные на станциях ВНЕ контура. Стереть их сид не имеет права —",
        "это свидетельство о настоящей смене, а история в продукте неприкосновенна.",
        "",
        ...holds.map((hold) => `  ${hold}`),
        "",
        "Так получается, когда демонстрационный чек-лист назначают на рабочую станцию.",
        "Что делать: снимите назначение в справочнике, чтобы это не повторилось, —",
        "а с уже накопленными строками решите отдельно. Средствами продукта их не",
        "удалить, и это сознательно: такое удаление всегда решение человека, а не",
        "сценария. Контур сид не тронул — он остался таким, каким был.",
      ].join("\n"),
    );
  }

  const blockIds = data.blocks.map((block) => block.id);
  const submissionIds = data.submissions.map((submission) => submission.id);

  // Будильники сняты явно, хотя схема и так уносит их вслед за станцией
  // (`on delete cascade`): снятое молча не попадает в счёт строк, а счёт печатается
  // запускающему и по нему видно, что прогон вообще что-то делал.
  const removedAlarms = await tx
    .delete(alarms)
    .where(inArray(alarms.stationId, contour.stationIds))
    .returning({ id: alarms.id });

  const removedChecks = await tx
    .delete(checks)
    .where(
      or(
        inArray(checks.stationId, contour.stationIds),
        inArray(checks.versionId, contour.versionIds),
      ),
    )
    .returning({ id: checks.id });

  // Заполнения снимаются по станции контура, а не только по своему опознавателю:
  // на показе по демо-коду заполняют по-настоящему, и такие записи держали бы версию
  // внешним ключом — повторный прогон падал бы вместо того, чтобы обновить контур.
  const removedSubmissions = await tx
    .delete(submissions)
    .where(
      or(
        inArray(submissions.stationId, contour.stationIds),
        inArray(submissions.versionId, contour.versionIds),
        ...(submissionIds.length > 0
          ? [inArray(submissions.id, submissionIds)]
          : []),
      ),
    )
    .returning({ id: submissions.id });

  const removedVersions = await tx
    .delete(checklistVersions)
    .where(inArray(checklistVersions.id, contour.versionIds))
    .returning({ id: checklistVersions.id });

  const removedChecklists = await tx
    .delete(checklists)
    .where(inArray(checklists.id, contour.checklistIds))
    .returning({ id: checklists.id });

  // Режимы смены снимаются вместе с контуром: они ссылаются на пиццерию внешним
  // ключом, и без этого повторный прогон упёрся бы в него при удалении пиццерий.
  const removedShiftModes = await tx
    .delete(storeShiftModes)
    .where(inArray(storeShiftModes.storeId, contour.storeIds))
    .returning({ id: storeShiftModes.id });

  const removedStations = await tx
    .delete(stations)
    .where(inArray(stations.id, contour.stationIds))
    .returning({ id: stations.id });

  const removedStores = await tx
    .delete(stores)
    .where(inArray(stores.id, contour.storeIds))
    .returning({ id: stores.id });

  const removedCountry = await tx
    .delete(countries)
    .where(eq(countries.id, data.country.id))
    .returning({ id: countries.id });

  // Блоки библиотеки снимаются только по опознавателям описания, и это не недосмотр:
  // блок не привязан ни к стране, ни к станции, поэтому блок, заведённый методистом
  // на показе, от рабочего неотличим. Трогать его сид не имеет права.
  const removedBlocks =
    blockIds.length === 0
      ? []
      : await tx
          .delete(blocks)
          .where(inArray(blocks.id, blockIds))
          .returning({ id: blocks.id });

  return [
    removedAlarms,
    removedChecks,
    removedSubmissions,
    removedVersions,
    removedChecklists,
    removedShiftModes,
    removedStations,
    removedStores,
    removedCountry,
    removedBlocks,
  ].reduce((total, rows) => total + rows.length, 0);
}

async function insertContour(
  tx: Transaction,
  data: DemoDataset,
  now: Date,
): Promise<void> {
  await tx.insert(countries).values({
    id: data.country.id,
    name: data.country.name,
    locale: data.country.locale,
  });
  await tx.insert(stores).values(
    data.stores.map((store) => ({
      id: store.id,
      countryId: data.country.id,
      name: store.name,
      timezone: store.timezone,
    })),
  );
  await tx.insert(stations).values(
    data.stations.map((station) => ({
      id: station.id,
      storeId: station.storeId,
      name: station.name,
      code: station.code,
    })),
  );
  if (data.blocks.length > 0) {
    await tx.insert(blocks).values(
      data.blocks.map((block) => ({
        id: block.id,
        title: block.title,
        items: [...block.items],
      })),
    );
  }
  await tx.insert(checklists).values(
    data.checklists.map((checklist) => ({
      id: checklist.id,
      stationId: checklist.stationId,
      title: checklist.title,
      windowStart: checklist.window.start,
      windowEnd: checklist.window.end,
    })),
  );

  await tx.insert(checklistVersions).values([
    // Черновик методиста: он живёт рядом с опубликованной версией и правится дальше.
    ...data.checklists.map((checklist) => ({
      id: checklist.draft.id,
      checklistId: checklist.id,
      status: "draft" as const,
      versionNumber: null,
      stationId: null,
      sections: [...checklist.draft.sections],
      publishedAt: null,
    })),
    ...data.checklists.flatMap((checklist) =>
      checklist.versions.map((version) => ({
        id: version.id,
        checklistId: checklist.id,
        status: version.status,
        versionNumber: version.versionNumber,
        // Станция замораживается в версии так же, как это делает публикация.
        stationId: checklist.stationId,
        sections: [...version.sections],
        publishedAt: hoursBefore(now, version.publishedHoursAgo),
      })),
    ),
  ]);

  const sectionsByVersion = new Map<string, Section[]>(
    data.checklists.flatMap((checklist) =>
      checklist.versions.map(
        (version) => [version.id, [...version.sections]] as const,
      ),
    ),
  );

  await insertShiftModes(tx, data, now);

  const times = await submittedTimes(tx, data, now);

  await tx.insert(submissions).values(
    data.submissions.map((submission) => {
      const submittedAt = times.get(submission.id);
      if (submittedAt === undefined) {
        throw new Error(
          `Момент отправки заполнения ${submission.id} не посчитан`,
        );
      }
      const durationMs = submission.durationMinutes * MINUTE_MS;
      const startedAt = new Date(submittedAt.getTime() - durationMs);
      const snapshot = sectionsByVersion.get(submission.versionId);
      if (snapshot === undefined) {
        throw new Error(
          `Заполнение ${submission.id} ссылается на версию ${submission.versionId}, которой нет в описании контура`,
        );
      }
      return {
        id: submission.id,
        versionId: submission.versionId,
        stationId: submission.stationId,
        // Снимок — это разметка той версии, что была отдана на станцию (D002).
        snapshot,
        answers: withAnswerTimes(submission.answers, startedAt, durationMs),
        startedAt,
        submittedAt,
        mode: submission.mode ?? "normal",
      };
    }),
  );
}

/**
 * Приводит базу к демонстрационному контуру. Повторный прогон возвращает контур
 * в исходное состояние: снимает всё своё (включая заполнения, сделанные на демо-станциях
 * по ходу показа) и заводит заново.
 *
 * Всё одной транзакцией: прерванный сид не имеет права оставить базу с половиной
 * контура — показывать такое хуже, чем не показывать ничего.
 */
/**
 * Режим смены на сегодняшние местные сутки пиццерии. Дата считается базой из её
 * часового пояса (D026), а не в JavaScript: иначе на показе из другого пояса режим
 * лёг бы на чужие сутки и станция открылась бы полной сменой.
 */
async function insertShiftModes(
  tx: Transaction,
  data: DemoDataset,
  now: Date,
): Promise<void> {
  if (data.shiftModes.length === 0) return;

  for (const shift of data.shiftModes) {
    await tx.execute(sql`
      insert into store_shift_modes (store_id, local_date, mode, staff_present, staff_expected)
      select ${shift.storeId}::uuid,
             (${now.toISOString()}::timestamptz at time zone s.timezone)::date,
             ${shift.mode},
             ${shift.staffPresent},
             ${shift.staffExpected}
      from stores s
      where s.id = ${shift.storeId}::uuid
    `);
  }
}

/**
 * Моменты отправки заполнений: местное время пиццерии переводится в мгновение базой,
 * а не в JavaScript (D026). Сдвиг «столько часов назад» здесь не годится: заполнение
 * обязано попадать ВНУТРЬ окна своего чек-листа при любом времени показа, иначе
 * вечернее закрытие оказывается заполненным в полдень.
 *
 * Момент в будущем подрезается до «сейчас»: если контур сажают до того часа, который
 * задан сегодняшнему заполнению, лента показала бы заполнение, которого ещё не было.
 */
async function submittedTimes(
  tx: Transaction,
  data: DemoDataset,
  now: Date,
): Promise<Map<string, Date>> {
  const times = new Map<string, Date>();

  for (const item of data.submissions) {
    const result = await tx.execute<{ at: number }>(sql`
      select extract(epoch from least(
               ((((${now.toISOString()}::timestamptz at time zone s.timezone)::date
                   - ${item.daysAgo}::int) + ${item.at}::time) at time zone s.timezone),
               ${now.toISOString()}::timestamptz
             ))::float8 as at
      from stations st
      join stores s on st.store_id = s.id
      where st.id = ${item.stationId}::uuid
    `);

    const seconds = result.rows[0]?.at;
    if (seconds === undefined) {
      throw new Error(
        `Заполнение ${item.id} ссылается на станцию ${item.stationId}, которой нет в описании контура`,
      );
    }
    times.set(item.id, new Date(seconds * MS_PER_SECOND));
  }

  return times;
}

export async function seedDemo(
  options: SeedOptions = {},
): Promise<DemoSeedSummary> {
  const data = options.dataset ?? DEMO;
  const now = options.now ?? new Date();

  const removedRows = await getDb().transaction(async (tx) => {
    const removed = await removeContour(tx, data);
    await insertContour(tx, data, now);
    return removed;
  });

  const storeNames = new Map(
    data.stores.map((store) => [store.id, store.name]),
  );

  return {
    removedRows,
    country: data.country.name,
    stores: data.stores.length,
    stations: data.stations.length,
    blocks: data.blocks.length,
    checklists: data.checklists.length,
    versions:
      data.checklists.length +
      data.checklists.reduce(
        (total, checklist) => total + checklist.versions.length,
        0,
      ),
    submissions: data.submissions.length,
    codes: data.stations.map((station) => ({
      station: station.name,
      store: storeNames.get(station.storeId) ?? "",
      code: station.code,
    })),
  };
}
