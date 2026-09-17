"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import type { ReactElement } from "react";

import type { ShiftMode } from "@/blocks/data";

import type { ShiftModeOutcome } from "../shift-mode";

/**
 * Строка режима смены в шапке экрана заполнения и панель его смены (D055).
 *
 * Путь сотрудника не удлиняется: чек-лист открывается сразу, полной сменой по
 * умолчанию, а строка лишь говорит, в каком режиме он сейчас. Сокращает тот, кто
 * решает, — одним касанием, и это касание попадает в историю (D052: гейта нет,
 * удерживает видимость).
 */

const MINUTE_SECONDS = 60;
const MAX_STAFF_INPUT_LENGTH = 3;

/** Порядок кнопок: сверху полная смена, вниз — по мере сокращения. */
const MODES: readonly ShiftMode[] = ["normal", "reduced", "critical"];

const BAR_CLASS =
  "flex flex-wrap items-baseline gap-x-[var(--space-4)] gap-y-[var(--space-2)] text-[length:var(--fs-dense)] text-[var(--ink-2)]";
// «Сменить» выглядит ссылкой, но палец на кухонном планшете об этом не знает: это
// такая же кнопка, как остальные, и зона нажатия у неё не меньше var(--tap-min)
// (критерий 10). Была 51x18 — вдвое ниже требуемого (T176). Растёт только высота
// коробки: отступов по бокам нет, поэтому строка шапки не разъезжается.
const CHANGE_CLASS =
  "inline-flex min-h-[var(--tap-min)] min-w-[var(--tap-min)] cursor-pointer items-center justify-center rounded-[var(--r-mark)] border-0 bg-transparent p-0 text-[length:var(--fs-dense)] text-[var(--accent)] underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";

const PANEL_CLASS =
  "mt-[var(--space-6)] flex flex-col gap-[var(--space-5)] rounded-[var(--r-block)] border border-[var(--line)] bg-[var(--surface-2)] p-[var(--space-6)]";
// Зона нажатия не меньше var(--tap-min): экран рассчитан на кухню и занятые руки.
const CHOICE_CLASS =
  "flex min-h-[var(--tap-min)] w-full cursor-pointer flex-col items-start gap-[var(--space-2)] rounded-[var(--r-block)] border border-[var(--line-control)] bg-surface px-[var(--space-6)] py-[var(--space-5)] text-left transition-colors hover:border-[var(--accent-line)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-45";
const CHOICE_SELECTED_CLASS =
  "border-[var(--accent)] shadow-[0_0_0_3px_var(--focus-soft)]";
const CHOICE_TITLE_CLASS =
  "text-[length:var(--fs-lead)] font-semibold text-[var(--ink)]";
const CHOICE_HINT_CLASS = "text-[length:var(--fs-dense)] text-[var(--ink-2)]";

const STAFF_ROW_CLASS = "flex items-end gap-[var(--space-5)]";
const STAFF_LABEL_CLASS =
  "mb-[var(--space-3)] block text-[length:var(--fs-micro)] leading-[var(--lh-micro)] font-semibold tracking-[var(--tracking-micro)] text-[var(--ink-3)] uppercase";
// Высота полей — var(--tap-min), а не var(--control-h): 32 px это рост поля на
// экране управляющего за столом, а здесь по нему попадают пальцем (критерий 10).
const STAFF_INPUT_CLASS =
  "text-ink bg-surface h-[var(--tap-min)] w-[72px] rounded-[var(--r-control)] border border-[var(--line-control)] text-center font-[family-name:var(--font-num)] text-[length:var(--fs-num-sm)] focus:border-[var(--accent)] focus:outline-none";
const NOTICE_CLASS =
  "rounded-[var(--r-block)] border border-[var(--err-line)] bg-[var(--err-soft)] px-[var(--space-6)] py-[var(--space-5)] text-[length:var(--fs-dense)] text-[var(--err)]";

/** Что известно экрану о сегодняшней смене. */
export interface ShiftState {
  readonly mode: ShiftMode;
  /** Ставил ли кто-нибудь режим сегодня, или работает полная смена по умолчанию. */
  readonly chosen: boolean;
}

