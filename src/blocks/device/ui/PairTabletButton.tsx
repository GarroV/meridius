"use client";

// Кнопка выпуска пина и сам код рядом с ней.
//
// Код живёт в состоянии компонента, а не в адресе — в отличие от окон подтверждения
// продукта (`core/ui/ConfirmDialog.tsx`). Причина в экране: редактор чек-листа держит
// НЕСОХРАНЁННЫЙ черновик в состоянии, и смена адреса ради окна снесла бы правки
// управляющего вместе с ним. Цена решения — код исчезает при обновлении страницы,
// но он и живёт пять минут, а выпустить новый стоит одно нажатие.
import { useState, useTransition } from "react";
import type { ReactElement } from "react";

import type { IssuePinOutcome } from "./issue-pin-action";

export interface PairTabletLabels {
  readonly action: string;
  readonly again: string;
  /** Подпись под кодом: сколько он живёт и что срабатывает один раз. */
  readonly hint: string;
  /** Что сделать на планшете: адрес страницы привязки уже подставлен. */
  readonly where: string;
  readonly failed: string;
}

const BUTTON_CLASS =
  "bg-surface text-ink flex h-[var(--control-h-sm)] w-full cursor-pointer items-center justify-center rounded-[var(--r-control)] border border-[var(--line-control)] px-[var(--space-5)] text-[length:var(--fs-dense)] font-medium hover:border-[var(--line-control-2)] hover:bg-[var(--surface-2)] disabled:cursor-not-allowed disabled:opacity-45";
// Код читают с экрана кабинета и набирают на планшете — поэтому он крупный, цифрами
// табличной ширины и с разрядкой: четыре цифры подряд иначе слипаются в одно число.
const CODE_CLASS =
  "text-ink text-center font-[family-name:var(--font-num)] text-[length:var(--fs-display)] leading-[var(--lh-display)] font-semibold tracking-[0.2em] tabular-nums";
const HINT_CLASS =
  "text-[length:var(--fs-meta)] leading-[var(--lh-meta)] text-[var(--ink-3)]";
const FAILED_CLASS =
  "text-[length:var(--fs-meta)] leading-[var(--lh-meta)] text-[var(--err)]";

export function PairTabletButton({
  issue,
  labels,
}: {
  /**
   * Серверное действие с уже привязанной станцией. Функция от сервера клиенту
   * передаётся ТОЛЬКО так — серверным действием; обычную функцию React отказался бы
   * сериализовать, и экран упал бы на отрисовке.
   */
  readonly issue: () => Promise<IssuePinOutcome>;
  readonly labels: PairTabletLabels;
}): ReactElement {
  const [code, setCode] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, startIssuing] = useTransition();

  function press(): void {
    startIssuing(async () => {
      try {
        const outcome = await issue();
        setCode(outcome.kind === "issued" ? outcome.code : null);
        setFailed(outcome.kind !== "issued");
      } catch {
        // Сеть отвалилась или действие упало: показываем отказ словами, а не молчим.
        // Молчание здесь читается как «код выпущен», и управляющий ждёт его на экране.
        setCode(null);
        setFailed(true);
      }
    });
  }

  return (
    <div className="flex flex-col gap-[var(--space-5)]">
      {code === null ? null : (
        <div className="flex flex-col gap-[var(--space-4)]">
          <div data-testid="pair-tablet-code" className={CODE_CLASS}>
            {code}
          </div>
          <p className={HINT_CLASS}>{labels.hint}</p>
          <p className={HINT_CLASS}>{labels.where}</p>
        </div>
      )}

      {failed ? (
        <p data-testid="pair-tablet-failed" className={FAILED_CLASS}>
          {labels.failed}
        </p>
      ) : null}

      <button
        type="button"
        data-testid="pair-tablet"
        className={BUTTON_CLASS}
        onClick={press}
        disabled={pending}
      >
        {code === null ? labels.action : labels.again}
      </button>
    </div>
  );
}
