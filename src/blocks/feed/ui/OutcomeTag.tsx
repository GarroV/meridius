import { getTranslations } from "next-intl/server";
import type { ReactElement } from "react";

import type { Outcome } from "../outcome";

/**
 * Метка итога заполнения. Одна на оба экрана: лента и карточка обязаны называть один
 * и тот же итог одними и теми же словами, а две копии этой таблицы соответствий
 * разъедутся на первой же правке словаря.
 *
 * Цвет несёт смысл, а не украшение: красный — провален критичный пункт, жёлтый —
 * есть непройденные или неотвеченные, зелёный — выполнено всё. Оценок поведения
 * сотрудника здесь нет и не будет (D003).
 */

const TAG_BASE =
  "inline-flex items-center gap-[var(--space-2)] rounded-[var(--r-mark)] border px-[var(--space-4)] text-[length:var(--fs-micro)] font-semibold tracking-[var(--tracking-micro)] uppercase";
const TAG_OK = "border-[var(--ok-line)] bg-[var(--ok-soft)] text-[var(--ok)]";
const TAG_WARN =
  "border-[var(--warn-line)] bg-[var(--warn-soft)] text-[var(--warn-ink)]";
const TAG_ERR =
  "border-[var(--err-line)] bg-[var(--err-soft)] text-[var(--err)]";

const TAG_CLASS: Record<Outcome["kind"], string> = {
  ok: TAG_OK,
  unanswered: TAG_WARN,
  failed: TAG_WARN,
  criticalFailed: TAG_ERR,
};

/**
 * Метка ровно та, что на эталоне (`.tag`): высота 20 px и никакого переноса. Так она
 * стоит в таблице ленты — у таблицы своя прокрутка, и торчать метке некуда.
 */
const FIXED_CLASS = "h-[20px] whitespace-nowrap";
/**
 * Та же метка там, где ширину ей никто не гарантирует: переносится по словам и растёт
 * вниз, а не уезжает за край окна.
 *
 * Зачем нужна. В верхней полосе карточки заполнения на телефоне под действия остаётся
 * 103 px, а «1 критичный провален» занимает 179 — метка уходила за правый край окна
 * целиком (замер на 375 px: правый край метки 427 при ширине окна 375) и тащила
 * страницу вбок (T203). Перенос — единственное, чем метка помещается в отведённое:
 * обрезать её нельзя (итог заполнения — то, ради чего карточку и открывают), а
 * сокращать текст значило бы заводить второй словарь итогов.
 */
const FLEXIBLE_CLASS = "min-h-[20px] py-[1px] whitespace-normal";

export async function OutcomeTag({
  outcome,
  flexible = false,
}: {
  readonly outcome: Outcome;
  /** Метке не гарантирована её ширина — пусть переносится, а не уезжает за край. */
  readonly flexible?: boolean;
}): Promise<ReactElement> {
  const t = await getTranslations("feed.outcome");

  return (
    <span
      className={`${TAG_BASE} ${flexible ? FLEXIBLE_CLASS : FIXED_CLASS} ${TAG_CLASS[outcome.kind]}`}
      data-testid="outcome-tag"
      data-kind={outcome.kind}
    >
      {outcome.kind === "ok"
        ? t("ok")
        : t(outcome.kind, { count: outcome.count })}
    </span>
  );
}
