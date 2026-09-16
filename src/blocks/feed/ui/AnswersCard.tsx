import { getFormatter, getTranslations } from "next-intl/server";
import type { ReactElement } from "react";

import type {
  AnswerView,
  SubmissionItemView,
  SubmissionModel,
  SubmissionSectionView,
} from "../model";

/**
 * Карточка «Ответы» (эталон `.sec-cap`/`.answer` в submission.html): секции и пункты
 * ровно в том виде, в котором их видел сотрудник (D002) — заголовок и диапазон из
 * СНИМКА чек-листа, ответ и время из заполнения.
 *
 * Разметка не решает, что провалено и что выполнено: это уже решила модель
 * (`item.failed`, `item.answer.kind`) — здесь только цвет и текст по готовым флагам.
 */

const CARD_CLASS =
  "bg-surface rounded-[var(--r-block)] border border-[var(--line-strong)] shadow-[var(--sh-xs)]";
const HEAD_CLASS =
  "flex items-center gap-[var(--space-6)] rounded-t-[var(--r-block)] border-b border-[var(--line)] bg-[var(--surface-3)] px-[var(--space-7)] py-[var(--space-6)]";
const TITLE_CLASS =
  "text-[length:var(--fs-title)] leading-[var(--lh-title)] font-semibold";

const SEC_CAP_CLASS =
  "flex items-center gap-[var(--space-4)] border-b border-[var(--line)] bg-[var(--surface-2)] px-[var(--space-7)] pt-[var(--space-6)] pb-[var(--space-3)] text-[length:var(--fs-micro)] leading-[var(--lh-micro)] font-semibold tracking-[var(--tracking-micro)] text-[var(--ink-3)] uppercase";

const TAG_BASE_CLASS =
  "inline-flex h-[20px] items-center gap-[var(--space-2)] rounded-[var(--r-mark)] border px-[var(--space-4)] text-[length:var(--fs-micro)] font-semibold tracking-[var(--tracking-micro)] whitespace-nowrap uppercase";
const CRIT_TAG_CLASS = `${TAG_BASE_CLASS} border-[var(--warn-line)] bg-[var(--warn-soft)] text-[var(--warn-ink)]`;
const LIBRARY_TAG_CLASS = `${TAG_BASE_CLASS} border-[var(--reg-supp-line)] bg-[var(--reg-supp-soft)] text-[var(--reg-supp)]`;
// Пункт лежит в снимке, но в том режиме смены его сотруднику не показывали. Метка
// нейтральная: это не нарушение, а объяснение, почему строка пустая (D055).
const SKIPPED_TAG_CLASS = `${TAG_BASE_CLASS} bg-surface-2 border-[var(--line-strong)] text-[var(--ink-2)]`;

const ROW_CLASS =
  "grid items-center gap-[var(--space-6)] px-[var(--space-7)] py-[var(--space-5)]";
const ROW_GRID_STYLE = { gridTemplateColumns: "24px 1fr auto auto" } as const;
const ROW_BORDER_CLASS = "border-b border-[var(--line)]";

const MARK_BASE_CLASS =
  "h-[18px] w-[18px] rounded-[var(--r-mark)] border-[1.5px]";
const MARK_NONE_CLASS = `${MARK_BASE_CLASS} border-[var(--line-control-2)]`;
const MARK_OK_CLASS = `${MARK_BASE_CLASS} border-[var(--ok)] bg-[var(--ok)]`;
const MARK_FAIL_CLASS = `${MARK_BASE_CLASS} border-[var(--err)] bg-[var(--err)]`;

const TITLE_ROW_CLASS = "flex flex-wrap items-center gap-[var(--space-3)]";
const HINT_CLASS = "text-[length:var(--fs-meta)] text-[var(--ink-3)]";
const VALUE_CLASS =
  "font-[family-name:var(--font-num)] text-[length:var(--fs-num)] whitespace-nowrap";
const TIME_CLASS =
  "font-[family-name:var(--font-num)] text-[length:var(--fs-num)] text-[var(--ink-3)] whitespace-nowrap";

const COMMENT_CLASS =
  "mt-[var(--space-4)] rounded-[var(--r-block)] border border-[var(--err-line)] bg-[var(--err-soft)] px-[var(--space-6)] py-[var(--space-5)] text-[length:var(--fs-dense)]";
const COMMENT_STYLE = { gridColumn: "2 / -1" } as const;

