import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import type { ReactElement } from "react";

import { formatDuration } from "../format";
import type { FeedRow, FeedSelection } from "../model";
import { submissionHref } from "../view";
import { OutcomeTag } from "./OutcomeTag";

/**
 * Карточка «Лента» (эталон `.table` в feed.html): что, где, когда и с каким итогом
 * заполнено. Порядок строк задал слой доступа — экран его не меняет.
 *
 * Время каждой строки показывается в поясе ЕЁ пиццерии: сотрудник видел на кухне
 * местное время, и управляющему нужно то же самое, иначе утренний чек-лист соседней
 * страны выглядит ночным.
 */

const CARD_CLASS =
  "bg-surface rounded-[var(--r-block)] border border-[var(--line-strong)] shadow-[var(--sh-xs)]";
const HEAD_CLASS =
  "flex items-center gap-[var(--space-6)] rounded-t-[var(--r-block)] border-b border-[var(--line)] bg-[var(--surface-3)] px-[var(--space-7)] py-[var(--space-6)]";
const TITLE_CLASS =
  "text-[length:var(--fs-title)] leading-[var(--lh-title)] font-semibold";
const COUNT_CLASS = "ml-auto text-[length:var(--fs-meta)] text-[var(--ink-3)]";
const TABLE_CLASS =
  "w-full border-collapse text-[length:var(--fs-dense)] leading-[var(--lh-dense)]";
const TH_CLASS =
  "border-b border-[var(--line-strong)] bg-[var(--surface-3)] px-[var(--cell-pad-x)] py-[var(--space-4)] text-left text-[length:var(--fs-micro)] leading-[var(--lh-micro)] font-semibold tracking-[var(--tracking-micro)] text-[var(--ink-2)] uppercase whitespace-nowrap";
const TD_CLASS =
  "border-b border-[var(--line)] px-[var(--cell-pad-x)] py-[var(--space-5)] align-middle";
const TD_WHEN_CLASS = `${TD_CLASS} font-[family-name:var(--font-num)] text-[length:var(--fs-num)] [font-variant-numeric:tabular-nums] whitespace-nowrap text-[var(--ink-2)]`;
const TD_NUM_CLASS = `${TD_CLASS} text-right font-[family-name:var(--font-num)] text-[length:var(--fs-num)] [font-variant-numeric:tabular-nums]`;
const TD_ACTIONS_CLASS = `${TD_CLASS} text-right whitespace-nowrap`;
// Метка сокращённой смены. Полная смена метки не получает: она — норма, и метка на
// каждой строке перестала бы что-либо значить (D055).
const MODE_TAG_CLASS =
  "ml-[var(--space-3)] inline-flex h-[18px] items-center rounded-[var(--r-mark)] border border-[var(--warn-line)] bg-[var(--warn-soft)] px-[var(--space-3)] text-[length:var(--fs-micro)] font-semibold tracking-[var(--tracking-micro)] whitespace-nowrap text-[var(--warn-ink)] uppercase";
const TR_CLASS = "hover:bg-[var(--surface-2)]";
const META_CLASS = "text-[length:var(--fs-meta)] text-[var(--ink-3)]";
const OPEN_CLASS =
  "inline-flex h-[var(--control-h-sm)] items-center justify-center gap-[var(--space-4)] rounded-[var(--r-control)] border border-transparent bg-transparent px-[var(--space-5)] text-[length:var(--fs-dense)] font-medium text-[var(--ink-2)] no-underline hover:bg-[var(--surface-3)] hover:text-ink";
const LIMIT_CLASS =
  "border-t border-[var(--line)] px-[var(--space-7)] py-[var(--space-5)] text-[length:var(--fs-meta)] text-[var(--ink-3)]";

type Formatter = Awaited<ReturnType<typeof getFormatter>>;
type Translate = Awaited<ReturnType<typeof getTranslations>>;

/** Время строки: сегодняшнее — голым временем, вчерашнее — со словом, старше — с датой. */
function whenText(row: FeedRow, format: Formatter, t: Translate): string {
  const time = format.dateTime(row.submittedAt, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: row.timeZone,
  });

  if (row.whenKind === "today") return time;
  if (row.whenKind === "yesterday") return t("yesterday", { time });

  return format.dateTime(row.submittedAt, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: row.timeZone,
  });
}

async function FeedTableRow({
  row,
  selection,
}: {
  readonly row: FeedRow;
  readonly selection: FeedSelection;
}): Promise<ReactElement> {
  const t = await getTranslations("feed.list");
  const format = await getFormatter();

  return (
    <tr
      className={TR_CLASS}
      data-testid="submission-row"
      data-submission-id={row.id}
    >
      <td className={TD_WHEN_CLASS}>{whenText(row, format, t)}</td>
      <td className={TD_CLASS}>
        {row.storeName}
        {row.mode === "normal" ? null : (
          <span data-testid="row-mode" className={MODE_TAG_CLASS}>
            {t(`mode.${row.mode}`)}
          </span>
        )}
      </td>
      <td className={TD_CLASS}>{row.stationName}</td>
      <td className={TD_CLASS}>
        {row.checklistTitle}{" "}
        {row.versionNumber === null ? null : (
          <span className={META_CLASS}>
            {t("version", { number: row.versionNumber })}
          </span>
        )}
      </td>
      <td className={TD_CLASS}>
        <OutcomeTag outcome={row.outcome} />
      </td>
      <td className={TD_NUM_CLASS}>{formatDuration(row.durationMs)}</td>
      <td className={TD_ACTIONS_CLASS}>
        <Link href={submissionHref(row.id, selection)} className={OPEN_CLASS}>
          {t("open")}
        </Link>
      </td>
    </tr>
  );
}

export interface FeedTableProps {
  readonly rows: readonly FeedRow[];
  readonly selection: FeedSelection;
  readonly limitReached: boolean;
}

export async function FeedTable({
  rows,
  selection,
  limitReached,
}: FeedTableProps): Promise<ReactElement> {
  const t = await getTranslations("feed.list");

  return (
    <div className={CARD_CLASS} data-testid="feed-table">
      <div className={HEAD_CLASS}>
        <h2 className={TITLE_CLASS}>{t("title")}</h2>
        <span className={COUNT_CLASS}>
          {t("count", { count: rows.length })}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className={TABLE_CLASS}>
          <thead>
            <tr>
              <th className={TH_CLASS}>{t("columnWhen")}</th>
              <th className={TH_CLASS}>{t("columnStore")}</th>
              <th className={TH_CLASS}>{t("columnStation")}</th>
              <th className={TH_CLASS}>{t("columnChecklist")}</th>
              <th className={TH_CLASS}>{t("columnOutcome")}</th>
              <th className={TH_CLASS}>{t("columnDuration")}</th>
              <th className={TH_CLASS} />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <FeedTableRow key={row.id} row={row} selection={selection} />
            ))}
          </tbody>
        </table>
      </div>

      {/* Лента обрывается на пределе выдачи — молчать об этом нельзя: показанная
          часть истории выглядела бы всей историей. */}
      {limitReached ? (
        <p className={LIMIT_CLASS} data-testid="feed-limit">
          {t("limitReached", { count: rows.length })}
        </p>
      ) : null}
    </div>
  );
}
