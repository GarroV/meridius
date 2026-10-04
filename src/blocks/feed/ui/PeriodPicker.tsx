import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactElement } from "react";

import { formActionPath } from "@/blocks/core/base-path";
import { Icon } from "@/blocks/core/ui/Icon";

import type { DayRange, PeriodNav } from "../period";
import { FROM_PARAM, TO_PARAM } from "../view";

/**
 * Один выбор периода на экран (D183 п.4, правило interface-logic п.3): календарь «с — по»
 * и стрелки ← →, без ряда кнопок «7 дней / месяц». Стрелка листает отрезок на его длину,
 * целый месяц — месяцем (`shiftRange`); вперёд — пока следующий отрезок не целиком в
 * будущем.
 *
 * Без своего скрипта: стрелки — ссылки, календарь — GET-форма. Период живёт в адресе,
 * и ссылкой на «сентябрь по Алматы» можно поделиться.
 */

// Стрелки и даты — одной неразрывной группой, «Показать» переносится отдельно: на
// телефоне ← и → обязаны стоять по краям своих дат, а не разъезжаться по строкам.
const ROOT_CLASS = "flex flex-wrap items-center gap-[var(--space-3)]";
const GROUP_CLASS = "flex flex-nowrap items-center gap-[var(--space-3)]";
const FORM_CLASS = "flex flex-nowrap items-center gap-[var(--space-3)]";
const FORM_ID = "period-form";
const ARROW_CLASS =
  "bg-surface text-ink inline-flex h-[var(--control-h)] w-[var(--control-h)] shrink-0 items-center justify-center rounded-[var(--r-control)] border border-[var(--line-control)] no-underline hover:border-[var(--line-control-2)] hover:bg-[var(--surface-2)] focus-visible:shadow-[0_0_0_3px_var(--focus-soft)] focus-visible:outline-none";
const ARROW_OFF_CLASS =
  "inline-flex h-[var(--control-h)] w-[var(--control-h)] shrink-0 items-center justify-center rounded-[var(--r-control)] cursor-not-allowed border border-dashed border-[var(--line-control)] text-[var(--ink-3)]";
// На телефоне «с»/«по» читаются экранным диктором, а глазу между датами стоит тире:
// с подписями группа на 390 px шире колонки.
const LABEL_CLASS =
  "sr-only text-[length:var(--fs-meta)] text-[var(--ink-3)] sm:not-sr-only";
const DASH_CLASS = "text-[var(--ink-3)] sm:hidden";
const DATE_CLASS =
  "bg-surface text-ink h-[var(--control-h)] w-[9rem] min-w-0 rounded-[var(--r-control)] border border-[var(--line-control)] px-[var(--space-3)] sm:w-auto sm:px-[var(--space-4)] text-[length:var(--fs-body)] [font-variant-numeric:tabular-nums] focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--focus-soft)] focus:outline-none";
const APPLY_CLASS =
  "bg-surface text-ink inline-flex h-[var(--control-h)] items-center justify-center rounded-[var(--r-control)] border border-[var(--line-control)] px-[var(--space-6)] text-[length:var(--fs-body)] font-medium hover:border-[var(--line-control-2)] hover:bg-[var(--surface-2)]";

export interface PeriodPickerProps {
  readonly nav: PeriodNav;
  /** Адрес экрана с тем же выбором и другим периодом — для стрелок. */
  readonly hrefOf: (period: DayRange) => string;
  /** Куда шлёт календарь: адрес экрана без параметров. */
  readonly action: string;
  /** Остальной выбор экрана (страна, станция), который календарь обязан донести. */
  readonly hidden?: Readonly<Record<string, string>>;
}

export async function PeriodPicker({
  nav,
  hrefOf,
  action,
  hidden = {},
}: PeriodPickerProps): Promise<ReactElement> {
  const t = await getTranslations("feed.period");
  const { period } = nav;

  return (
    <div
      className={ROOT_CLASS}
      role="group"
      aria-label={t("label")}
      data-testid="period-picker"
    >
      <div className={GROUP_CLASS}>
        <Link
          href={hrefOf(nav.previous)}
          className={ARROW_CLASS}
          aria-label={t("previous")}
          title={t("previous")}
          data-testid="period-previous"
        >
          <Icon name="cleft" className="h-[18px] w-[18px]" />
        </Link>
        <form
          id={FORM_ID}
          method="get"
          action={formActionPath(action)}
          className={FORM_CLASS}
          data-testid="period-form"
        >
          {Object.entries(hidden).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          <label className={LABEL_CLASS} htmlFor="period-from">
            {t("from")}
          </label>
          <input
            key={`from-${period.from}`}
            id="period-from"
            type="date"
            name={FROM_PARAM}
            defaultValue={period.from}
            required
            className={DATE_CLASS}
            data-testid="period-from"
          />
          <span className={DASH_CLASS} aria-hidden="true">
            —
          </span>
          <label className={LABEL_CLASS} htmlFor="period-to">
            {t("to")}
          </label>
          <input
            key={`to-${period.to}`}
            id="period-to"
            type="date"
            name={TO_PARAM}
            defaultValue={period.to}
            required
            className={DATE_CLASS}
            data-testid="period-to"
          />
        </form>
        {nav.next === null ? (
          <span
            className={ARROW_OFF_CLASS}
            aria-disabled="true"
            title={t("nextNone")}
            data-testid="period-next"
          >
            <Icon name="cright" className="h-[18px] w-[18px]" />
            <span className="sr-only">{t("nextNone")}</span>
          </span>
        ) : (
          <Link
            href={hrefOf(nav.next)}
            className={ARROW_CLASS}
            aria-label={t("next")}
            title={t("next")}
            data-testid="period-next"
          >
            <Icon name="cright" className="h-[18px] w-[18px]" />
          </Link>
        )}
      </div>
      <button
        type="submit"
        form={FORM_ID}
        className={APPLY_CLASS}
        data-testid="period-apply"
      >
        {t("apply")}
      </button>
    </div>
  );
}
