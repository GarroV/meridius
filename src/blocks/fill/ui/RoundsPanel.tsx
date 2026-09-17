"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import type { ReactElement } from "react";

import type { RoundsPanelView, RoundSummaryView } from "../model";
import type { RoundOutcome } from "../rounds";
import { OverduePlate } from "./OverduePlate";

/**
 * Обходы на экране станции (D076).
 *
 * Одна строка на пункт: ближайшее время и состояние — ровно столько, сколько нужно,
 * чтобы решить, идти сейчас или нет. Сетка часов сюда не возвращается: на бумаге её
 * рисуют потому, что иначе регулярность не покажешь, а здесь она уехала в отчёт (D065).
 *
 * Список отметок за сегодня разворачивается ПРЯМО ЗДЕСЬ, без входа в кабинет (D077):
 * проверить свою смену должен уметь тот, кто на ней стоит. Развёрнутый список — обычный
 * `<details>`: он раскрывается и без JavaScript, потому что кухонный планшет — не место
 * для догадок о том, что у него включено.
 */

const MINUTE_SECONDS = 60;

const PANEL_CLASS = "border-t-[6px] border-[var(--surface-3)]";
const HEAD_CLASS =
  "px-[var(--space-7)] pt-[var(--space-8)] pb-[var(--space-4)] text-[length:var(--fs-micro)] leading-[var(--lh-body)] font-semibold tracking-[var(--tracking-micro)] text-[var(--ink-3)] uppercase";
const ROW_CLASS =
  "border-t border-[var(--line)] px-[var(--space-7)] py-[var(--space-6)]";
const TITLE_CLASS =
  "text-[length:var(--fs-lead)] leading-[21px] font-semibold break-words";
const HEADLINE_CLASS = "mt-[var(--space-2)] text-[length:var(--fs-meta)]";
const NOTE_CLASS =
  "mt-[var(--space-1)] text-[length:var(--fs-meta)] text-[var(--ink-3)]";
const ACTIONS_CLASS = "mt-[var(--space-5)] flex flex-wrap gap-[var(--space-4)]";
const BUTTON_CLASS =
  "min-h-[var(--tap-min)] cursor-pointer rounded-[var(--r-control)] border border-[var(--line-control)] bg-surface px-[var(--space-6)] text-[length:var(--fs-lead)] transition-colors hover:border-[var(--accent-line)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:cursor-default disabled:opacity-60";
const PRIMARY_CLASS = "border-[var(--accent)] text-[var(--accent)]";
const INPUT_CLASS =
  "min-h-[var(--tap-min)] w-full rounded-[var(--r-control)] border border-[var(--line-control)] bg-surface px-[var(--space-5)] text-[length:var(--fs-lead)] text-ink focus:border-[var(--accent)] focus:outline-none";
const DETAILS_CLASS = "mt-[var(--space-5)]";
const SUMMARY_CLASS =
  "min-h-[var(--tap-min)] cursor-pointer list-none py-[var(--space-3)] text-[length:var(--fs-meta)] text-[var(--accent)] underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";
const MARK_ROW_CLASS =
  "flex flex-wrap items-baseline gap-x-[var(--space-4)] border-t border-[var(--line)] py-[var(--space-4)] text-[length:var(--fs-meta)]";
const HINT_CLASS =
  "px-[var(--space-7)] pt-[var(--space-5)] pb-[var(--space-6)] text-[length:var(--fs-meta)] text-[var(--ink-3)]";
const NOTICE_CLASS =
  "mt-[var(--space-4)] rounded-[var(--r-block)] border border-[var(--err-line)] bg-[var(--err-soft)] px-[var(--space-6)] py-[var(--space-5)] text-[length:var(--fs-dense)] text-[var(--err)]";

const TONE_CLASS: Record<RoundSummaryView["state"], string> = {
  due: "text-[var(--accent)]",
  done: "text-[var(--ok)]",
  waiting: "text-[var(--ink-3)]",
  finished: "text-[var(--ink-3)]",
};