export interface ShiftModeBarProps {
  readonly code: string;
  readonly shift: ShiftState;
  /**
   * Действие передаётся сверху, а не импортируется здесь: так компонент проверяется
   * без серверной части — тем же приёмом, что `FillForm` с приёмом заполнения.
   */
  readonly choose: (input: unknown) => Promise<ShiftModeOutcome>;
}

/** Только цифры и не больше трёх: поле подписи, а не расчёта. */
function digitsOnly(raw: string): string {
  return raw.replaceAll(/\D/gu, "").slice(0, MAX_STAFF_INPUT_LENGTH);
}

export function ShiftModeBar({
  code,
  shift,
  choose,
}: ShiftModeBarProps): ReactElement {
  const t = useTranslations("fill.shift");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [staffPresent, setStaffPresent] = useState("");
  const [staffExpected, setStaffExpected] = useState("");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const pick = useCallback(
    async (mode: ShiftMode) => {
      setPending(true);
      setNotice(null);
      try {
        const outcome = await choose({
          code,
          mode,
          staffPresent,
          staffExpected,
        });

        if (outcome.kind === "set") {
          // Страница перечитывается, а не переставляется состояние здесь: список
          // пунктов собирает сервер по режиму, и показанное иначе разошлось бы с
          // записанным.
          router.refresh();
          setOpen(false);
          return;
        }

        setNotice(
          outcome.reason === "rate-limited"
            ? t("refused.tooOften", {
                minutes: Math.max(
                  1,
                  Math.ceil(outcome.retryAfterSeconds / MINUTE_SECONDS),
                ),
              })
            : t("refused.failed"),
        );
      } catch {
        // Обрыв связи не уводит с экрана: заполненное на месте, можно нажать снова.
        setNotice(t("refused.offline"));
      } finally {
        setPending(false);
      }
    },
    [choose, code, staffPresent, staffExpected, router, t],
  );

  return (
    <div data-testid="shift-bar" data-mode={shift.mode}>
      <p className={BAR_CLASS}>
        <span>{t("current", { mode: t(`mode.${shift.mode}`) })}</span>
        <button
          type="button"
          data-testid="shift-change"
          className={CHANGE_CLASS}
          aria-expanded={open}
          onClick={() => {
            setOpen((current) => !current);
            setNotice(null);
          }}
        >
          {open ? t("close") : t("change")}
        </button>
      </p>

      {!open ? null : (
        <div className={PANEL_CLASS} data-testid="shift-panel">
          {MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              data-testid={`shift-mode-${mode}`}
              data-selected={mode === shift.mode ? "true" : "false"}
              className={`${CHOICE_CLASS} ${mode === shift.mode ? CHOICE_SELECTED_CLASS : ""}`}
              disabled={pending}
              onClick={() => {
                void pick(mode);
              }}
            >
              <span className={CHOICE_TITLE_CLASS}>{t(`mode.${mode}`)}</span>
              <span className={CHOICE_HINT_CLASS}>{t(`hint.${mode}`)}</span>
            </button>
          ))}

          {notice === null ? null : (
            <p role="alert" className={NOTICE_CLASS}>
              {notice}
            </p>
          )}

          <div className={STAFF_ROW_CLASS}>
            <div>
              <label htmlFor="staff-present" className={STAFF_LABEL_CLASS}>
                {t("staffPresent")}
              </label>
              <input
                id="staff-present"
                data-testid="shift-staff-present"
                className={STAFF_INPUT_CLASS}
                inputMode="numeric"
                value={staffPresent}
                onChange={(event) => {
                  setStaffPresent(digitsOnly(event.target.value));
                }}
              />
            </div>
            <div>
              <label htmlFor="staff-expected" className={STAFF_LABEL_CLASS}>
                {t("staffExpected")}
              </label>
              <input
                id="staff-expected"
                data-testid="shift-staff-expected"
                className={STAFF_INPUT_CLASS}
                inputMode="numeric"
                value={staffExpected}
                onChange={(event) => {
                  setStaffExpected(digitsOnly(event.target.value));
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
