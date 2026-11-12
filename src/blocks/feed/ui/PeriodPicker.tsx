import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import type { ReactElement } from "react";

import { formActionPath } from "@/blocks/core/base-path";
import { Icon } from "@/blocks/core/ui/Icon";

import type { DayRange, PeriodNav } from "../period";
import { PeriodDates } from "./PeriodDates";

/**
 * Один выбор периода на экран (D183 п.4, правило interface-logic п.3): календарь «с — по»
 * и стрелки ← →, без ряда кнопок «7 дней / месяц». Стрелка листает отрезок на его длину,
 * целый месяц — месяцем (`shiftRange`); вперёд — пока следующий отрезок не целиком в
 * будущем.
 *
 * Стрелки — ссылки, календарь — GET-форма, которая уходит сразу при выборе даты
 * (`PeriodDates`); без JavaScript остаётся кнопка. Период живёт в адресе, и ссылкой на
 * «сентябрь по Алматы» можно поделиться.
 */

// Стрелки и даты — одной неразрывной группой: на телефоне ← и → обязаны стоять по краям
// своих дат, а не разъезжаться по строкам.
const ROOT_CLASS = "flex flex-wrap items-center gap-[var(--space-3)]";
const GROUP_CLASS = "flex flex-nowrap items-center gap-[var(--space-3)]";
const FORM_ID = "period-form";
const ARROW_CLASS =
  "bg-surface text-ink inline-flex h-[var(--tap-min)] w-[var(--tap-min)] shrink-0 items-center justify-center rounded-[var(--r-control)] border border-[var(--line-control)] no-underline sm:h-[var(--control-h)] sm:w-[var(--control-h)] hover:border-[var(--line-control-2)] hover:bg-[var(--surface-2)] focus-visible:shadow-[0_0_0_3px_var(--focus-soft)] focus-visible:outline-none";
const ARROW_OFF_CLASS =
  "inline-flex h-[var(--tap-min)] w-[var(--tap-min)] shrink-0 cursor-not-allowed items-center justify-center rounded-[var(--r-control)] border border-[var(--line-control)] text-[var(--ink-3)] opacity-50 sm:h-[var(--control-h)] sm:w-[var(--control-h)]";
const APPLY_CLASS =
  "bg-surface text-ink inline-flex h-[var(--control-h)] items-center justify-center rounded-[var(--r-control)] border border-[var(--line-control)] px-[var(--space-6)] text-[length:var(--fs-body)] font-medium hover:border-[var(--line-control-2)] hover:bg-[var(--surface-2)]";

type Formatter = Awaited<ReturnType<typeof getFormatter>>;

/** Календарный день `ГГГГ-ММ-ДД` текстом по языку интерфейса: дата без часа, пояса нет. */
function dayText(day: string, format: Formatter): string {
  return format.dateTime(new Date(`${day}T00:00:00Z`), {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

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
  const format = await getFormatter();
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
        <PeriodDates
          formId={FORM_ID}
          action={formActionPath(action)}
          hidden={hidden}
          from={period.from}
          to={period.to}
          fromText={dayText(period.from, format)}
          toText={dayText(period.to, format)}
          fromLabel={t("from")}
          toLabel={t("to")}
        />
        {nav.next === null ? (
          <span
            className={ARROW_OFF_CLASS}
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
      {/* Без JavaScript даты сами не отправляются — тогда нужна кнопка. */}
      <noscript>
        <button
          type="submit"
          form={FORM_ID}
          className={APPLY_CLASS}
          data-testid="period-apply"
        >
          {t("apply")}
        </button>
      </noscript>
    </div>
  );
}
