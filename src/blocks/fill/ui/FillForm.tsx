"use client";

import { useTranslations } from "next-intl";
import { useCallback, useMemo, useState } from "react";
import type { ReactElement } from "react";

import type { Item } from "@/blocks/data";

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
import type { RoundOutcome } from "../rounds";
import type { ShiftModeOutcome } from "../shift-mode";
import type { SubmitOutcome } from "../submit";
import { RoundsPanel } from "./RoundsPanel";
import type { ShiftState } from "./ShiftModeBar";
import { ShiftModeBar } from "./ShiftModeBar";
import { StateScreen } from "./StateScreen";

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
const INPUT_CLASS =
  "w-full rounded-[var(--r-control)] border border-[var(--line-control)] bg-surface px-[var(--space-5)] text-[length:var(--fs-lead)] text-ink focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--focus-soft)] focus:outline-none";
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
const SECONDS_IN_MS = 1000;

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
  readonly stationName: string;
  readonly storeName: string;
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

function formatDuration(durationMs: number): string {
  const total = Math.round(durationMs / SECONDS_IN_MS);
  const minutes = Math.floor(total / MINUTE_SECONDS);
  const seconds = total % MINUTE_SECONDS;
  return `${String(minutes)}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Подпись под числовым полем: «в диапазоне» / «вне диапазона». Пункт без границ
 * молчит — писать «в диапазоне» там, где диапазона нет, значит выдумывать оценку.
 */
function rangeLabel(
  item: Item | undefined,
  entry: DraftAnswer | undefined,
  failed: boolean,
  t: Translate,
): string {
  if (item === undefined) return "";
  if (rangeVerdict(item, numberOf(entry)) === "unbounded") return "";
  return failed ? t("outsideRange") : t("withinRange");
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
  stationName,
  storeName,
  shift,
  choose,
  submit,
  rounds,
  mark,
}: FillFormProps): ReactElement {
  const t = useTranslations("fill");
  const [draft, setDraft] = useState<FillDraft>(emptyDraft);
  const [phase, setPhase] = useState<Phase>({ kind: "filling" });
  // Момент открытия экрана: длительность заполнения считается от него (D003 —
  // ничего, кроме длительности, о сотруднике не собираем).
  const [startedAt] = useState(() => Date.now());

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
        startedAt,
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
      setPhase({
        kind: "failed",
        notice:
          outcome.reason === "unknown-code"
            ? t("refused.gone")
            : t("refused.broken"),
      });
    } catch {
      // Связь оборвалась. Ответы никуда не делись — они в состоянии этого компонента,
      // экран остаётся тем же, и кнопка предлагает повторить (критерий готовности 7).
      setPhase({ kind: "failed", notice: t("offline.text") });
    }
  }, [submit, code, versionId, startedAt, sections, draft, t]);

  if (phase.kind === "sent") {
    const { outcome } = phase;
    const meta = [
      t("sent.where", { station: stationName, store: storeName }),
      t("sent.meta", {
        time: new Date(outcome.submittedAt).toLocaleTimeString(undefined, {
          hour: "2-digit",
          minute: "2-digit",
        }),
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
            className="h-[4px] flex-1 overflow-hidden rounded-full bg-[var(--surface-3)]"
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
            const state =
              entry?.value == null ? "unanswered" : failed ? "no" : "yes";
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
                    <input
                      data-testid="fill-number"
                      data-item-id={item.id}
                      inputMode="decimal"
                      aria-label={item.title}
                      placeholder={t("numberPlaceholder")}
                      className={`${INPUT_CLASS} font-num h-[48px] max-w-[120px] text-center text-[length:var(--fs-num-hero)] font-medium`}
                      value={
                        entry?.value === null || entry?.value === undefined
                          ? ""
                          : String(entry.value)
                      }
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
                    <span className="text-[length:var(--fs-meta)] text-[var(--ink-3)]">
                      {rangeLabel(itemsById.get(item.id), entry, failed, t)}
                    </span>
                  </div>
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

                {failed && item.severity !== "normal" ? (
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