// Журнал замеса (D074): полноширинная таблица под строкой пункта, а не в её колонке
// значения — колонок методист заводит сколько нужно, и заранее отведённой ширины
// им не хватило бы. Эталон — `.table` в components.css: тонкая линия `--line`,
// шапка мельче тела и цветом `--ink-3`.
const TABLE_WRAP_CLASS =
  "mt-[var(--space-4)] overflow-x-auto rounded-[var(--r-mark)] border border-[var(--line)]";
const TABLE_WRAP_STYLE = { gridColumn: "2 / -1" } as const;
const TABLE_CLASS =
  "w-full border-collapse text-[length:var(--fs-dense)] leading-[var(--lh-dense)]";
const TABLE_TH_CLASS =
  "border-b border-[var(--line)] bg-[var(--surface-2)] px-[var(--space-4)] py-[var(--space-3)] text-left text-[length:var(--fs-micro)] leading-[var(--lh-micro)] font-semibold tracking-[var(--tracking-micro)] text-[var(--ink-3)] uppercase whitespace-nowrap";
const TABLE_TD_CLASS =
  "border-b border-[var(--line)] px-[var(--space-4)] py-[var(--space-3)] align-middle font-[family-name:var(--font-num)] text-[length:var(--fs-num)] whitespace-nowrap";

type Formatter = Awaited<ReturnType<typeof getFormatter>>;
type Translate = Awaited<ReturnType<typeof getTranslations>>;

/**
 * Табличный ответ без единой строки журнала — тот же «без ответа», что и пустой
 * пункт: методист завёл колонки, но сотрудник ничего не записал, а показывать
 * пустую таблицу как выполненный пункт означало бы выдавать её за ответ.
 */
function isUnansweredTable(answer: AnswerView): boolean {
  return answer.kind === "table" && answer.rows.length === 0;
}

/**
 * Заливка квадратика: провал красным перекрывает всё остальное, пункт без ответа
 * остаётся пустым с серой рамкой — его нельзя перепутать с выполненным, — а
 * зелёным закрашен только отвеченный и не проваленный пункт.
 */
function markClass(item: SubmissionItemView): string {
  if (item.failed) return MARK_FAIL_CLASS;
  if (item.answer.kind === "none" || isUnansweredTable(item.answer)) {
    return MARK_NONE_CLASS;
  }
  return MARK_OK_CLASS;
}

/**
 * Пояснение рядом с заголовком — ОДНО, а не два.
 *
 * Подсказка методиста побеждает посчитанный диапазон: в живых чек-листах она его и
 * повторяет («160–180 °C» при min 160 и max 180), и рядом это читается как «160–180
 * 160–180 °C» — найдено сверкой живого экрана с эталоном, где пояснение одно.
 * Диапазон остаётся запасным вариантом: пункт с границами, но без подсказки, обязан
 * показать, чего от сотрудника ждали.
 */
function noteText(item: SubmissionItemView, t: Translate): string | null {
  if (item.hint !== null) return item.hint;
  if (item.min !== null && item.max !== null) {
    return t("range", { min: item.min, max: item.max });
  }
  if (item.min !== null) return t("rangeMin", { min: item.min });
  if (item.max !== null) return t("rangeMax", { max: item.max });
  return null;
}

/**
 * Значение ответа в его собственном виде: да/нет, число, текст или «без ответа».
 * Таблицу с хотя бы одной строкой сюда не отдают — она рисуется своей разметкой,
 * а не этой строкой (см. `AnswerRow`); пустая же таблица здесь и превращается
 * в привычное «без ответа» через тот же запасной путь, что и `kind: "none"`.
 */
function valueText(answer: AnswerView, t: Translate): string {
  if (answer.kind === "bool") return answer.value ? t("yes") : t("no");
  if (answer.kind === "number") return String(answer.value);
  if (answer.kind === "text") return answer.value;
  return t("noAnswer");
}

/** Неотвеченный пункт подсвечен тем же серым, что и его квадратик, а не обычным цветом. */
function valueColor(item: SubmissionItemView): string | undefined {
  if (item.failed) return "var(--err)";
  if (item.answer.kind === "none" || isUnansweredTable(item.answer)) {
    return "var(--ink-3)";
  }
  return undefined;
}

/**
 * Журнал замеса под строкой пункта (D074): настоящая таблица, а не строка текста —
 * `valueText` для неё не годится, колонок может быть сколько угодно. Пустая таблица
 * (`rows.length === 0`) сюда не доходит вовсе: её решает `isUnansweredTable` ещё в
 * `AnswerRow`, и пункт остаётся обычной строкой с подписью «без ответа».
 */
