// Загрузка данных для экранов ленты и карточки. Здесь сходятся четыре фильтра, три
// показателя и снимок пунктов — и здесь же держится главное правило обоих экранов:
// показатели считаются по ТОМУ ЖЕ массиву строк, который показан в ленте.
import type { Locale } from "@/blocks/core/locale";
import type { Answer, Section, ShiftMode, SubmissionRow } from "@/blocks/data";
import {
  getSubmission,
  isFailed,
  isItemInMode,
  listSubmissions,
  severityOf,
} from "@/blocks/data";

import type { AlarmList, AlarmScope } from "../alarms";
import { listAlarms } from "../alarms";
import { checklistHref } from "../checklist-link";
import { computeMetrics } from "../metrics";
import type {
  AlarmRow,
  AnswerView,
  FeedAlarms,
  FeedEmptyKind,
  FeedModel,
  FeedRow,
  FeedSelection,
  SubmissionItemView,
  SubmissionModel,
  SubmissionSectionView,
} from "../model";
import { loadFeedCatalog, stationTimeZone } from "../options";
import { outcomeOf } from "../outcome";
import { relativeDay, resolvePeriod } from "../period";
import {
  isTimeZoneAmbiguous,
  resolveSelection,
  screenTimeZone,
  storeTimeZone,
} from "../selection";
import { versionPublishedAt } from "../versions";
import { pickText } from "../text";
import type { FeedView } from "../view";

/**
 * Сколько строк показывает лента за раз. Слой доступа ограничивает выдачу и сам
 * (200 по умолчанию), но экран задаёт число явно: иначе он не может отличить
 * «столько и было» от «дальше обрезано» и молча покажет часть истории как всю.
 */
const FEED_LIMIT = 200;

/**
 * Сколько тревог показывает полоса. Остальные считаются и объявляются числом: полоса
 * из сорока строк перестаёт быть тревогой и становится фоном, который перестают читать.
 */
const ALARM_STRIP_LIMIT = 6;

/** Фильтры экрана в том виде, в каком их принимают запросы: незаданное не передаётся. */
function scopeOf(selection: FeedSelection): AlarmScope {
  return {
    ...(selection.countryId === null ? {} : { countryId: selection.countryId }),
    ...(selection.storeId === null ? {} : { storeId: selection.storeId }),
    ...(selection.stationId === null ? {} : { stationId: selection.stationId }),
  };
}

/** Пояс площадки: последнее слово, когда пояс пиццерии выяснить неоткуда. */
function platformTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * Модель ленты. `now` приходит параметром, а не берётся внутри: границы «сегодня»
 * иначе невозможно проверить тестом, не подменяя системные часы.
 */
export async function buildFeedModel(
  view: FeedView,
  locale: Locale,
  now: Date = new Date(),
): Promise<FeedModel> {
  const catalog = await loadFeedCatalog();
  const selection = resolveSelection(view, catalog);
  const timeZone = screenTimeZone(selection);
  const { from, to } = resolvePeriod(selection.period, now, timeZone);

  const rows = await listSubmissions({
    ...scopeOf(selection),
    from,
    to,
    limit: FEED_LIMIT,
  });

  // Тревоги берутся своим запросом и без периода: полоса обязана показывать
  // состояние на сейчас, а не выборку, суженную фильтром периода (D053).
  const alarms = await listAlarms(scopeOf(selection), now);

  const feedRows = rows.map((row) =>
    toFeedRow(row, {
      locale,
      timeZone: storeTimeZone(catalog.stores, row.storeId, timeZone),
      now,
    }),
  );

  return {
    selection,
    timeZone,
    timeZoneAmbiguous: isTimeZoneAmbiguous(selection),
    periodFrom: from,
    periodTo: to,
    metrics: computeMetrics(feedRows),
    alarms: toFeedAlarms(alarms, locale),
    rows: feedRows,
    // Предел задан здесь, а не унаследован у слоя доступа: экран обязан знать число,
    // на котором лента обрывается, чтобы честно об этом сказать.
    limitReached: feedRows.length >= FEED_LIMIT,
    emptyKind:
      feedRows.length > 0
        ? null
        : await emptyKindOf(selection, catalog.stations.length),
  };
}

/** Тревоги в том виде, в каком их рисует полоса: язык уже выбран, лишнее отброшено. */
function toFeedAlarms(list: AlarmList, locale: Locale): FeedAlarms {
  const rows: AlarmRow[] = list.alarms
    .slice(0, ALARM_STRIP_LIMIT)
    .map((alarm) => ({
      key: alarm.key,
      kind: alarm.kind,
      storeName: alarm.storeName,
      stationName: alarm.stationName,
      checklistTitle: pickText(alarm.checklistTitle, locale),
      timeZone: alarm.timeZone,
      at: alarm.at,
      itemCount: alarm.itemCount,
      submissionId: alarm.submissionId,
    }));

  return {
    rows,
    hiddenCount: list.alarms.length - rows.length,
    capped: list.capped,
    unknownTimezoneStores: list.unknownTimezoneStores,
  };
}

/**
 * Почему лента пуста. Второй запрос уходит ТОЛЬКО при пустой ленте и берёт один ряд
 * без периода: разница между «не заполняли ни разу» и «не заполняли на этой неделе»
 * решает, что предложить управляющему дальше.
 */
