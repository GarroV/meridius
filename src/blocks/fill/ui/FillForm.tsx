"use client";

import { useLocale, useTranslations } from "next-intl";
import { useCallback, useMemo, useState } from "react";
import type { ReactElement } from "react";

import { formatDuration } from "@/blocks/core/duration";
import { asLocale } from "@/blocks/core/locale";
import { StateScreen } from "@/blocks/core/ui/StateScreen";
import type { Item, TableRow } from "@/blocks/data";

import {
  emptyDraft,
  gradingItemsById,
  gradingSections,
  rangeVerdict,
  summarizeFill,
  toAnswers,
} from "../answers";
import type { DraftAnswer, FillDraft } from "../answers";
import type { FillItemView, FillScreenView, RoundsPanelView } from "../model";
import type { AlarmOutcome, AlarmView } from "../alarms";
import type { RoundOutcome } from "../rounds";
import type { ShiftModeOutcome } from "../shift-mode";
import type { SubmitOutcome } from "../submit";
import { filledRows } from "../table-journal";
import { formatStationTime } from "../station-time";
import { AlarmsPanel } from "./AlarmsPanel";
import { RoundsPanel } from "./RoundsPanel";
import type { ShiftState } from "./ShiftModeBar";
import { ShiftModeBar } from "./ShiftModeBar";
import { TableJournal } from "./TableJournal";

/**
 * Экран заполнения по эталону `docs/furca/design/screens/fill.html` (класс `.fill`).
 *
 * Компонент клиентский целиком: между касанием и перерисовкой не должно быть похода
 * на сервер — сотрудник стоит на кухне и закрывает пункты подряд (принцип 2).
 * Промежуточного экрана перед отправкой нет: кнопка отправляет сразу (D018).
 */

const SCREEN_CLASS =
  "mx-auto flex min-h-screen w-full max-w-[420px] flex-col bg-surface";
const HEAD_CLASS =
  "sticky top-0 z-2 border-b border-[var(--line-strong)] bg-surface px-[var(--space-7)] pt-[var(--space-7)] pb-[var(--space-6)]";
const TITLE_CLASS =
  "text-[length:var(--fs-display)] leading-[var(--lh-display)] font-semibold";
const WHERE_CLASS =
  "mt-[var(--space-2)] text-[length:var(--fs-meta)] text-[var(--ink-3)]";
// Заголовок секции — h2 ради доступности, но межстрочный интервал взят у эталона:
// общее правило h2 в globals.css даёт 22px, у эталона это обычный div с базовыми 18px.
const SECTION_TITLE_CLASS =
  "px-[var(--space-7)] pt-[var(--space-8)] pb-[var(--space-4)] text-[length:var(--fs-micro)] leading-[var(--lh-body)] font-semibold tracking-[var(--tracking-micro)] text-[var(--ink-3)] uppercase";
const ITEM_CLASS =
  "flex w-full min-h-[var(--tap-min)] items-start gap-[var(--space-6)] border-t border-[var(--line)] px-[var(--space-7)] py-[var(--space-6)] text-left";
// Цвет фона задаётся ТОЛЬКО в `boxTone`: если оставить здесь `bg-surface`, две
// утилиты фона спорят за одно свойство, и порядок решает не разметка, а порядок
// правил в собранном CSS. Проверено в браузере — побеждал белый, отметка
// выполненного пункта оставалась пустой рамкой, а белая галочка на белом фоне
// не была видна вовсе.
const BOX_CLASS =
  "mt-[1px] h-[26px] w-[26px] flex-none rounded-[var(--r-control)] border-[1.5px] bg-center bg-no-repeat";
const TEXT_CLASS =
  "flex-1 text-[length:var(--fs-lead)] leading-[21px] break-words";
const HINT_CLASS =
  "mt-[var(--space-2)] block text-[length:var(--fs-meta)] text-[var(--ink-3)]";