export interface RoundsPanelProps {
  readonly panel: RoundsPanelView;
  readonly code: string;
  readonly versionId: string;
  /**
   * Действие передаётся сверху, а не импортируется здесь: так панель проверяется
   * без серверной части — тем же приёмом, что `FillForm` и `ShiftModeBar`.
   */
  readonly mark: (input: unknown) => Promise<RoundOutcome>;
}

/** Что сейчас делает строка обхода: ждёт, отправляет или показывает отказ. */
type RowPhase =
  | { readonly kind: "idle" }
  | { readonly kind: "sending" }
  | { readonly kind: "failed"; readonly notice: string };

export function RoundsPanel({
  panel,
  code,
  versionId,
  mark,
}: RoundsPanelProps): ReactElement | null {
  const t = useTranslations("fill.rounds");
  const router = useRouter();
  const [phases, setPhases] = useState<Record<string, RowPhase>>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  // Строка, где сотрудник сказал «непорядок»: под ней раскрывается поле объяснения.
  const [failing, setFailing] = useState<string | null>(null);

  const send = useCallback(
    async (item: RoundSummaryView, value: boolean | number | string) => {
      const comment = comments[item.itemId] ?? "";
      setPhases((current) => ({
        ...current,
        [item.itemId]: { kind: "sending" },
      }));
      try {
        const outcome = await mark({
          code,
          versionId,
          itemId: item.itemId,
          value,
          ...(comment.trim() === "" ? {} : { comment: comment.trim() }),
        });

        if (outcome.kind === "marked") {
          setPhases((current) => ({
            ...current,
            [item.itemId]: { kind: "idle" },
          }));
          setFailing(null);
          setComments((current) => ({ ...current, [item.itemId]: "" }));
          setValues((current) => ({ ...current, [item.itemId]: "" }));
          // Состояние обходов считает сервер: перерисовываем страницу его ответом,
          // а не своей догадкой о том, какой час теперь идёт.
          router.refresh();
          return;
        }

        const notice =
          outcome.reason === "rate-limited"
            ? t("refused.tooOften", {
                minutes: Math.max(
                  1,
                  Math.ceil(outcome.retryAfterSeconds / MINUTE_SECONDS),
                ),
              })
            : outcome.reason === "comment-required"
              ? t("refused.needComment")
              : outcome.reason === "no-round"
                ? t("refused.noRound")
                : t("refused.broken");
        setPhases((current) => ({
          ...current,
          [item.itemId]: { kind: "failed", notice },
        }));
      } catch {
        // Связь оборвалась. Введённое никуда не делось, и кнопка предлагает повторить.
        setPhases((current) => ({
          ...current,
          [item.itemId]: { kind: "failed", notice: t("refused.offline") },
        }));
      }
    },
    [mark, code, versionId, comments, router, t],
  );

  if (panel.items.length === 0) return null;

  return (
    <section data-testid="rounds-panel" className={PANEL_CLASS}>
      <h2 className={HEAD_CLASS}>{t("title")}</h2>

      <OverduePlate
        overdue={panel.overdue}
        nextChangeInSeconds={panel.nextChangeInSeconds}
      />

      {panel.items.map((item) => {
        const phase = phases[item.itemId] ?? { kind: "idle" };
        const pending = phase.kind === "sending";
        const raw = values[item.itemId] ?? "";
        const showComment = failing === item.itemId || item.commentOnFailure;

        return (
          <div
            key={item.itemId}
            data-testid={`round-${item.itemId}`}
            data-state={item.state}
            className={ROW_CLASS}
          >
            <div className={TITLE_CLASS}>{item.title}</div>
            <div
              data-testid={`round-headline-${item.itemId}`}
              className={`${HEADLINE_CLASS} ${TONE_CLASS[item.state]}`}
            >
              {item.headline}
            </div>
            {item.note === null ? null : (
              <div className={NOTE_CLASS}>{item.note}</div>
            )}

            {item.canMark ? (
              <div className={ACTIONS_CLASS}>
                {item.type === "bool" ? (
                  <>
                    <button
                      type="button"
                      className={`${BUTTON_CLASS} ${PRIMARY_CLASS}`}
                      disabled={pending}
                      onClick={() => void send(item, true)}
                    >
                      {t("markOk")}
                    </button>
                    <button
                      type="button"
                      className={BUTTON_CLASS}
                      disabled={pending}
                      onClick={() => {
                        if (failing === item.itemId) {
                          void send(item, false);
                          return;
                        }
                        // Первое касание раскрывает объяснение, второе отправляет:
                        // провал без единого слова о причине управляющему бесполезен.
                        setFailing(item.itemId);
                      }}
                    >
                      {failing === item.itemId
                        ? t("sendFailure")
                        : t("markBad")}
                    </button>
                  </>
                ) : (
                  <>
                    <label
                      className="sr-only"
                      htmlFor={`round-v-${item.itemId}`}
                    >
                      {item.title}
                    </label>
                    <input
                      id={`round-v-${item.itemId}`}
                      className={INPUT_CLASS}
                      inputMode={item.type === "number" ? "decimal" : "text"}
                      value={raw}
                      onChange={(event) => {
                        const next = event.target.value;
                        setValues((current) => ({
                          ...current,
                          [item.itemId]: next,
                        }));
                      }}
                    />
                    <button
                      type="button"
                      className={`${BUTTON_CLASS} ${PRIMARY_CLASS}`}
                      disabled={pending || raw.trim() === ""}
                      onClick={() => {
                        const value =
                          item.type === "number" ? Number(raw) : raw.trim();
                        if (item.type === "number" && !Number.isFinite(value)) {
                          setPhases((current) => ({
                            ...current,
                            [item.itemId]: {
                              kind: "failed",
                              notice: t("refused.broken"),
                            },
                          }));
                          return;
                        }
                        void send(item, value);
                      }}
                    >
                      {t("mark")}
                    </button>
                  </>
                )}
              </div>
            ) : null}

            {item.canMark && showComment && failing === item.itemId ? (
              <div className="mt-[var(--space-4)]">
                <label className="sr-only" htmlFor={`round-c-${item.itemId}`}>
                  {t("commentLabel")}
                </label>
                <input
                  id={`round-c-${item.itemId}`}
                  className={INPUT_CLASS}
                  placeholder={t("commentPlaceholder")}
                  value={comments[item.itemId] ?? ""}
                  onChange={(event) => {
                    const next = event.target.value;
                    setComments((current) => ({
                      ...current,
                      [item.itemId]: next,
                    }));
                  }}
                />
              </div>
            ) : null}

            {phase.kind === "failed" ? (
              <div
                data-testid={`round-notice-${item.itemId}`}
                className={NOTICE_CLASS}
              >
                {phase.notice}
              </div>
            ) : null}

            {item.marks.length === 0 ? null : (
              <details className={DETAILS_CLASS}>
                <summary
                  data-testid={`round-expand-${item.itemId}`}
                  className={SUMMARY_CLASS}
                >
                  {t("expand", { count: item.marks.length })}
                </summary>
                <div data-testid={`round-marks-${item.itemId}`}>
                  {item.marks.map((entry, index) => (
                    <div
                      key={`${entry.interval}-${entry.at}-${String(index)}`}
                      className={MARK_ROW_CLASS}
                    >
                      <span className="font-[family-name:var(--font-num)]">
                        {entry.interval}
                      </span>
                      <span
                        className={
                          entry.failed
                            ? "text-[var(--err)]"
                            : "text-[var(--ink-2)]"
                        }
                      >
                        {entry.value}
                      </span>
                      <span className="text-[var(--ink-3)]">
                        {t("doneAt", { time: entry.at })}
                      </span>
                      {entry.comment === null ? null : (
                        <span className="w-full text-[var(--ink-2)]">
                          {entry.comment}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        );
      })}

      {panel.ringsOnMiss ? (
        <p data-testid="rounds-remind-hint" className={HINT_CLASS}>
          {t("remindHint")}
        </p>
      ) : null}
    </section>
  );
}