async function emptyKindOf(
  selection: FeedSelection,
  stationCount: number,
): Promise<FeedEmptyKind> {
  if (stationCount === 0) return "no-stations";

  const ever = await listSubmissions({
    ...scopeOf(selection),
    limit: 1,
  });

  return ever.length === 0 ? "never" : "period";
}

interface RowContext {
  readonly locale: Locale;
  readonly timeZone: string;
  readonly now: Date;
}

function toFeedRow(row: SubmissionRow, context: RowContext): FeedRow {
  return {
    id: row.id,
    submittedAt: row.submittedAt,
    startedAt: row.startedAt,
    durationMs: row.durationMs,
    countryName: row.countryName,
    storeName: row.storeName,
    stationName: row.stationName,
    checklistTitle: pickText(row.checklistTitle, context.locale),
    versionNumber: row.versionNumber,
    timeZone: context.timeZone,
    whenKind: relativeDay(row.submittedAt, context.now, context.timeZone),
    mode: row.mode,
    outcome: outcomeOf({
      itemCount: row.itemCount,
      answeredCount: row.answeredCount,
      // Оба счёта провалов приходят из самой строки ленты: слой доступа считает их
      // по снимку и ответам, которые всё равно читает (T100). До этого экран
      // дочитывал общее число вторым запросом — второе место с правилом провала.
      failedCount: row.failedCount,
      failedCriticalCount: row.failedCriticalCount,
    }),
  };
}

/**
 * Модель карточки. Пункты берутся ИЗ СНИМКА заполнения (`detail.snapshot`), а не из
 * версии чек-листа: правка и публикация новой версии не имеют права менять то, что
 * уже сохранено (принцип 3, D002).
 *
 * `backHref` приходит снаружи: возврат ведёт в ленту с теми же фильтрами, с которыми
 * управляющий в карточку пришёл.
 */
export async function buildSubmissionModel(
  id: string,
  locale: Locale,
  backHref: string,
): Promise<SubmissionModel | null> {
  const detail = await getSubmission(id);
  if (detail === null) return null;

  const [timeZone, publishedAt] = await Promise.all([
    stationTimeZone(detail.stationId),
    versionPublishedAt(detail.versionId),
  ]);

  const sections = toSectionViews(
    detail.snapshot,
    detail.answers,
    locale,
    detail.mode,
  );
  const allItems = sections.flatMap((section) => section.items);
  // Счёт идёт только по тому, что в этом режиме спрашивали. Пункты, которых
  // сотруднику не показывали, остаются в карточке видимыми — но «не отвечено»
  // про них было бы упрёком за работу, которой от него не ждали.
  const items = allItems.filter((item) => item.askedInMode);
  const skippedByModeCount = allItems.length - items.length;
  const answeredCount = items.filter(
    (item) => item.answer.kind !== "none",
  ).length;
  const failedCount = items.filter((item) => item.failed).length;
  const failedCriticalCount = items.filter(
    (item) => item.failed && item.severity === "critical",
  ).length;

  return {
    id: detail.id,
    checklistTitle: pickText(detail.checklistTitle, locale),
    countryName: detail.countryName,
    storeName: detail.storeName,
    stationName: detail.stationName,
    timeZone: timeZone ?? platformTimeZone(),
    startedAt: detail.startedAt,
    submittedAt: detail.submittedAt,
    durationMs: detail.durationMs,
    itemCount: items.length,
    doneCount: answeredCount - failedCount,
    mode: detail.mode,
    skippedByModeCount,
    versionNumber: detail.versionNumber,
    versionPublishedAt: publishedAt,
    outcome: outcomeOf({
      itemCount: items.length,
      answeredCount,
      failedCount,
      failedCriticalCount,
    }),
    checklistHref: checklistHref(detail.checklistId),
    sections,
    backHref,
  };
}

/** Ответ в том виде, в каком его дал сотрудник; тип берётся у пункта снимка. */
function toAnswerView(
  item: Section["items"][number],
  value: boolean | number | string | undefined,
): AnswerView {
  if (value === undefined) return { kind: "none" };
  if (item.type === "bool" && typeof value === "boolean") {
    return { kind: "bool", value };
  }
  if (item.type === "number" && typeof value === "number") {
    return { kind: "number", value };
  }
  // Тип ответа разошёлся с типом пункта — показываем как есть, а не прячем:
  // такое расхождение видно только на экране, и молчать о нём нельзя.
  return { kind: "text", value: String(value) };
}

function toSectionViews(
  snapshot: readonly Section[],
  answers: readonly Answer[],
  locale: Locale,
  mode: ShiftMode,
): SubmissionSectionView[] {
  const byItem = new Map(answers.map((answer) => [answer.itemId, answer]));

  return snapshot.map((section) => ({
    id: section.id,
    title: pickText(section.title, locale),
    fromLibrary: section.source !== "own",
    items: section.items.map((item): SubmissionItemView => {
      const answer = byItem.get(item.id);
      return {
        itemId: item.id,
        title: pickText(item.title, locale),
        hint: item.hint === undefined ? null : pickText(item.hint, locale),
        severity: severityOf(item),
        askedInMode: isItemInMode(item, mode),
        min: item.min ?? null,
        max: item.max ?? null,
        failed: isFailed(item, answer),
        answer: toAnswerView(item, answer?.value),
        answeredAt: answer === undefined ? null : new Date(answer.at),
        comment: answer?.comment ?? null,
      };
    }),
  }));
}