// Рамка поля без кегля: кегль задаёт тот, кто поле ставит. Две утилиты размера на одном
// элементе спорят в собранном CSS, а не в строке классов, и кто победит — из разметки не
// видно вовсе (поймано сторожем геройского вида, `e2e/fill.spec.ts`).
const FIELD_CLASS =
  "w-full rounded-[var(--r-control)] border border-[var(--line-control)] bg-surface px-[var(--space-5)] text-ink focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--focus-soft)] focus:outline-none";
const INPUT_CLASS = `${FIELD_CLASS} text-[length:var(--fs-lead)]`;
/**
 * Геройский вид числового значения — эталон `app.css`, `.item__num .input`. Вид висит
 * на МЕСТЕ числа, а не на состоянии: пустое поле, набранное значение и показание
 * провалившегося пункта читаются одним и тем же взглядом. Отсюда же берётся то, что
 * строка не прыгает, когда поле уступает место записанному показанию.
 */
const NUMBER_LOOK_CLASS =
  "font-num h-[48px] w-full max-w-[120px] text-center text-[length:var(--fs-num-hero)] leading-none font-medium text-ink";
const FOOT_CLASS =
  "sticky bottom-0 mt-auto border-t border-[var(--line-strong)] bg-surface px-[var(--space-7)] pt-[var(--space-6)] pb-[var(--space-8)]";
const BUTTON_CLASS =
  "h-[52px] w-full rounded-[var(--r-block)] border border-[var(--accent)] bg-accent text-[length:var(--fs-title)] leading-none font-medium text-[var(--ink-inverse)] disabled:cursor-not-allowed disabled:opacity-45";
const NOTICE_ERR_CLASS =
  "mb-[var(--space-6)] rounded-[var(--r-block)] border border-[var(--err-line)] bg-[var(--err-soft)] px-[var(--space-7)] py-[var(--space-6)] text-[length:var(--fs-dense)] leading-[var(--lh-dense)] text-err";

// Галочка выполненного пункта: тот же рисунок, что в эталоне (`.item--done .item__box`).
const CHECK_MARK =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='3.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='20 6 9 17 4 12'/%3E%3C/svg%3E\")";

const MINUTE_SECONDS = 60;

/** Что делает отправка. `sending` блокирует кнопку, `offline` оставляет ответы на экране. */
type Phase =
  | { readonly kind: "filling" }
  | { readonly kind: "sending" }
  | { readonly kind: "failed"; readonly notice: string }
  | {
      readonly kind: "sent";
      readonly outcome: Extract<SubmitOutcome, { kind: "saved" }>;
    };

export interface FillFormProps {
  readonly view: FillScreenView;
  readonly code: string;
  readonly versionId: string;
  /**
   * Пропуск, выданный сервером вместе с этим экраном. Внутри — серверное время
   * выдачи и подпись; экран не читает его и не трогает, а возвращает как есть.
   * Начало заполнения берётся оттуда, а не с часов устройства: длительность,
   * названную браузером, подделывает кто угодно (D003 — кроме неё, о сотруднике
   * не собирается ничего).
   */
  readonly ticket: string;
  readonly stationName: string;
  readonly storeName: string;
  /**
   * Часовой пояс пиццерии: время отправки принадлежит кухне, а не телефону.
   * Телефон сотрудника может ехать из другой страны — и тогда «отправлено в 23:52»
   * назвало бы час, которого на этой кухне не было.
   */
  readonly timeZone: string;
  /** Режим сегодняшней смены и то, ставил ли его кто-нибудь (D055). */
  readonly shift: ShiftState;
  /** Серверное действие смены режима: тот же адрес `/s/<код>`. */
  readonly choose: (input: unknown) => Promise<ShiftModeOutcome>;
  /** Серверное действие: POST уходит на тот же адрес `/s/<код>`. */
  readonly submit: (input: unknown) => Promise<SubmitOutcome>;
  /** Обходы станции: отдельная панель, в форму эти пункты не входят (D076). */
  readonly rounds: RoundsPanelView;
  /** Серверное действие отметки обхода: тот же адрес `/s/<код>`. */
  readonly mark: (input: unknown) => Promise<RoundOutcome>;
  /** Будильники станции на сегодня: записка под рукой, а не пункт чек-листа (D070). */
  readonly alarms: readonly AlarmView[];
  /** Серверные действия будильника: тот же адрес `/s/<код>`. */
  readonly addAlarm: (input: unknown) => Promise<AlarmOutcome>;
  readonly dropAlarm: (input: unknown) => Promise<AlarmOutcome>;
}