function AnswerTable({
  answer,
}: {
  readonly answer: Extract<AnswerView, { kind: "table" }>;
}): ReactElement {
  return (
    <div className={TABLE_WRAP_CLASS} style={TABLE_WRAP_STYLE}>
      <table className={TABLE_CLASS} data-testid="submission-table">
        <thead>
          <tr>
            {answer.columns.map((column) => (
              <th key={column} className={TABLE_TH_CLASS}>
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {answer.rows.map((row) => (
            <tr key={row.join("␟")} data-testid="submission-table-row">
              {/* Идём по `columns`, а не по `row`: контракт (`build-model.ts`)
                  уже выровнял клетки строки по колонкам, но ключ ячейки обязан
                  быть подписью колонки, а не её местом (см. `RoundsGridTable`
                  — тот же приём для той же задачи: индекс цикла нельзя класть
                  в React `key`, а стабильного опознавателя у клетки нет). */}
              {answer.columns.map((column, columnIndex) => (
                <td key={column} className={TABLE_TD_CLASS}>
                  {row[columnIndex] ?? ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AnswerRow({
  item,
  isLast,
  format,
  t,
  timeZone,
}: {
  readonly item: SubmissionItemView;
  readonly isLast: boolean;
  readonly format: Formatter;
  readonly t: Translate;
  readonly timeZone: string;
}): ReactElement {
  const note = noteText(item, t);
  const color = valueColor(item);
  // Заполненную таблицу рисует `AnswerTable` ниже, во всю ширину строки: колонка
  // значения — не то место, столько текста в неё не поместится.
  const filledTable =
    item.answer.kind === "table" && item.answer.rows.length > 0
      ? item.answer
      : null;

  return (
    <div
      className={isLast ? ROW_CLASS : `${ROW_CLASS} ${ROW_BORDER_CLASS}`}
      style={ROW_GRID_STYLE}
      data-testid="answer-row"
      data-item-id={item.itemId}
      data-failed={String(item.failed)}
      data-asked={String(item.askedInMode)}
    >
      <span className={markClass(item)} />
      <span className={TITLE_ROW_CLASS}>
        <span>{item.title}</span>
        {item.severity === "normal" ? null : (
          <span className={CRIT_TAG_CLASS}>{t(item.severity)}</span>
        )}
        {item.askedInMode ? null : (
          <span className={SKIPPED_TAG_CLASS}>{t("notAsked")}</span>
        )}
        {note === null ? null : <span className={HINT_CLASS}>{note}</span>}
      </span>
      <span
        className={VALUE_CLASS}
        style={color === undefined ? undefined : { color }}
      >
        {filledTable === null ? valueText(item.answer, t) : null}
      </span>
      <span className={TIME_CLASS}>
        {item.answeredAt === null
          ? "—"
          : format.dateTime(item.answeredAt, {
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
              timeZone,
            })}
      </span>
      {filledTable === null ? null : <AnswerTable answer={filledTable} />}
      {item.comment === null ? null : (
        <div
          className={COMMENT_CLASS}
          style={COMMENT_STYLE}
          data-testid="answer-comment"
        >
          {item.comment}
        </div>
      )}
    </div>
  );
}

function SectionBlock({
  section,
  isLastSection,
  format,
  t,
  timeZone,
}: {
  readonly section: SubmissionSectionView;
  readonly isLastSection: boolean;
  readonly format: Formatter;
  readonly t: Translate;
  readonly timeZone: string;
}): ReactElement {
  return (
    <div>
      <div className={SEC_CAP_CLASS} data-testid="answer-section">
        <span>{section.title}</span>
        {section.fromLibrary ? (
          <span className={LIBRARY_TAG_CLASS}>{t("libraryBlock")}</span>
        ) : null}
      </div>
      {section.items.map((item, itemIndex) => (
        <AnswerRow
          key={item.itemId}
          item={item}
          isLast={isLastSection && itemIndex === section.items.length - 1}
          format={format}
          t={t}
          timeZone={timeZone}
        />
      ))}
    </div>
  );
}

export async function AnswersCard({
  model,
}: {
  readonly model: SubmissionModel;
}): Promise<ReactElement> {
  const t = await getTranslations("feed.card");
  const format = await getFormatter();
  const lastSectionIndex = model.sections.length - 1;

  return (
    <div className={CARD_CLASS} data-testid="answers-card">
      <div className={HEAD_CLASS}>
        <h2 className={TITLE_CLASS}>{t("answers")}</h2>
      </div>
      <div>
        {model.sections.map((section, sectionIndex) => (
          <SectionBlock
            key={section.id}
            section={section}
            isLastSection={sectionIndex === lastSectionIndex}
            format={format}
            t={t}
            timeZone={model.timeZone}
          />
        ))}
      </div>
    </div>
  );
}
