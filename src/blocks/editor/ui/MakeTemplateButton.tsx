"use client";

import { useActionState } from "react";

import { Icon } from "@/blocks/core/ui/Icon";

import { submitMakeTemplate, type MakeTemplateState } from "../actions";
import type { MakeTemplateRefusal } from "../make-template";

const INITIAL: MakeTemplateState = { refused: null };

const ERROR_CLASS =
  "text-err m-0 max-w-[22rem] rounded-[var(--r-control)] border border-[var(--err-line)] bg-[var(--err-soft)] px-[var(--space-5)] py-[var(--space-4)] text-[length:var(--fs-dense)] leading-[var(--lh-dense)]";

/**
 * «Сделать шаблоном» (D174). Клиентский — ради `useActionState`: отказ сервера (D183 п.8 —
 * чек-лист тенанта партнёра; устаревшая вкладка) показывается словами рядом с кнопкой,
 * а не молчаливым возвратом на тот же экран.
 */
export function MakeTemplateButton({
  checklistId,
  label,
  refusals,
}: {
  readonly checklistId: string;
  readonly label: string;
  /** Тексты отказов на языке экрана — их подбирает серверная разметка. */
  readonly refusals: Readonly<Record<MakeTemplateRefusal, string>>;
}) {
  const [state, action, pending] = useActionState(submitMakeTemplate, INITIAL);

  return (
    <form action={action} className="flex items-center gap-[var(--space-4)]">
      <input type="hidden" name="checklistId" value={checklistId} />
      {state.refused === null ? null : (
        <p
          role="alert"
          data-testid="make-template-refused"
          className={ERROR_CLASS}
        >
          {refusals[state.refused]}
        </p>
      )}
      <button
        type="submit"
        data-testid="make-template"
        className="icon-btn"
        aria-label={label}
        title={label}
        aria-busy={pending}
      >
        <Icon name="spark" />
      </button>
    </form>
  );
}