type Translate = ReturnType<typeof useTranslations>;

function boxTone(state: "unanswered" | "yes" | "no"): string {
  if (state === "yes") {
    return "border-[var(--ok)] bg-[var(--ok)] bg-[length:16px_16px]";
  }
  if (state === "no") return "border-[var(--err)] bg-[var(--err)]";
  return "border-[var(--line-control-2)] bg-surface";
}

/** Один шаг по кругу: не отвечено → выполнено → не выполнено → не отвечено. */
function nextBool(current: boolean | null): boolean | null {
  if (current === null) return true;
  return current ? false : null;
}

function numberOf(entry: DraftAnswer | undefined): number | null {
  return typeof entry?.value === "number" ? entry.value : null;
}

/** Что стоит в числовом поле. Значение чужого рода полем не показывается вовсе. */
function numberText(entry: DraftAnswer | undefined): string {
  const value = numberOf(entry);
  return value === null ? "" : String(value);
}

/** Строки журнала из черновика ответа; ещё не начатый журнал — пустой список. */
function rowsOf(entry: DraftAnswer | undefined): readonly TableRow[] {
  return Array.isArray(entry?.value) ? entry.value : [];
}

/**
 * Подпись у числового поля: сперва сами границы с единицей измерения
 * («-22…-10 °C»), затем — когда значение набрано — попадание в границы. Границы
 * стоят ЗДЕСЬ, а не в подсказке под названием: знать допустимое надо в минуту
 * набора, а не после того, как продукт назвал значение провалом и потребовал
 * комментарий (эталон `fill.html`, «°C · within range»). Единица встаёт к ним
 * вплотную и только сюда (D110): подсказка под названием принадлежит методисту, а
 * дважды названная единица — тот же факт на двух уровнях экрана.
 *
 * Пункт без границ молчит: писать «в диапазоне» там, где диапазона нет, значит
 * выдумывать оценку. Пункт без единицы выглядит ровно как до её появления —
 * пустые куски выброшены, разделителя в никуда не остаётся.
 */
function rangeLabel(
  view: FillItemView,
  item: Item | undefined,
  entry: DraftAnswer | undefined,
  failed: boolean,
  t: Translate,
): string {
  const verdict =
    item === undefined || rangeVerdict(item, numberOf(entry)) === "unbounded"
      ? ""
      : failed
        ? t("outsideRange")
        : t("withinRange");
  const measure = [view.range ?? "", view.unit ?? ""]
    .filter((part) => part !== "")
    .join(" ");
  return [measure, verdict].filter((part) => part !== "").join(" · ");
}

function ItemBody({
  item,
  state,
  t,
}: {
  readonly item: FillItemView;
  readonly state: "unanswered" | "yes" | "no";
  readonly t: Translate;
}): ReactElement {
  return (
    <>
      <span
        className={`${BOX_CLASS} ${boxTone(state)}`}
        style={state === "yes" ? { backgroundImage: CHECK_MARK } : undefined}
      />
      <span className={TEXT_CLASS}>
        {item.title}
        {item.severity === "normal" ? null : (
          <span
            className={`ml-[var(--space-2)] font-bold ${
              item.severity === "critical"
                ? "text-[var(--warn-mark)]"
                : "text-[var(--ink-3)]"
            }`}
          >
            !
          </span>
        )}
        {item.hint === null ? null : (
          <span className={HINT_CLASS}>{item.hint}</span>
        )}
        {item.severity === "normal" ? null : (
          <span className={HINT_CLASS}>
            {t(item.severity === "critical" ? "criticalHint" : "majorHint")}
          </span>
        )}
      </span>
    </>
  );
}

