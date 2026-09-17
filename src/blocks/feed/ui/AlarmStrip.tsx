import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import type { ReactElement } from "react";

import { alarmText } from "../alarm-text";
import type { AlarmRow, FeedAlarms, FeedSelection } from "../model";
import { submissionHref } from "../view";

/**
 * Полоса тревог над лентой (D053).
 *
 * Стоит выше показателей и ленты: тревога — единственное на этом экране, что требует
 * действия сегодня, а не сведений о прошлом. Тревоги посчитала модель, здесь их не
 * пересчитывают и не досчитывают.
 *
 * Тихое состояние показывается строкой, а не пустотой: отсутствие полосы неотличимо
 * от неработающей полосы, и управляющий обязан видеть разницу между «тревог нет»
 * и «тревоги не показываются».
 */

const CARD_CLASS =
  "rounded-[var(--r-block)] border border-[var(--err-line)] bg-[var(--err-soft)] shadow-[var(--sh-xs)]";
const HEAD_CLASS =
  "flex items-center gap-[var(--space-5)] border-b border-[var(--err-line)] px-[var(--space-7)] py-[var(--space-5)]";
const TITLE_CLASS =
  "text-[length:var(--fs-title)] leading-[var(--lh-title)] font-semibold text-[var(--err)]";
const COUNT_CLASS = "ml-auto text-[length:var(--fs-meta)] text-[var(--ink-3)]";
const LIST_CLASS = "m-0 flex list-none flex-col p-0";
const ROW_CLASS =
  "flex flex-wrap items-baseline gap-x-[var(--space-5)] gap-y-[var(--space-2)] border-b border-[var(--err-line)] px-[var(--space-7)] py-[var(--space-5)] last:border-b-0";
const WHERE_CLASS = "text-[length:var(--fs-dense)] font-semibold text-ink";
const WHAT_CLASS = "text-[length:var(--fs-dense)] text-[var(--err)]";
const WHEN_CLASS =
  "font-[family-name:var(--font-num)] text-[length:var(--fs-num)] [font-variant-numeric:tabular-nums] text-[var(--ink-2)]";
const OPEN_CLASS =
  "ml-auto inline-flex h-[var(--control-h-sm)] items-center rounded-[var(--r-control)] px-[var(--space-5)] text-[length:var(--fs-dense)] font-medium text-[var(--ink-2)] no-underline hover:bg-[var(--surface-2)] hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";
const FOOT_CLASS =
  "border-t border-[var(--err-line)] px-[var(--space-7)] py-[var(--space-5)] text-[length:var(--fs-meta)] text-[var(--ink-3)]";
const QUIET_CLASS = "text-[length:var(--fs-meta)] text-[var(--ink-3)]";

type Formatter = Awaited<ReturnType<typeof getFormatter>>;
type Translate = Awaited<ReturnType<typeof getTranslations>>;

export interface AlarmStripProps {
  readonly alarms: FeedAlarms;
  /** Фильтры ленты: из тревоги открывают карточку и возвращаются в ту же ленту. */
  readonly selection: FeedSelection;
}

/** Что именно случилось: провал критичного пункта или незаполненный чек-лист. */
function whatText(row: AlarmRow, format: Formatter, t: Translate): string {
  const time = format.dateTime(row.at, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: row.timeZone,
  });

  const { key, values } = alarmText(row, time);
  return t(key, values);
}

async function AlarmStripRow({
  row,
  selection,
}: {
  readonly row: AlarmRow;
  readonly selection: FeedSelection;
}): Promise<ReactElement> {
  const t = await getTranslations("feed.alarms");
  const format = await getFormatter();

  return (
    <li className={ROW_CLASS} data-testid="alarm-row" data-kind={row.kind}>
      <span className={WHERE_CLASS}>
        {row.storeName} · {row.stationName}
      </span>
      <span className={WHEN_CLASS}>
        {format.dateTime(row.at, {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
          timeZone: row.timeZone,
        })}
      </span>
      <span className={WHAT_CLASS}>
        {row.checklistTitle} — {whatText(row, format, t)}
      </span>
      {/* Ссылка есть только у провала: у незаполненного чек-листа открывать нечего,
          и кнопка, ведущая в пустоту, хуже её отсутствия. */}
      {row.submissionId === null ? null : (
        <Link
          className={OPEN_CLASS}
          href={submissionHref(row.submissionId, selection)}
          data-testid="alarm-open"
        >
          {t("open")}
        </Link>
      )}
    </li>
  );
}

/**
 * Оговорки полосы: что не поместилось и что посчитать было нечем. Пишутся всегда,
 * в том числе при полной тишине: пиццерия, выпавшая из надзора из-за сломанного
 * пояса, — это ровно тот случай, когда «тревог нет» звучит неправдой (T062).
 */
function noticesOf(alarms: FeedAlarms, t: Translate): string[] {
  const notices: string[] = [];
  if (alarms.capped) notices.push(t("capped"));
  else if (alarms.hiddenCount > 0) {
    notices.push(t("hidden", { count: alarms.hiddenCount }));
  }
  if (alarms.unknownTimezoneStores > 0) {
    notices.push(t("unknownTimezone", { count: alarms.unknownTimezoneStores }));
  }
  return notices;
}

export async function AlarmStrip({
  alarms,
  selection,
}: AlarmStripProps): Promise<ReactElement> {
  const t = await getTranslations("feed.alarms");
  const notices = noticesOf(alarms, t);

  if (alarms.rows.length === 0) {
    return (
      <div data-testid="alarms-quiet">
        <p className={QUIET_CLASS}>{t("quiet")}</p>
        {notices.map((notice) => (
          <p key={notice} className={QUIET_CLASS} data-testid="alarm-notice">
            {notice}
          </p>
        ))}
      </div>
    );
  }

  const total = alarms.rows.length + alarms.hiddenCount;

  return (
    <section className={CARD_CLASS} data-testid="alarm-strip" role="alert">
      <div className={HEAD_CLASS}>
        <h2 className={TITLE_CLASS}>{t("title")}</h2>
        <span className={COUNT_CLASS} data-testid="alarm-count">
          {t("count", { count: total })}
        </span>
      </div>

      <ul className={LIST_CLASS}>
        {alarms.rows.map((row) => (
          <AlarmStripRow key={row.key} row={row} selection={selection} />
        ))}
      </ul>

      {notices.map((notice) => (
        <p key={notice} className={FOOT_CLASS} data-testid="alarm-notice">
          {notice}
        </p>
      ))}
    </section>
  );
}
