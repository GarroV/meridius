// Статистика заполнений с разбивкой по пиццериям или по чек-листам (D179, состав D170).
//
// Плитка пиццерии на экране страны и строка чек-листа на экране пиццерии читают одни и
// те же числа: заполнения за период, сколько из них с проваленным критичным пунктом и
// когда было последнее заполнение. Правило провала и период — общие со сводкой
// (`stats-sql.ts`), поэтому плитка не может разойтись со сводкой по той же пиццерии.
//
// Ядро (constitution, «Ядро и обвязка»): неверная доля выглядит ровно как верная, поэтому
// каждое число сверено с базой в `stats-breakdown.test.ts`.
import { sql, type SQL } from "drizzle-orm";

import { getDb } from "@/blocks/data";

import type { FeedScope } from "./scope";
import {
  FAILED_CRITICAL,
  PLACE_JOIN,
  epochMs,
  periodWindow,
  scopeWhere,
} from "./stats-sql";
import type { StatsPeriodDays } from "./stats-view";

/** Заполнения одной пиццерии или одного чек-листа. */
export interface SubmissionSummary {
  /** Заполнений за период. */
  readonly submissionCount: number;
  /** Из них — с проваленным критичным пунктом. */
  readonly criticalFailedCount: number;
  /** Их доля; `null`, когда заполнений за период нет, — это не «0 %». */
  readonly criticalFailedShare: number | null;
  /**
   * Последнее заполнение вообще, а не только в периоде: «последний раз — 12 дней назад»
   * отвечает на вопрос, почему за неделю пусто.
   */
  readonly lastSubmittedAt: Date | null;
}

/** По чему разбивать: пиццерия заполнения или чек-лист его версии. */
export type SummaryKey = "store" | "checklist";

const KEY_SQL: Record<SummaryKey, SQL> = {
  store: sql`stores.id`,
  checklist: sql`v.checklist_id`,
};

const EMPTY: SubmissionSummary = {
  submissionCount: 0,
  criticalFailedCount: 0,
  criticalFailedShare: null,
  lastSubmittedAt: null,
};

interface SummaryRow extends Record<string, unknown> {
  readonly key: string;
  readonly total: number;
  readonly critical_failed: number;
  readonly last_ms: number | null;
}

/** Доля; `null`, когда делить не на что. */
function shareOf(part: number, whole: number): number | null {
  return whole === 0 ? null : part / whole;
}

/**
 * Заполнения области `scope`, сгруппированные по `by`, за `days` суток до `now`.
 * В выдаче только то, где заполнения были хоть раз; остальное — `summaryOf` с нулями.
 */
export async function loadSummariesBy(
  by: SummaryKey,
  scope: FeedScope,
  days: StatsPeriodDays,
  now: Date,
): Promise<ReadonlyMap<string, SubmissionSummary>> {
  const { window } = periodWindow(days, now);
  const inPeriod = sql`src.submitted_at >= ${window.from}`;

  const result = await getDb().execute<SummaryRow>(sql`
    select ${KEY_SQL[by]} as key,
      count(*) filter (where ${inPeriod})::int as total,
      count(*) filter (where ${inPeriod} and ${FAILED_CRITICAL})::int as critical_failed,
      ${epochMs(sql`max(src.submitted_at)`)} as last_ms
    from submissions as src
    join checklist_versions as v on v.id = src.version_id
    ${PLACE_JOIN}
    where ${scopeWhere(scope)}
      and not src.duplicate
      and src.submitted_at <= ${window.to}
    group by 1`);

  return new Map(
    result.rows.map((row) => [
      row.key,
      {
        submissionCount: row.total,
        criticalFailedCount: row.critical_failed,
        criticalFailedShare: shareOf(row.critical_failed, row.total),
        lastSubmittedAt: row.last_ms === null ? null : new Date(row.last_ms),
      },
    ]),
  );
}

/** Сводка по ключу; не заполняли ни разу — нули и «не было». */
export function summaryOf(
  summaries: ReadonlyMap<string, SubmissionSummary>,
  key: string,
): SubmissionSummary {
  return summaries.get(key) ?? EMPTY;
}