export function FillForm({
  view,
  code,
  versionId,
  ticket,
  stationName,
  storeName,
  timeZone,
  shift,
  choose,
  submit,
  rounds,
  mark,
  alarms,
  addAlarm,
  dropAlarm,
}: FillFormProps): ReactElement {
  const t = useTranslations("fill");
  // Язык экрана, а не язык телефона: его посчитала цепочка `storeLocales` и
  // отдал провайдер серверной части. Формат часа при этом всё равно круглосуточный —
  // см. `formatStationTime`.
  const locale = asLocale(useLocale());
  const [draft, setDraft] = useState<FillDraft>(emptyDraft);
  const [phase, setPhase] = useState<Phase>({ kind: "filling" });
  // Пункты для счёта: те же правила провала, что у ленты управляющего (`isFailed`).
  const sections = useMemo(() => gradingSections(view), [view]);
  const itemsById = useMemo(() => gradingItemsById(view), [view]);

  const summary = useMemo(
    () => summarizeFill(sections, draft),
    [sections, draft],
  );

  const setEntry = useCallback(
    (itemId: string, patch: Partial<DraftAnswer>) => {
      setDraft((current) => {
        const previous = current[itemId] ?? {
          value: null,
          comment: "",
          at: Date.now(),
        };
        return {
          ...current,
          [itemId]: { ...previous, ...patch, at: Date.now() },
        };
      });
    },
    [],
  );

  const send = useCallback(async () => {
    setPhase({ kind: "sending" });
    try {
      const outcome = await submit({
        code,
        versionId,
        ticket,
        answers: toAnswers(sections, draft),
      });

      if (outcome.kind === "saved") {
        setPhase({ kind: "sent", outcome });
        return;
      }

      if (outcome.reason === "rate-limited") {
        setPhase({
          kind: "failed",
          notice: t("refused.tooOften", {
            minutes: Math.max(
              1,
              Math.ceil(outcome.retryAfterSeconds / MINUTE_SECONDS),
            ),
          }),
        });
        return;
      }
      // Просроченный пропуск — единственный отказ, который лечится действием
      // сотрудника: экран провисел открытым больше суток, и сказать ему надо
      // «обновите страницу», а не «сервер сломался».
      setPhase({
        kind: "failed",
        notice:
          outcome.reason === "unknown-code"
            ? t("refused.gone")
            : outcome.reason === "stale"
              ? t("refused.stale")
              : t("refused.broken"),
      });
    } catch {
      // Связь оборвалась. Ответы никуда не делись — они в состоянии этого компонента,
      // экран остаётся тем же, и кнопка предлагает повторить (критерий готовности 7).
      setPhase({ kind: "failed", notice: t("offline.text") });
    }
  }, [submit, code, versionId, ticket, sections, draft, t]);

  if (phase.kind === "sent") {
    const { outcome } = phase;
    const meta = [
      t("sent.where", { station: stationName, store: storeName }),
      t("sent.meta", {
        time: formatStationTime(outcome.submittedAt, timeZone, locale),
        duration: formatDuration(outcome.durationMs),
      }),
    ];
    return (
      <StateScreen
        testId="fill-sent"
        tone="ok"
        title={t("sent.title")}
        meta={meta}
        {...(outcome.failedCritical > 0
          ? { notice: t("sent.failed", { count: outcome.failedCritical }) }
          : {})}
      />
    );
  }

  const percent =
    view.totalItems === 0
      ? 0
      : Math.round((summary.answered / view.totalItems) * 100);

  const buttonLabel = (): string => {
    if (phase.kind === "sending") return t("sending");
    if (phase.kind === "failed") return t("offline.retry");
    if (summary.remaining > 0) return t("left", { count: summary.remaining });
    if (summary.needsCommentItemIds.length > 0) return t("needComment");
    return t("finish");
  };

  return (
    <main data-testid="fill-screen" className={SCREEN_CLASS}>
      <header className={HEAD_CLASS}>
        <div data-testid="fill-title" className={TITLE_CLASS}>
          {view.checklistTitle}
        </div>
        <div className={WHERE_CLASS}>{view.where}</div>
        <div className="mt-[var(--space-4)]">
          <ShiftModeBar code={code} shift={shift} choose={choose} />
        </div>
        <div className="mt-[var(--space-6)] flex items-center gap-[var(--space-5)]">
          <span
            data-testid="fill-progress"
            className="h-[4px] flex-1 overflow-hidden rounded-[var(--r-pill)] bg-[var(--surface-3)]"
          >
            <i
              className="bg-accent block h-full"
              style={{ width: `${String(percent)}%` }}
            />
          </span>
          <span
            data-testid="fill-count"
            className="text-[length:var(--fs-meta)] whitespace-nowrap text-[var(--ink-2)]"
          >
            {t("progress", { done: summary.answered, total: view.totalItems })}
          </span>
        </div>
      </header>

      {view.sections.map((section) => (
        <section key={section.id}>
          {section.title === "" ? null : (
            <h2 className={SECTION_TITLE_CLASS}>{section.title}</h2>
          )}
          {section.items.map((item) => {
            const entry = draft[item.id];
            const failed = summary.failedItemIds.includes(item.id);
            // Журнал, в котором завели строку и ничего не вписали, отвеченным не
            // считается — ровно как его считает счёт на кнопке (`summarizeFill`),
            // иначе квадратик пункта и кнопка отправки спорили бы между собой.
            const empty =
              item.type === "table"
                ? filledRows(rowsOf(entry)).length === 0
                : entry?.value == null;
            const state = empty ? "unanswered" : failed ? "no" : "yes";
            // Одно условие на блок комментария и на уступающее ему поле ввода: два
            // условия про одно и то же разъезжаются, и экран показывает оба сразу.
            const commentOpen = failed && item.severity !== "normal";
            const stateWord = t(`state.${state}`);

            return (
              <div key={item.id}>
                {item.type === "bool" ? (
                  <button
                    type="button"
                    data-testid="fill-item"
                    data-item-id={item.id}
                    data-state={state}
                    aria-label={`${item.title} — ${stateWord}`}
                    className={ITEM_CLASS}
                    onClick={() => {
                      setEntry(item.id, {
                        value: nextBool(
                          typeof entry?.value === "boolean"
                            ? entry.value
                            : null,
                        ),
                      });
                    }}
                  >
                    <ItemBody item={item} state={state} t={t} />
                  </button>
                ) : (
                  <div
                    data-testid="fill-item"
                    data-item-id={item.id}
                    data-state={state}
                    className={ITEM_CLASS}
                  >
                    <ItemBody item={item} state={state} t={t} />
                  </div>
                )}

                {item.type === "number" ? (
                  <div className="mx-[var(--space-7)] mb-[var(--space-6)] flex items-center gap-[var(--space-4)]">
                    {commentOpen ? (
                      // Замер уже сделан, и объяснять надо его, а не переписывать: поле
                      // рядом с блоком комментария предлагает ровно обратное (эталон
                      // `fill.html`, состояние «Критичный пункт не выполнен» — там
                      // показание стоит текстом, поля ввода нет).
                      <span
                        data-testid="fill-number-value"
                        data-item-id={item.id}
                        className={`${NUMBER_LOOK_CLASS} flex items-center justify-center`}
                      >
                        {numberText(entry)}
                      </span>
                    ) : (
                      <input
                        data-testid="fill-number"
                        data-item-id={item.id}
                        inputMode="decimal"
                        aria-label={item.title}
                        placeholder={t("numberPlaceholder")}
                        className={`${FIELD_CLASS} ${NUMBER_LOOK_CLASS}`}
                        value={numberText(entry)}
                        onChange={(event) => {
                          const raw = event.target.value.replace(",", ".");
                          const parsed = Number(raw);
                          setEntry(item.id, {
                            value:
                              raw.trim() === "" || !Number.isFinite(parsed)
                                ? null
                                : parsed,
                          });
                        }}
                      />
                    )}
                    <span
                      data-testid="fill-number-range"
                      data-item-id={item.id}
                      className="text-[length:var(--fs-meta)] text-[var(--ink-3)]"
                    >
                      {rangeLabel(
                        item,
                        itemsById.get(item.id),
                        entry,
                        failed,
                        t,
                      )}
                    </span>
                  </div>
                ) : null}

                {item.type === "table" ? (
                  <TableJournal
                    item={item}
                    rows={rowsOf(entry)}
                    onChange={(rows) => {
                      setEntry(item.id, { value: rows });
                    }}
                  />
                ) : null}

                {item.type === "text" ? (
                  <div className="mx-[var(--space-7)] mb-[var(--space-6)]">
                    <input
                      data-testid="fill-text"
                      data-item-id={item.id}
                      aria-label={item.title}
                      placeholder={t("textPlaceholder")}
                      className={`${INPUT_CLASS} h-[var(--tap-min)]`}
                      value={
                        typeof entry?.value === "string" ? entry.value : ""
                      }
                      onChange={(event) => {
                        setEntry(item.id, { value: event.target.value });
                      }}
                    />
                  </div>
                ) : null}

                {commentOpen ? (
                  <div className="mx-[var(--space-7)] mb-[var(--space-6)] rounded-[var(--r-block)] border border-[var(--err-line)] bg-[var(--err-soft)] p-[var(--space-6)]">
                    <label
                      htmlFor={`comment-${item.id}`}
                      className="mb-[var(--space-3)] block text-[length:var(--fs-micro)] leading-[var(--lh-micro)] font-semibold tracking-[var(--tracking-micro)] text-[var(--ink-3)] uppercase"
                    >
                      {t("failLabel")}
                    </label>
                    <input
                      id={`comment-${item.id}`}
                      data-testid="fill-comment"
                      data-item-id={item.id}
                      className={`${INPUT_CLASS} h-[var(--tap-min)]`}
                      value={entry?.comment ?? ""}
                      onChange={(event) => {
                        setEntry(item.id, { comment: event.target.value });
                      }}
                    />
                    <span className="mt-[var(--space-3)] block text-[length:var(--fs-meta)] text-[var(--ink-3)]">
                      {t("failHint")}
                    </span>
                  </div>
                ) : null}
              </div>
            );
          })}
        </section>
      ))}

      <RoundsPanel
        panel={rounds}
        code={code}
        versionId={versionId}
        mark={mark}
      />

      <AlarmsPanel
        alarms={alarms}
        code={code}
        add={addAlarm}
        drop={dropAlarm}
      />

      {/* Подвал с отправкой нужен только тем, кому есть что отправлять. Станция,
          где остались одни обходы, отправляет каждый обход отдельно, и кнопка
          «Готово» на ней означала бы пустое заполнение. */}
      {view.totalItems === 0 && rounds.items.length > 0 ? null : (
        <div className={FOOT_CLASS}>
          {phase.kind === "failed" ? (
            <p
              data-testid="fill-notice"
              role="alert"
              className={NOTICE_ERR_CLASS}
            >
              {phase.notice}
            </p>
          ) : null}
          <button
            type="button"
            data-testid="fill-submit"
            className={BUTTON_CLASS}
            disabled={!summary.canSubmit || phase.kind === "sending"}
            onClick={() => {
              void send();
            }}
          >
            {buttonLabel()}
          </button>
        </div>
      )}
    </main>
  );
}
