"use client";

import { useState } from "react";
import type { ReactElement } from "react";

import { STATE_ACTION_CLASS } from "@/blocks/core/ui/StateScreen";

import { PIN_LENGTH } from "../pin";
import type { PairRefusal } from "./pair-action";

/**
 * Поле на четыре цифры и кнопка. Всё, что делает планшет один раз в жизни.
 *
 * Отказ показывается одним текстом на все случаи негодного кода: истёк, неверен, уже
 * съеден. Разные тексты рассказали бы подбору, какой код существует.
 */

const FIELD_CLASS =
  "font-num h-[56px] w-full max-w-[280px] rounded-[var(--r-control)] border border-[var(--line-control)] bg-surface text-center text-[length:var(--fs-num-hero)] leading-none font-medium tracking-[0.2em] text-ink focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--focus-soft)] focus:outline-none";

const NOTICE_CLASS =
  "w-full max-w-[280px] rounded-[var(--r-block)] border border-[var(--err-line)] bg-[var(--err-soft)] px-[var(--space-6)] py-[var(--space-5)] text-left text-[length:var(--fs-dense)] leading-[var(--lh-dense)] text-err";

export interface PairFormLabels {
  readonly field: string;
  readonly submit: string;
  /** Что сказать, когда до сервера не достучались вовсе. */
  readonly broken: string;
}

export function PairForm({
  labels,
  pair,
}: {
  readonly labels: PairFormLabels;
  /**
   * Серверное действие: при успехе оно само уводит на вкладку, а отказ отдаёт уже
   * переведённым — склонение минут решает словарь, а он есть у сервера.
   */
  readonly pair: (input: unknown) => Promise<PairRefusal>;
}): ReactElement {
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const send = async (): Promise<void> => {
    setSending(true);
    setNotice(null);
    try {
      // Сюда доходят только отказы: успех уводит на вкладку из самого действия.
      const refusal = await pair({ code });
      setNotice(refusal.notice);
      setCode("");
    } catch {
      // Сеть в пиццерии моргает, а перенаправление после успеха тоже приходит
      // исключением — но его бросает роутер уже после ухода со страницы.
      setNotice(labels.broken);
    } finally {
      setSending(false);
    }
  };

  return (
    <form
      data-testid="pair-form"
      className="flex w-full flex-col items-center gap-[var(--space-5)]"
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
    >
      {notice === null ? null : (
        <p data-testid="pair-notice" role="alert" className={NOTICE_CLASS}>
          {notice}
        </p>
      )}
      <input
        data-testid="pair-code"
        name="code"
        aria-label={labels.field}
        inputMode="numeric"
        autoComplete="one-time-code"
        // Клавиатура планшета обязана открыться цифрами: на кухне набирают одной рукой.
        pattern="[0-9]*"
        maxLength={PIN_LENGTH}
        autoFocus
        className={FIELD_CLASS}
        value={code}
        onChange={(event) => {
          // Всё, кроме цифр, отбрасывается на месте: код состоит только из них, и
          // подсказывать это отказом после отправки — лишний круг для человека у планшета.
          setCode(
            event.target.value.replaceAll(/\D/g, "").slice(0, PIN_LENGTH),
          );
        }}
      />
      <button
        type="submit"
        data-testid="pair-submit"
        className={`${STATE_ACTION_CLASS} disabled:cursor-not-allowed disabled:opacity-45`}
        disabled={sending || code.length !== PIN_LENGTH}
      >
        {labels.submit}
      </button>
    </form>
  );
}
